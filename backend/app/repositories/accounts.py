import uuid

from sqlalchemy import case, func, or_, select
from sqlalchemy import false as sa_false
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import permissions
from app.models import Account, Lead, User
from app.services import account_names


async def get(db: AsyncSession, account_id: uuid.UUID) -> Account | None:
    return await db.get(Account, account_id)


async def list_all(db: AsyncSession, viewer: User) -> list[Account]:
    stmt = select(Account).options(selectinload(Account.owner)).order_by(Account.name)
    result = await db.execute(permissions.scope_accounts(stmt, viewer))
    return list(result.scalars())


async def list_with_leads(db: AsyncSession, viewer: User) -> list[Account]:
    """
    Loads the account tree's top two levels in two queries rather than N+1.

    Every account appears. This used to exclude ones flagged `is_partner`, on the grounds that a partner
    belonged on deals rather than as a node of its own — but that flag is gone, and with it the idea that
    a company is permanently one thing or the other. An account that has only ever been a partner simply
    shows up with no deals of its own, which is true and is what the tree is for.
    """
    stmt = (
        select(Account)
        .options(selectinload(Account.owner), selectinload(Account.leads))
        .order_by(Account.name)
    )
    result = await db.execute(permissions.scope_accounts(stmt, viewer))
    return list(result.scalars().unique())


async def get_lead(db: AsyncSession, lead_id: uuid.UUID) -> Lead | None:
    return await db.get(Lead, lead_id)


async def list_leads(
    db: AsyncSession, viewer: User, *, account_id: uuid.UUID | None = None
) -> list[Lead]:
    # The account's owner, loaded through the account: a business unit has no owner of its own, and
    # `require_lead_owner` and the tree's `owner_name` both read it from one table up.
    stmt = (
        select(Lead)
        .options(selectinload(Lead.account).selectinload(Account.owner))
        .order_by(Lead.business_unit)
    )
    if account_id is not None:
        stmt = stmt.where(Lead.account_id == account_id)
    result = await db.execute(permissions.scope_leads(stmt, viewer))
    return list(result.scalars().unique())


async def find_similar(
    db: AsyncSession, name: str, *, limit: int = 8, threshold: float = 0.3
) -> list[tuple[Account, float, str]]:
    """
    Accounts that might already be the company someone is about to create.

    Four routes in, because no single one catches every way a duplicate is spelled:

      exact       the name as typed already exists
      normalized  `CITI` against `Citi Inc.` — same company once legal forms are stripped
      prefix      `cit` against `Citibank` — what makes the field useful while still being typed
      fuzzy       `Citi Bank` against `Citibank` — a trigram match, where the difference is a space

    Trigram similarity alone is unreliable on three- and four-character strings, which is exactly the
    length people type first, so the prefix route carries the early keystrokes and the trigram route
    takes over once there is enough to compare.

    Returns each match with a score and the route that found it, so the UI can say *why* a row is on
    screen. Ordered by route strength, then by score: an exact duplicate must never sit below a fuzzy
    one.

    No permission scoping. Every account is visible to every rep, so there is nothing to narrow —
    and a scoped duplicate check would defeat its own purpose.
    """
    typed = name.strip()
    key = account_names.normalize(typed)
    if not typed:
        return []

    similarity = func.similarity(Account.name_normalized, key)
    # `key` may be empty for a name made only of legal tokens ("Ltd"). Comparing against "" would
    # match every account, so the normalized and fuzzy routes are skipped and only the raw name is
    # searched.
    routes = [
        func.lower(Account.name) == typed.lower(),
        Account.name_normalized == key if key else sa_false(),
        Account.name_normalized.like(f"{key}%") if key else sa_false(),
        similarity >= threshold if key else sa_false(),
    ]

    reason = case(
        (routes[0], "exact"),
        (routes[1], "normalized"),
        (routes[2], "prefix"),
        else_="fuzzy",
    ).label("reason")
    rank = case((routes[0], 0), (routes[1], 1), (routes[2], 2), else_=3).label("rank")

    stmt = (
        select(Account, similarity.label("score"), reason, rank)
        .options(selectinload(Account.owner))
        .where(or_(*routes))
        .order_by(rank, similarity.desc(), Account.name)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).unique().all()
    return [(row[0], float(row.score or 0.0), row.reason) for row in rows]


async def get_by_normalized(db: AsyncSession, key: str) -> Account | None:
    """
    The account occupying a normalized name, or None.

    Used to turn the unique index's `IntegrityError` into a message that names the existing account
    instead of an index. An empty key can never collide — see `account_names.is_usable`.
    """
    if not account_names.is_usable(key):
        return None
    stmt = select(Account).options(selectinload(Account.owner)).where(Account.name_normalized == key)
    return (await db.execute(stmt)).unique().scalar_one_or_none()
