import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.core import permissions
from app.models import Deal, Stage
from app.repositories import accounts as accounts_repo
from app.repositories import deals as deals_repo
from app.schemas.common import Message
from app.schemas.crm import DealCreate, DealDetail, DealStageMove, DealUpdate
from app.services import pipelines as pipeline_service
from app.services.serializers import deal_detail

router = APIRouter(prefix="/deals", tags=["deals"])


async def _load_stage(db: DbSession, stage_id: uuid.UUID) -> Stage:
    stage = await db.get(Stage, stage_id)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    return stage


async def _detail(db: DbSession, deal: Deal) -> DealDetail:
    last_activity = await deals_repo.last_activity_map(db)
    return deal_detail(deal, last_activity)


async def _require_visible_deal(db: DbSession, user, deal_id: uuid.UUID) -> Deal:
    """
    Loads a deal the caller is allowed to see.

    A deal outside their scope is reported as missing rather than forbidden: a 403 would
    confirm the deal exists and that its id is valid.
    """
    deal = await deals_repo.get(db, deal_id)
    if deal is None or (not permissions.is_admin(user) and deal.owner_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


async def _reload_detail(db: DbSession, deal_id: uuid.UUID) -> DealDetail:
    """
    Re-reads a deal after a write, for the response.

    `expire_on_commit` is False on this session, so after a committed change to `stage_id`
    the already-loaded `stage` relationship still points at the previous stage — the write
    lands but the response describes the old state, lagging by exactly one call.

    `expire_all()` is not sufficient: eager loaders do not overwrite an already-loaded
    relationship on an instance that is still in the identity map. Detaching everything
    forces the next query to build the object from scratch.
    """
    db.expunge_all()
    deal = await deals_repo.get(db, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return await _detail(db, deal)


@router.get("", response_model=list[DealDetail])
async def list_deals(
    db: DbSession,
    user: CurrentUser,
    pipeline_id: uuid.UUID | None = Query(default=None),
    account_id: uuid.UUID | None = Query(default=None),
    lead_id: uuid.UUID | None = Query(default=None),
    owner_id: uuid.UUID | None = Query(default=None),
    stage_id: uuid.UUID | None = Query(default=None),
    open_only: bool = Query(default=False),
) -> list[DealDetail]:
    """Every deal the filters allow, each carrying its derived health and stage detail."""
    found = await deals_repo.list_all(
        db,
        user,
        pipeline_id=pipeline_id,
        account_id=account_id,
        lead_id=lead_id,
        owner_id=owner_id,
        stage_id=stage_id,
        open_only=open_only,
    )
    last_activity = await deals_repo.last_activity_map(db)
    return [deal_detail(deal, last_activity) for deal in found]


@router.get("/{deal_id}", response_model=DealDetail)
async def read_deal(db: DbSession, user: CurrentUser, deal_id: uuid.UUID) -> DealDetail:
    return await _detail(db, await _require_visible_deal(db, user, deal_id))


@router.post("", response_model=DealDetail, status_code=status.HTTP_201_CREATED)
async def create_deal(db: DbSession, user: CurrentUser, payload: DealCreate) -> DealDetail:
    # Reps may create deals, but only ones they own.
    permissions.require_own_assignment(user, payload.owner_id)

    if await accounts_repo.get(db, payload.account_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    stage = await _load_stage(db, payload.stage_id)
    if stage.pipeline_template_id != payload.pipeline_template_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That stage belongs to a different pipeline",
        )

    deal = Deal(**payload.model_dump())
    db.add(deal)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A deal cannot name the customer as its own partner",
        ) from exc

    return await _reload_detail(db, deal.id)


@router.patch("/{deal_id}", response_model=DealDetail)
async def update_deal(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, payload: DealUpdate
) -> DealDetail:
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "edit a deal")

    fields = payload.model_dump(exclude_unset=True)
    permissions.require_no_owner_change(user, deal.owner_id, fields.get("owner_id"))

    # A stage change through the generic patch is still a stage change: route it through
    # the service so it gets logged like a board move would.
    new_stage_id = fields.pop("stage_id", None)
    for field, value in fields.items():
        setattr(deal, field, value)

    if new_stage_id is not None and new_stage_id != deal.stage_id:
        stage = await _load_stage(db, new_stage_id)
        try:
            await pipeline_service.move_deal_to_stage(db, deal, stage, user.id)
        except pipeline_service.CrossPipelineMove as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="That stage belongs to a different pipeline",
            ) from exc

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A deal cannot name the customer as its own partner",
        ) from exc

    return await _reload_detail(db, deal_id)


@router.post("/{deal_id}/stage", response_model=DealDetail)
async def move_deal(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, payload: DealStageMove
) -> DealDetail:
    """
    Moves a deal to another stage and logs the change.

    No exit-criteria gating (spec 6.4): any stage can be reached from any other inside the
    same pipeline, which is what the board's drag-and-drop and move-to menu both call.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    # The core rule: a rep advances their own deals and nobody else's.
    permissions.require_deal_owner(user, deal, "move a deal")

    stage = await _load_stage(db, payload.stage_id)
    try:
        await pipeline_service.move_deal_to_stage(db, deal, stage, user.id)
    except pipeline_service.CrossPipelineMove as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That stage belongs to a different pipeline",
        ) from exc

    await db.commit()
    return await _reload_detail(db, deal_id)


@router.delete("/{deal_id}", response_model=Message)
async def delete_deal(db: DbSession, user: CurrentUser, deal_id: uuid.UUID) -> Message:
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "delete a deal")

    name = deal.name
    await db.delete(deal)
    await db.commit()
    return Message(detail=f"Deleted {name}")
