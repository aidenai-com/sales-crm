"""
Object storage for deal deliverable attachments.

File bytes never pass through this application. Uploads and downloads both go directly
between the browser and the bucket using presigned URLs, and the API only ever handles the
metadata. Streaming a 25 MiB Word document through FastAPI would occupy an async worker for
the length of the transfer and hold the whole body in application memory, for no benefit —
the bucket is better at moving bytes than we are.

Written against the S3 API rather than any one provider, so MinIO locally and AWS S3,
Cloudflare R2 or Backblaze B2 in production are a configuration change, not a code change.
"""

import logging
import re
import uuid
from dataclasses import dataclass
from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger("app.storage")

#: What a deliverable may carry. The feedback asked for "excel, word, pdf, email msg, etc";
#: this is that list plus the obvious neighbours. An allowlist rather than a blocklist —
#: a blocklist is a promise to have thought of every dangerous type, which nobody can keep.
ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-outlook": ".msg",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}

#: Anything outside this becomes an underscore. Deliberately strict: the stored name only
#: has to be a valid key, while the name shown to a user comes from the database column.
_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")

MAX_FILENAME_LENGTH = 120


class StorageUnavailable(HTTPException):
    """
    Raised when the bucket cannot be reached.

    503 rather than 500: the application is fine, a dependency is not, and the distinction
    tells an operator where to look.
    """

    def __init__(self, detail: str = "File storage is unavailable") -> None:
        super().__init__(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)


@dataclass(frozen=True)
class PresignedUpload:
    url: str
    storage_key: str
    expires_in: int


def sanitize_filename(filename: str) -> str:
    """
    Reduce a client-supplied filename to something safe to put in a storage key.

    Path separators, `..`, control characters and Unicode tricks all collapse to
    underscores. A client-supplied key would otherwise be a path traversal into another
    deal's prefix — the reason the key is generated here and never accepted from a caller.
    """
    stem = filename.strip().replace("\\", "/").split("/")[-1]
    safe = _UNSAFE.sub("_", stem).strip("._-")
    if not safe:
        safe = "file"
    return safe[:MAX_FILENAME_LENGTH]


def build_storage_key(deal_id: uuid.UUID, deliverable_id: uuid.UUID, filename: str) -> str:
    """
    `deals/{deal}/{deliverable}/{uuid}-{name}`.

    The uuid segment is what makes two uploads called `proposal.pdf` two distinct objects
    rather than one silently overwriting the other.
    """
    return f"deals/{deal_id}/{deliverable_id}/{uuid.uuid4()}-{sanitize_filename(filename)}"


def validate_upload(content_type: str, size_bytes: int) -> None:
    """
    Checked before a presigned URL is issued, not after the upload.

    Rejecting at presign time means a rep learns their 200 MiB file is too large before
    spending two minutes transferring it.
    """
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"{content_type or 'That file type'} cannot be attached. "
                "Allowed: PDF, Word, Excel, PowerPoint, Outlook message, text, CSV, PNG, JPEG."
            ),
        )

    if size_bytes <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="An attachment must have a size greater than zero",
        )

    if size_bytes > settings.max_upload_bytes:
        limit_mb = settings.max_upload_bytes / 1_048_576
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Attachments are limited to {limit_mb:.0f} MB",
        )


@lru_cache
def _client():
    """
    One cached boto3 client for the process.

    Signature v4 is explicit because MinIO requires it, and `endpoint_url=None` is what
    boto3 wants for real AWS S3 — an empty string would be sent as a literal host.
    """
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
    )


def presign_upload(
    deal_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    filename: str,
    content_type: str,
    size_bytes: int,
) -> PresignedUpload:
    """Validate, then hand back a URL the browser can PUT the file to."""
    validate_upload(content_type, size_bytes)
    key = build_storage_key(deal_id, deliverable_id, filename)

    try:
        url = _client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.s3_bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=settings.s3_presign_expiry_seconds,
        )
    except (BotoCoreError, ClientError) as exc:
        logger.exception("Could not presign an upload for deal %s", deal_id)
        raise StorageUnavailable("Could not prepare the upload") from exc

    return PresignedUpload(
        url=url, storage_key=key, expires_in=settings.s3_presign_expiry_seconds
    )


def presign_download(storage_key: str, filename: str) -> str:
    """
    A short-lived GET URL.

    Presigned rather than a public object so authorization is re-checked by this API on
    every download. A permanently public URL would outlive the permission that produced it,
    and would be forwardable to anyone.

    `ResponseContentDisposition` makes the browser save the file under its original name
    rather than the uuid-prefixed storage key.
    """
    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.s3_bucket,
                "Key": storage_key,
                "ResponseContentDisposition": (
                    f'attachment; filename="{sanitize_filename(filename)}"'
                ),
            },
            ExpiresIn=settings.s3_presign_expiry_seconds,
        )
    except (BotoCoreError, ClientError) as exc:
        logger.exception("Could not presign a download for %s", storage_key)
        raise StorageUnavailable("Could not prepare the download") from exc


def head_object(storage_key: str) -> int | None:
    """
    The size of the object at `storage_key`, or None if there is nothing there.

    This is what stops a client registering an attachment row for a file it never
    uploaded. Without it the UI would list a document that 404s the moment anyone clicks it.
    """
    try:
        response = _client().head_object(Bucket=settings.s3_bucket, Key=storage_key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        logger.exception("Could not stat %s", storage_key)
        raise StorageUnavailable("Could not verify the uploaded file") from exc
    except BotoCoreError as exc:
        logger.exception("Could not stat %s", storage_key)
        raise StorageUnavailable("Could not verify the uploaded file") from exc

    return int(response["ContentLength"])


def delete_object(storage_key: str) -> None:
    """
    Best-effort removal.

    A failure here is logged and swallowed on purpose. The caller has already decided the
    attachment is gone; refusing to delete the database row because the bucket was briefly
    unreachable would leave a record pointing at a file the user believes they deleted.
    An orphaned object costs storage, which is the cheaper failure.
    """
    try:
        _client().delete_object(Bucket=settings.s3_bucket, Key=storage_key)
    except (BotoCoreError, ClientError):
        logger.warning("Could not delete %s from storage; row removed anyway", storage_key)
