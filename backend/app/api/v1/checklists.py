"""
Deal deliverable checklists and their attachments.

Mounted under `/deals/{deal_id}` in its own module rather than growing `deals.py`: this is
seven endpoints with their own storage concerns, and the deal router is already the longest
in the API.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core import permissions
from app.models import Activity, Attachment, Deal, StageDeliverable
from app.models.enums import ActivityKind
from app.repositories import deals as deals_repo
from app.schemas.common import Message
from app.schemas.crm import DealDetail
from app.schemas.deliverable import (
    AttachmentConfirm,
    AttachmentDownload,
    AttachmentPresignRequest,
    AttachmentPresignResponse,
    AttachmentRead,
    CompletionResult,
    DealChecklist,
)
from app.services import checklist as checklist_service
from app.services import storage
from app.services.serializers import deal_detail

router = APIRouter(prefix="/deals/{deal_id}", tags=["checklists"])


async def _require_visible_deal(db: DbSession, user, deal_id: uuid.UUID) -> Deal:
    """
    Mirrors `deals._require_visible_deal`: a deal outside the caller's scope is reported as
    missing rather than forbidden, so a 403 cannot be used to confirm that an id is real.
    """
    deal = await deals_repo.get(db, deal_id)
    if deal is None or (not permissions.is_admin(user) and deal.owner_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


async def _require_deliverable(
    db: DbSession, deal: Deal, deliverable_id: uuid.UUID, *, must_be_current: bool
) -> StageDeliverable:
    deliverable = await checklist_service.get_deliverable(db, deliverable_id)
    if deliverable is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliverable not found")

    try:
        checklist_service.require_current_stage(deal, deliverable)
    except checklist_service.DeliverableNotOnDeal as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That deliverable belongs to a different pipeline",
        ) from exc
    except checklist_service.NotOnCurrentStage as exc:
        # 409 rather than 403: the caller has permission, the deal is simply not in the
        # stage that would make this write meaningful.
        if must_be_current:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A deliverable can only be changed while the deal is in its stage",
            ) from exc

    return deliverable


def _document_activity(deal: Deal, actor_id: uuid.UUID, summary: str) -> Activity:
    """
    A timeline entry for a document being filed or withdrawn.

    Named the deliverable it belongs to, not just the file. "Attached scan.pdf" tells a reader
    nothing they could act on; "Attached scan.pdf to Signed NDA" says which requirement now has
    evidence behind it, which is the only reason the entry is worth reading.

    Added to the session by the caller so it commits in the same transaction as the attachment
    row itself — a timeline that records an upload which then failed to save would be worse
    than one that recorded nothing.
    """
    return Activity(
        deal_id=deal.id,
        kind=ActivityKind.DOCUMENT,
        summary=summary,
        author_id=actor_id,
    )


@router.get("/checklist", response_model=DealChecklist)
async def read_checklist(db: DbSession, user: CurrentUser, deal_id: uuid.UUID) -> DealChecklist:
    """
    Every stage of the deal's pipeline with its deliverables, ticks and documents.

    All stages in one response so the client can browse documents across the whole pipeline
    without a request per stage.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    return await checklist_service.build_checklist(db, deal)


@router.put("/deliverables/{deliverable_id}/completion", response_model=CompletionResult)
async def complete_deliverable(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, deliverable_id: uuid.UUID
) -> CompletionResult:
    """
    Ticks a deliverable, advancing the deal if that completed the stage's checklist.

    PUT, not POST: ticking an already-ticked box should be a no-op, not a duplicate.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "update a deal's checklist")
    deliverable = await _require_deliverable(db, deal, deliverable_id, must_be_current=True)

    await checklist_service.complete(db, deal, deliverable, user.id)
    advanced_to, advanced_from = await checklist_service.try_advance(db, deal, user.id)

    # Read the stage's name before the commit expunges nothing but the session is reset
    # below; capturing it now keeps the response independent of reload ordering.
    advanced_name = advanced_to.name if advanced_to else None
    advanced_id = advanced_to.id if advanced_to else None

    await db.commit()

    # `expire_on_commit` is False on this session, so a deal whose `stage_id` just changed
    # still carries its previous `stage` relationship. Detaching forces a fresh read — the
    # same reason `deals._reload_detail` does it.
    db.expunge_all()
    reloaded = await deals_repo.get(db, deal_id)
    if reloaded is None:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")

    return CompletionResult(
        checklist=await checklist_service.build_checklist(db, reloaded),
        advanced_to_stage_id=advanced_id,
        advanced_to_stage_name=advanced_name,
        advanced_from_stage_id=advanced_from,
    )


@router.delete("/deliverables/{deliverable_id}/completion", response_model=DealChecklist)
async def uncomplete_deliverable(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, deliverable_id: uuid.UUID
) -> DealChecklist:
    """
    Unticks a deliverable.

    Does not move the deal back if it had advanced — see `checklist.uncomplete`. This is why
    the response is a plain checklist rather than a `CompletionResult`: there is never a
    stage change to report.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "update a deal's checklist")
    deliverable = await _require_deliverable(db, deal, deliverable_id, must_be_current=True)

    await checklist_service.uncomplete(db, deal, deliverable)
    await db.commit()
    return await checklist_service.build_checklist(db, deal)


