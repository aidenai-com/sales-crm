import uuid

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core import permissions
from app.models import Activity, Deal, Stage, User


def _with_relations(stmt: Select) -> Select:
    """
    Eager-loads everything `DealDetail` needs. Without this, serialising a list of deals
    would fire a handful of queries per row.
    """
    return stmt.options(
        joinedload(Deal.account),
        joinedload(Deal.partner),
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
        .group_by(Activity.deal_id)
    )
    result = await db.execute(stmt)
    return {deal_id: occurred_at for deal_id, occurred_at in result.all() if deal_id is not None}


async def count_in_stage(db: AsyncSession, stage_id: uuid.UUID) -> int:
    result = await db.execute(select(func.count()).select_from(Deal).where(Deal.stage_id == stage_id))
    return int(result.scalar_one())
