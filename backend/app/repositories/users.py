import uuid
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Deal, Stage, User
from app.models.enums import StageKind


async def get(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    # Emails are stored as entered but matched case-insensitively: nobody expects
    # Admin@x.com and admin@x.com to be different accounts.
    result = await db.execute(select(User).where(User.email.ilike(email)))
    return result.scalar_one_or_none()


async def list_all(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.full_name))
    return list(result.scalars())


async def create(db: AsyncSession, user: User) -> User:
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def ownership(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, int, Decimal]:
    """
    What this person holds: `(accounts, open deals, open deal value)`.

    Open deals only. A won deal they closed last year is history and reassigning it would rewrite who
    closed it; what needs a new owner is the work still in flight.
    """
    accounts = select(func.count(Account.id)).where(Account.owner_id == user_id)
    open_deals = (
        select(func.count(Deal.id), func.coalesce(func.sum(Deal.value), 0))
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.owner_id == user_id, Stage.kind == StageKind.OPEN)
    )
    count, value = (await db.execute(open_deals)).one()
    return ((await db.execute(accounts)).scalar_one(), count, value)


async def reassign_ownership(
    db: AsyncSession, from_user_id: uuid.UUID, to_user_id: uuid.UUID
) -> tuple[int, int]:
    """
    Hands every account and open deal over. Returns `(accounts, deals)` moved.

    Two bulk UPDATEs rather than loading and reassigning row by row: a departing rep can hold hundreds
    of deals, and this runs inside the same transaction as the deactivation, so either the whole handover
    happens or the person stays active.

    Closed deals keep their owner deliberately — see `ownership`. Business units are not mentioned
    because they have no owner of their own; their stewardship follows the account, so moving the
    account moves them.
    """
    accounts = await db.execute(
        update(Account).where(Account.owner_id == from_user_id).values(owner_id=to_user_id)
    )
    open_deal_ids = (
        select(Deal.id)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.owner_id == from_user_id, Stage.kind == StageKind.OPEN)
        .scalar_subquery()
    )
    deals = await db.execute(
        update(Deal).where(Deal.id.in_(open_deal_ids)).values(owner_id=to_user_id)
    )
    return (accounts.rowcount or 0, deals.rowcount or 0)
