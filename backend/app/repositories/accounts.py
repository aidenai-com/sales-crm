import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import permissions
from app.models import Account, Lead, User


async def get(db: AsyncSession, account_id: uuid.UUID) -> Account | None:
    return await db.get(Account, account_id)


async def list_all(
    db: AsyncSession, viewer: User, *, include_partners: bool = True
) -> list[Account]:
    stmt = select(Account).options(selectinload(Account.owner)).order_by(Account.name)
    if not include_partners:
        stmt = stmt.where(Account.is_partner.is_(False))
    result = await db.execute(permissions.scope_accounts(stmt, viewer))
    return list(result.scalars())


async def list_with_leads(
    db: AsyncSession, viewer: User, *, include_partners: bool = False
) -> list[Account]:
    """
    Loads the account tree's top two levels in two queries rather than N+1.

    Partner accounts are excluded by default: a partner appears on partner-led deals via
    the Partner field, not as a customer node of its own, so the tree keeps answering one
    question — who our customers are and what is in flight with them.
    """
    stmt = (
        select(Account)
        .options(selectinload(Account.owner), selectinload(Account.leads).selectinload(Lead.owner))
        .order_by(Account.name)
    )
    if not include_partners:
        stmt = stmt.where(Account.is_partner.is_(False))
    result = await db.execute(permissions.scope_accounts(stmt, viewer))
    return list(result.scalars().unique())


async def get_lead(db: AsyncSession, lead_id: uuid.UUID) -> Lead | None:
    return await db.get(Lead, lead_id)


async def list_leads(
    db: AsyncSession, viewer: User, *, account_id: uuid.UUID | None = None
) -> list[Lead]:
    stmt = select(Lead).options(selectinload(Lead.owner)).order_by(Lead.business_unit)
    if account_id is not None:
        stmt = stmt.where(Lead.account_id == account_id)
    result = await db.execute(permissions.scope_leads(stmt, viewer))
    return list(result.scalars())
