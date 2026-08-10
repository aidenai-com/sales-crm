"""
Attachment validation, storage keys, and the confirm step's verification.

The bucket is stubbed. What matters here is the API's own guarantees — that a bad type or an
oversized file is refused before any transfer, that a client cannot claim somebody else's
storage key, and that a row is never written for a file that is not really there. None of
those depend on MinIO actually running, and requiring it would make the suite need a second
service to say anything at all.
"""

import uuid

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.services import storage

API = settings.api_v1_prefix
pytestmark = pytest.mark.asyncio

PDF = "application/pdf"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class FakeBucket:
    """Records what was asked of storage and answers as a working bucket would."""

    def __init__(self) -> None:
        self.objects: dict[str, int] = {}
        self.deleted: list[str] = []

    def presign_put(self, deal_id, deliverable_id, filename, content_type, size_bytes):
        storage.validate_upload(content_type, size_bytes)
        key = storage.build_storage_key(deal_id, deliverable_id, filename)
        # Stand in for the browser completing its PUT.
        self.objects[key] = size_bytes
        return storage.PresignedUpload(url=f"https://bucket.invalid/{key}", storage_key=key, expires_in=900)

    def head(self, key: str) -> int | None:
        return self.objects.get(key)

    def delete(self, key: str) -> None:
        self.deleted.append(key)
        self.objects.pop(key, None)


@pytest.fixture
def bucket(monkeypatch) -> FakeBucket:
    fake = FakeBucket()
    monkeypatch.setattr(storage, "presign_upload", fake.presign_put)
    monkeypatch.setattr(storage, "head_object", fake.head)
    monkeypatch.setattr(storage, "delete_object", fake.delete)
    monkeypatch.setattr(storage, "presign_download", lambda key, filename: f"https://bucket.invalid/{key}")
    return fake


def _presign_url(data) -> str:
    return (
        f"{API}/deals/{data['priya_deal'].id}"
        f"/deliverables/{data['first_deliverable'].id}/attachments/presign"
    )


def _confirm_url(data) -> str:
    return (
        f"{API}/deals/{data['priya_deal'].id}"
        f"/deliverables/{data['first_deliverable'].id}/attachments"
    )


# --- Validation, before any bytes move ---------------------------------------


async def test_presign_refuses_a_disallowed_type(client: AsyncClient, as_priya, data, bucket):
    response = await client.post(
        _presign_url(data),
        headers=as_priya,
        json={"filename": "payload.exe", "contentType": "application/x-msdownload", "sizeBytes": 1024},
    )
    assert response.status_code == 415


async def test_presign_refuses_an_oversized_file_before_the_transfer(
    client: AsyncClient, as_priya, data, bucket
):
    """A rep should learn their 200 MB file is too large before spending two minutes on it."""
    response = await client.post(
        _presign_url(data),
        headers=as_priya,
        json={
            "filename": "huge.pdf",
            "contentType": PDF,
            "sizeBytes": settings.max_upload_bytes + 1,
        },
    )
    assert response.status_code == 413


