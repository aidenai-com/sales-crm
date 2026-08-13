import uuid
from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core import permissions
from app.models import Activity, ActivityKind, Deal, Stage, User
from app.services import health


def _with_relations(stmt: Select) -> Select:
    """
    Eager-loads everything `DealDetail` needs. Without this, serialising a list of deals
    would fire a handful of queries per row.
    """
    return stmt.options(
        joinedload(Deal.account),
        joinedload(Deal.lead),
        joinedload(Deal.stage),
        joinedload(Deal.pipeline),
        joinedload(Deal.owner),
    )


async def get(db: AsyncSession, deal_id: uuid.UUID) -> Deal | None:
    result = await db.execute(_with_relations(select(Deal)).where(Deal.id == deal_id))
    return result.unique().scalar_one_or_none()


async def list_all(
    db: AsyncSession,
    viewer: User,
    *,
    pipeline_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    lead_id: uuid.UUID | None = None,
    owner_id: uuid.UUID | None = None,
    stage_id: uuid.UUID | None = None,
    open_only: bool = False,
) -> list[Deal]:
    stmt = _with_relations(select(Deal)).join(Deal.stage).order_by(Stage.position, Deal.value.desc())

    if pipeline_id is not None:
        stmt = stmt.where(Deal.pipeline_template_id == pipeline_id)
    if account_id is not None:
        stmt = stmt.where(Deal.account_id == account_id)
    if lead_id is not None:
        stmt = stmt.where(Deal.lead_id == lead_id)
    if owner_id is not None:
        stmt = stmt.where(Deal.owner_id == owner_id)
    if stage_id is not None:
        stmt = stmt.where(Deal.stage_id == stage_id)
    if open_only:
        # Filtered on stage kind, not probability: a 0% Closed Lost stage is not open.
        stmt = stmt.where(Stage.kind == "open")

    result = await db.execute(permissions.scope_deals(stmt, viewer))
    return list(result.unique().scalars())


async def last_activity_map(db: AsyncSession) -> dict[uuid.UUID, object]:
    """
    Most recent activity timestamp per deal, in one grouped query.

    Health derivation needs this for every deal on a board, so doing it per deal would be
    a query per card.

    Deliberately unscoped: it returns timestamps keyed by deal id, and is only ever read
    for deals the caller has already been allowed to load. Nothing identifying leaks
    through a key the caller does not already hold.
    """
    stmt = (
        select(Activity.deal_id, func.max(Activity.occurred_at))
        .where(Activity.deal_id.is_not(None))
        # An admin's nudge is recorded on the timeline but is not work on the deal, so it must
        # not clear the staleness it was raised about. See health.NON_TOUCH_KINDS.
        .where(Activity.kind.notin_(health.NON_TOUCH_KINDS))
        .group_by(Activity.deal_id)
    )
    result = await db.execute(stmt)
    return {deal_id: occurred_at for deal_id, occurred_at in result.all() if deal_id is not None}


async def last_stage_change_map(db: AsyncSession) -> dict[uuid.UUID, datetime]:
    """
    When each deal last moved stage, in one grouped query.

    This is the evidence ageing rests on: the newest stage-change activity is the moment the deal arrived
    where it is now. Only the timestamp is needed, not which stage — a move is a move, and the deal already
    knows where it ended up.

    Deals absent from the result have never been moved through the API. That is not an error and not a zero;
    `services.ageing` treats it as "no arrival recorded" and falls back to a measure it can defend.

    Deliberately unscoped, like `last_activity_map`: it returns timestamps keyed by deal id and is only read
    for deals the caller was already allowed to load.
    """
    stmt = (
        select(Activity.deal_id, func.max(Activity.occurred_at))
        .where(Activity.deal_id.is_not(None), Activity.kind == ActivityKind.STAGE_CHANGE)
        .group_by(Activity.deal_id)
    )
    result = await db.execute(stmt)
    return {deal_id: moved_at for deal_id, moved_at in result.all() if deal_id is not None}


async def count_in_stage(db: AsyncSession, stage_id: uuid.UUID) -> int:
    result = await db.execute(select(func.count()).select_from(Deal).where(Deal.stage_id == stage_id))
    return int(result.scalar_one())