# --- Attachments --------------------------------------------------------------


@router.post(
    "/deliverables/{deliverable_id}/attachments/presign",
    response_model=AttachmentPresignResponse,
)
async def presign_attachment(
    db: DbSession,
    user: CurrentUser,
    deal_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    payload: AttachmentPresignRequest,
) -> AttachmentPresignResponse:
    """
    Step one of an upload: validate, then return a URL the browser PUTs the file to.

    File bytes never pass through this API. See `app.services.storage`.

    Unlike ticking a box, filing a document is allowed on any stage — a rep chasing up
    paperwork for a stage the deal has already left is doing their job, not breaking a rule.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "attach a document to a deal")
    deliverable = await _require_deliverable(db, deal, deliverable_id, must_be_current=False)

    presigned = storage.presign_upload(
        deal_id=deal.id,
        deliverable_id=deliverable.id,
        filename=payload.filename,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
    )
    return AttachmentPresignResponse(
        upload_url=presigned.url,
        storage_key=presigned.storage_key,
        expires_in=presigned.expires_in,
    )


@router.post(
    "/deliverables/{deliverable_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def confirm_attachment(
    db: DbSession,
    user: CurrentUser,
    deal_id: uuid.UUID,
    deliverable_id: uuid.UUID,
    payload: AttachmentConfirm,
) -> AttachmentRead:
    """
    Step two: record the upload, after checking the object is really there.

    The verification is the point. Without it a client could register a row for a file it
    never uploaded, and the UI would list a document that 404s the moment anyone clicked it.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "attach a document to a deal")
    deliverable = await _require_deliverable(db, deal, deliverable_id, must_be_current=False)

    # The key must be one this API generated for this deal and this deliverable. A caller
    # supplying somebody else's key would otherwise file their document against this deal.
    expected_prefix = f"deals/{deal.id}/{deliverable.id}/"
    if not payload.storage_key.startswith(expected_prefix):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That storage key does not belong to this deliverable",
        )

    storage.validate_upload(payload.content_type, payload.size_bytes)

    actual_size = storage.head_object(payload.storage_key)
    if actual_size is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No uploaded file was found. Please try the upload again.",
        )
    if actual_size != payload.size_bytes:
        # A mismatch means the file that landed is not the file that was validated, so the
        # size limit was never really applied. Reject and remove it.
        storage.delete_object(payload.storage_key)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The uploaded file did not match the size that was declared",
        )

    attachment = Attachment(
        deal_id=deal.id,
        stage_deliverable_id=deliverable.id,
        filename=payload.filename,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        storage_key=payload.storage_key,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.add(
        _document_activity(
            deal,
            user.id,
            f"Attached {attachment.filename} to “{deliverable.text}”",
        )
    )
    await db.commit()
    await db.refresh(attachment)

    return AttachmentRead(
        id=attachment.id,
        deal_id=attachment.deal_id,
        stage_deliverable_id=attachment.stage_deliverable_id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        uploaded_by_id=attachment.uploaded_by_id,
        uploaded_by_name=user.full_name,
        created_at=attachment.created_at,
    )


async def _require_attachment(db: DbSession, deal: Deal, attachment_id: uuid.UUID) -> Attachment:
    result = await db.execute(
        select(Attachment).where(Attachment.id == attachment_id, Attachment.deal_id == deal.id)
    )
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    return attachment


@router.get("/attachments/{attachment_id}/download", response_model=AttachmentDownload)
async def download_attachment(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, attachment_id: uuid.UUID
) -> AttachmentDownload:
    """
    A short-lived presigned URL.

    Presigned per request rather than a permanent public object, so permission is re-checked
    every time. A permanent URL would outlive the permission that produced it and be
    forwardable to anyone.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    attachment = await _require_attachment(db, deal, attachment_id)

    return AttachmentDownload(
        download_url=storage.presign_download(attachment.storage_key, attachment.filename),
        expires_in=900,
    )


@router.delete("/attachments/{attachment_id}", response_model=Message)
async def delete_attachment(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, attachment_id: uuid.UUID
) -> Message:
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "remove a document from a deal")
    attachment = await _require_attachment(db, deal, attachment_id)

    filename = attachment.filename
    key = attachment.storage_key

    # Read before the delete: afterwards the row is gone and with it the only route to the
    # deliverable this file was filed against.
    deliverable = await checklist_service.get_deliverable(db, attachment.stage_deliverable_id)
    where = f" from “{deliverable.text}”" if deliverable is not None else ""

    await db.delete(attachment)
    db.add(_document_activity(deal, user.id, f"Removed {filename}{where}"))
    await db.commit()
    # After the row is gone, not before. A failed commit would otherwise leave a row pointing
    # at an object that no longer exists — the one inconsistency a user would actually notice.
    storage.delete_object(key)

    return Message(detail=f"Removed {filename}")


@router.get("/checklist/deal", response_model=DealDetail)
async def read_deal_after_checklist(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID
) -> DealDetail:
    """
    The deal as it stands now.

    Exists so a client that has just auto-advanced can refresh one deal rather than refetch
    a whole board.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    last_activity = await deals_repo.last_activity_map(db)
    return deal_detail(deal, last_activity)
