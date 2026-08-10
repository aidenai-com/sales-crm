import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import ORMModel, PayloadModel


class AttachmentRead(ORMModel):
    id: uuid.UUID
    deal_id: uuid.UUID
    stage_deliverable_id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by_id: uuid.UUID
    uploaded_by_name: str
    created_at: datetime
    # Deliberately absent: `storage_key`. It is an internal address, and publishing it would
    # invite a client to construct its own requests against the bucket. Downloads go through
    # the API, which presigns a short-lived URL after checking permission.


class AttachmentPresignRequest(PayloadModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=160)
    #: Sent up front so an oversized file is refused before the transfer, not after it.
    size_bytes: int = Field(gt=0)


class AttachmentPresignResponse(ORMModel):
    upload_url: str
    storage_key: str
    expires_in: int


class AttachmentConfirm(PayloadModel):
    """
    Sent after the browser has PUT the bytes.

    `storage_key` must be one this API issued in a presign response; the endpoint verifies
    an object actually exists there and that its size matches, so a client cannot register a
    row for a file it never uploaded.
    """

    storage_key: str = Field(min_length=1, max_length=512)
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=160)
    size_bytes: int = Field(gt=0)


class AttachmentDownload(ORMModel):
    download_url: str
    expires_in: int


class DeliverableStatus(ORMModel):
    """One deliverable on one deal: its text, whether it is ticked, and what is filed."""

    id: uuid.UUID
    text: str
    position: int
    complete: bool
    #: Null when not complete.
    completed_at: datetime | None
    completed_by_id: uuid.UUID | None
    completed_by_name: str | None
    attachments: list[AttachmentRead]


class StageChecklist(ORMModel):
    """
    A deal's checklist for one stage.

    `is_current_stage` drives whether the client offers checkboxes at all. Ticking a
    deliverable on a stage the deal has already left has no defensible meaning and would
    make the auto-advance rule ambiguous, so the API refuses it and the UI should not ask.
    """

    stage_id: uuid.UUID
    stage_name: str
    stage_short_name: str
    stage_color: str
    stage_position: int
    is_current_stage: bool
    deliverables: list[DeliverableStatus]
    complete_count: int
    total_count: int


class DealChecklist(ORMModel):
    """Every stage of the deal's pipeline, so the client can browse documents across all."""

    deal_id: uuid.UUID
    current_stage_id: uuid.UUID
    stages: list[StageChecklist]


class CompletionResult(ORMModel):
    """
    The outcome of ticking a box.

    `advanced_to_stage_id` is set only when that tick completed the stage's checklist and
    moved the deal. The client needs to know, both to re-render and to offer Undo, and
    inferring it from a stage change in a later refetch would be a guess.
    """

    checklist: DealChecklist
    advanced_to_stage_id: uuid.UUID | None
    advanced_to_stage_name: str | None
    advanced_from_stage_id: uuid.UUID | None


__all__ = [
    "AttachmentConfirm",
    "AttachmentDownload",
    "AttachmentPresignRequest",
    "AttachmentPresignResponse",
    "AttachmentRead",
    "CompletionResult",
    "DealChecklist",
    "DeliverableStatus",
    "StageChecklist",
]