async def test_presign_accepts_the_office_formats_the_feedback_named(
    client: AsyncClient, as_priya, data, bucket
):
    for filename, content_type in [
        ("proposal.pdf", PDF),
        ("pricing.xlsx", XLSX),
        ("thread.msg", "application/vnd.ms-outlook"),
        ("sow.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ]:
        response = await client.post(
            _presign_url(data),
            headers=as_priya,
            json={"filename": filename, "contentType": content_type, "sizeBytes": 2048},
        )
        assert response.status_code == 200, f"{filename} was refused"


# --- Storage keys -------------------------------------------------------------


async def test_storage_keys_are_sanitized_against_traversal():
    key = storage.build_storage_key(uuid.uuid4(), uuid.uuid4(), "../../../etc/passwd")
    assert ".." not in key
    assert key.count("/") == 3  # deals/{deal}/{deliverable}/{file}


async def test_two_uploads_of_the_same_name_are_two_objects():
    deal, deliverable = uuid.uuid4(), uuid.uuid4()
    first = storage.build_storage_key(deal, deliverable, "proposal.pdf")
    second = storage.build_storage_key(deal, deliverable, "proposal.pdf")
    assert first != second


async def test_a_filename_of_only_unsafe_characters_still_produces_a_key():
    assert storage.sanitize_filename("///") == "file"


# --- Confirm ------------------------------------------------------------------


async def test_the_full_upload_flow_records_the_attachment(
    client: AsyncClient, as_priya, data, bucket
):
    presigned = await client.post(
        _presign_url(data),
        headers=as_priya,
        json={"filename": "proposal.pdf", "contentType": PDF, "sizeBytes": 4096},
    )
    key = presigned.json()["storageKey"]

    confirmed = await client.post(
        _confirm_url(data),
        headers=as_priya,
        json={"storageKey": key, "filename": "proposal.pdf", "contentType": PDF, "sizeBytes": 4096},
    )
    assert confirmed.status_code == 201
    assert confirmed.json()["filename"] == "proposal.pdf"
    assert confirmed.json()["uploadedByName"] == "Priya Rep"

    checklist = await client.get(f"{API}/deals/{data['priya_deal'].id}/checklist", headers=as_priya)
    stage = next(
        s for s in checklist.json()["stages"] if s["stageId"] == str(data["open_stage"].id)
    )
    assert len(stage["deliverables"][0]["attachments"]) == 1


async def test_confirm_rejects_a_key_with_no_object_behind_it(
    client: AsyncClient, as_priya, data, bucket
):
    """
    Without this the UI would list a document that 404s the moment anybody clicked it.
    """
    fabricated = f"deals/{data['priya_deal'].id}/{data['first_deliverable'].id}/nothing-here.pdf"
    response = await client.post(
        _confirm_url(data),
        headers=as_priya,
        json={"storageKey": fabricated, "filename": "ghost.pdf", "contentType": PDF, "sizeBytes": 10},
    )
    assert response.status_code == 422


async def test_confirm_rejects_a_key_belonging_to_another_deliverable(
    client: AsyncClient, as_priya, data, bucket
):
    """Otherwise a caller could file somebody else's document against this deal."""
    foreign = f"deals/{data['marcus_deal'].id}/{data['second_deliverable'].id}/x-stolen.pdf"
    bucket.objects[foreign] = 100

    response = await client.post(
        _confirm_url(data),
        headers=as_priya,
        json={"storageKey": foreign, "filename": "stolen.pdf", "contentType": PDF, "sizeBytes": 100},
    )
    assert response.status_code == 422


async def test_confirm_rejects_a_size_that_does_not_match_what_landed(
    client: AsyncClient, as_priya, data, bucket
):
    """
    A mismatch means the file that arrived is not the file that was validated, so the size
    limit was never really applied.
    """
    presigned = await client.post(
        _presign_url(data),
        headers=as_priya,
        json={"filename": "small.pdf", "contentType": PDF, "sizeBytes": 100},
    )
    key = presigned.json()["storageKey"]
    bucket.objects[key] = 999_999  # Something much larger actually landed.

    response = await client.post(
        _confirm_url(data),
        headers=as_priya,
        json={"storageKey": key, "filename": "small.pdf", "contentType": PDF, "sizeBytes": 100},
    )
    assert response.status_code == 422
    # And the rejected object is cleaned up rather than left in the bucket.
    assert key in bucket.deleted


# --- Permissions and lifecycle -----------------------------------------------


async def test_a_rep_cannot_attach_to_another_reps_deal(client: AsyncClient, as_priya, data, bucket):
    response = await client.post(
        f"{API}/deals/{data['marcus_deal'].id}"
        f"/deliverables/{data['first_deliverable'].id}/attachments/presign",
        headers=as_priya,
        json={"filename": "nosy.pdf", "contentType": PDF, "sizeBytes": 10},
    )
    assert response.status_code == 404


async def test_documents_can_be_filed_on_a_stage_the_deal_has_left(
    client: AsyncClient, as_priya, session, data, bucket
):
    """
    Unlike ticking a box, this is allowed. A rep chasing up paperwork for an earlier stage is
    doing their job, not breaking a rule.
    """
    data["priya_deal"].stage_id = data["second_stage"].id
    await session.commit()

    response = await client.post(
        _presign_url(data),
        headers=as_priya,
        json={"filename": "late-paperwork.pdf", "contentType": PDF, "sizeBytes": 512},
    )
    assert response.status_code == 200


async def test_deleting_an_attachment_removes_the_row_and_the_object(
    client: AsyncClient, as_priya, data, bucket
):
    presigned = await client.post(
        _presign_url(data),
        headers=as_priya,
        json={"filename": "temp.pdf", "contentType": PDF, "sizeBytes": 64},
    )
    key = presigned.json()["storageKey"]
    created = await client.post(
        _confirm_url(data),
        headers=as_priya,
        json={"storageKey": key, "filename": "temp.pdf", "contentType": PDF, "sizeBytes": 64},
    )
    attachment_id = created.json()["id"]

    deleted = await client.delete(
        f"{API}/deals/{data['priya_deal'].id}/attachments/{attachment_id}", headers=as_priya
    )
    assert deleted.status_code == 200
    assert key in bucket.deleted

    checklist = await client.get(f"{API}/deals/{data['priya_deal'].id}/checklist", headers=as_priya)
    stage = next(
        s for s in checklist.json()["stages"] if s["stageId"] == str(data["open_stage"].id)
    )
    assert stage["deliverables"][0]["attachments"] == []


async def test_download_returns_a_presigned_url_not_the_storage_key(
    client: AsyncClient, as_priya, data, bucket
):
    presigned = await client.post(
        _presign_url(data),
        headers=as_priya,
        json={"filename": "read-me.pdf", "contentType": PDF, "sizeBytes": 32},
    )
    key = presigned.json()["storageKey"]
    created = await client.post(
        _confirm_url(data),
        headers=as_priya,
        json={"storageKey": key, "filename": "read-me.pdf", "contentType": PDF, "sizeBytes": 32},
    )

    # The attachment payload never carries the storage key — it is an internal address.
    assert "storageKey" not in created.json()

    response = await client.get(
        f"{API}/deals/{data['priya_deal'].id}/attachments/{created.json()['id']}/download",
        headers=as_priya,
    )
    assert response.status_code == 200
    assert response.json()["downloadUrl"].startswith("https://bucket.invalid/")


# --- Documents in the timeline -------------------------------------------------
#
# Filing a document is work somebody did on the deal, so it belongs in the timeline beside the
# calls and the emails. These pin that the entries are written, that they name the deliverable
# rather than only the file, and that a rejected upload leaves none behind.


async def _upload(client: AsyncClient, headers, data, filename: str, size: int = 512) -> dict:
    presigned = await client.post(
        _presign_url(data),
        headers=headers,
        json={"filename": filename, "contentType": PDF, "sizeBytes": size},
    )
    confirmed = await client.post(
        _confirm_url(data),
        headers=headers,
        json={
            "storageKey": presigned.json()["storageKey"],
            "filename": filename,
            "contentType": PDF,
            "sizeBytes": size,
        },
    )
    assert confirmed.status_code == 201
    return confirmed.json()


async def _deal_activities(client: AsyncClient, headers, data) -> list[dict]:
    response = await client.get(
        f"{API}/activities",
        headers=headers,
        params={"subjectType": "deal", "subjectId": str(data["priya_deal"].id)},
    )
    assert response.status_code == 200
    return response.json()


async def test_an_upload_is_recorded_as_a_document_activity(
    client: AsyncClient, as_priya, data, bucket
):
    await _upload(client, as_priya, data, "proposal.pdf")

    documents = [a for a in await _deal_activities(client, as_priya, data) if a["kind"] == "document"]
    assert len(documents) == 1
    # The deliverable is named, not just the file: "Attached scan.pdf" alone tells a reader
    # nothing about which requirement now has evidence behind it.
    assert "proposal.pdf" in documents[0]["summary"]
    assert data["first_deliverable"].text in documents[0]["summary"]
    assert documents[0]["authorId"] == str(data["priya"].id)


async def test_a_removal_is_recorded_too(client: AsyncClient, as_priya, data, bucket):
    """A document leaving the deal is as much a fact about it as one arriving."""
    created = await _upload(client, as_priya, data, "withdrawn.pdf")

    deleted = await client.delete(
        f"{API}/deals/{data['priya_deal'].id}/attachments/{created['id']}", headers=as_priya
    )
    assert deleted.status_code == 200

    documents = [a for a in await _deal_activities(client, as_priya, data) if a["kind"] == "document"]
    summaries = " | ".join(a["summary"] for a in documents)
    assert len(documents) == 2
    assert "Removed withdrawn.pdf" in summaries


async def test_a_rejected_upload_writes_no_activity(client: AsyncClient, as_priya, data, bucket):
    """
    The activity and the attachment row commit together or not at all. A timeline claiming a
    document was filed when the row was refused is worse than one that says nothing.
    """
    fabricated = f"deals/{data['priya_deal'].id}/{data['first_deliverable'].id}/ghost.pdf"
    response = await client.post(
        _confirm_url(data),
        headers=as_priya,
        json={"storageKey": fabricated, "filename": "ghost.pdf", "contentType": PDF, "sizeBytes": 10},
    )
    assert response.status_code == 422

    documents = [a for a in await _deal_activities(client, as_priya, data) if a["kind"] == "document"]
    assert documents == []


async def test_a_document_counts_as_a_touch(client: AsyncClient, as_priya, data, bucket):
    """
    Filing a document is progress on the deal, so it resets the staleness clock exactly as a
    call does. Pinned here because the touch queries read every activity kind without
    filtering — the behaviour is easy to change by accident from the other direction.
    """
    deal_url = f"{API}/deals/{data['priya_deal'].id}"

    before = (await client.get(deal_url, headers=as_priya)).json()["lastActivityAt"]

    await _upload(client, as_priya, data, "evidence.pdf")

    after = (await client.get(deal_url, headers=as_priya)).json()["lastActivityAt"]
    assert after is not None
    assert after != before, "the upload did not register as a touch on the deal"
