"""
Reads for contacts, roles and their attachment to deals.

No permission scoping. A contact hangs off an account, every account is visible to every
authenticated user, and a contact has no owner of its own — so there is nothing here to narrow.
"""

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core import permissions
from app.models import (
    Account,
    Contact,
    ContactRole,
    Deal,
    DealContact,
    DealRole,
    PipelineTemplate,
    Stage,
    User,
)
from app.models.enums import StageKind


async def get(db: AsyncSession, contact_id: uuid.UUID) -> Contact | None:
    stmt = select(Contact).where(Contact.id == contact_id).options(joinedload(Contact.account))
    return (await db.execute(stmt)).unique().scalar_one_or_none()


async def list_contacts(
    db: AsyncSession,
    *,
    account_id: uuid.UUID | None = None,
    contact_type: str | None = None,
    search: str | None = None,
) -> list[tuple[Contact, int]]:
    """
    Contacts with the number of deals each is attached to.

    The count comes from a correlated scalar subquery rather than a join with a GROUP BY: the join
    would multiply rows per deal link and force every selected column into the grouping, and the
    contact has eight of them.
    """
    # Distinct deals, not link rows: somebody who is both champion and executive sponsor on one deal
    # holds two roles there but appears on a single deal.
    deal_count = (
        select(func.count(func.distinct(DealContact.deal_id)))
        .where(DealContact.contact_id == Contact.id)
        .correlate(Contact)
        .scalar_subquery()
    )

    stmt = (
        select(Contact, deal_count.label("deal_count"))
        .options(joinedload(Contact.account))
        .order_by(Contact.full_name)
    )

    if account_id is not None:
        stmt = stmt.where(Contact.account_id == account_id)
    if contact_type is not None:
        stmt = stmt.where(Contact.contact_type == contact_type)
    if search:
        # Plain ILIKE, not trigram. This searches names a user has already filed and is reaching for
        # by memory, where a substring match is what they expect; the fuzzy machinery exists for
        # account names, where the problem is recognising a company someone else spelled differently.
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Contact.full_name.ilike(pattern),
                Contact.email.ilike(pattern),
                Contact.designation.ilike(pattern),
            )
        )

    rows = (await db.execute(stmt)).unique().all()
    return [(row[0], row.deal_count) for row in rows]


async def list_for_accounts(db: AsyncSession, account_ids: list[uuid.UUID]) -> list[Contact]:
    """
    Every contact at any of these accounts.

    Kept for callers that want a company's people in bulk. The deal forms no longer narrow to two
    accounts — a deal has no partner column to narrow by, so anybody in the directory can be attached.
    """
    if not account_ids:
        return []
    stmt = (
        select(Contact)
        .where(Contact.account_id.in_(account_ids))
        .options(joinedload(Contact.account))
        .order_by(Contact.full_name)
    )
    return list((await db.execute(stmt)).unique().scalars())


async def list_roles(db: AsyncSession) -> list[ContactRole]:
    stmt = select(ContactRole).order_by(ContactRole.position, ContactRole.name)
    return list((await db.execute(stmt)).scalars())


async def get_role(db: AsyncSession, role_id: uuid.UUID) -> ContactRole | None:
    return await db.get(ContactRole, role_id)


async def role_by_key(db: AsyncSession, key: str) -> ContactRole | None:
    stmt = select(ContactRole).where(ContactRole.key == key)
    return (await db.execute(stmt)).scalar_one_or_none()


async def role_in_use(db: AsyncSession, role_id: uuid.UUID) -> bool:
    """
    Whether any deal still uses this role — checked before allowing it to be deleted.

    Both tables, because a role is "in use" if a deal merely *tracks* it, even with nobody in it. A role
    counted only when filled would let an admin delete the Executive Sponsor role off forty deals that
    were still looking for one.
    """
    mapped = select(func.count(DealContact.id)).where(DealContact.role_id == role_id)
    tracked = select(func.count(DealRole.id)).where(DealRole.role_id == role_id)
    return bool((await db.execute(mapped)).scalar_one() or (await db.execute(tracked)).scalar_one())


async def list_deal_contacts(db: AsyncSession, deal_id: uuid.UUID) -> list[DealContact]:
    """
    Every contact on a deal, ordered by role, with the unmapped ones last.

    The join to `ContactRole` is an **outer** join. It used to be inner, which was correct while every
    attachment carried a role and became a silent data-loss bug the moment `role_id` went nullable: an
    inner join drops exactly the rows this feature exists to support — people attached before anyone
    worked out what they are.

    `nulls_last` on the position for the same reason. Postgres sorts NULLs first by default, so the
    people nobody has identified yet would otherwise head the list ahead of the champion.
    """
    stmt = (
        select(DealContact)
        .outerjoin(ContactRole, ContactRole.id == DealContact.role_id)
        .join(Contact, Contact.id == DealContact.contact_id)
        .where(DealContact.deal_id == deal_id)
        .options(
            selectinload(DealContact.contact).joinedload(Contact.account),
            selectinload(DealContact.role),
        )
        .order_by(ContactRole.position.nulls_last(), Contact.full_name)
    )
    return list((await db.execute(stmt)).unique().scalars())


async def list_deal_roles(db: AsyncSession, deal_id: uuid.UUID) -> list[tuple[DealRole, int]]:
    """
    The roles a deal tracks, each with how many people currently fill it.

    A count of zero is the interesting case — it is a role the deal is looking to fill, and the whole
    reason `deal_roles` exists as a table rather than being derived from the contacts.
    """
    filled = (
        select(func.count(DealContact.id))
        .where(DealContact.deal_id == DealRole.deal_id, DealContact.role_id == DealRole.role_id)
        .correlate(DealRole)
        .scalar_subquery()
    )
    stmt = (
        select(DealRole, filled.label("filled"))
        .join(ContactRole, ContactRole.id == DealRole.role_id)
        .where(DealRole.deal_id == deal_id)
        .options(selectinload(DealRole.role))
        .order_by(ContactRole.position, ContactRole.name)
    )
    rows = (await db.execute(stmt)).unique().all()
    return [(row[0], row.filled) for row in rows]


async def get_deal_role(db: AsyncSession, link_id: uuid.UUID) -> DealRole | None:
    return await db.get(DealRole, link_id)


async def deal_tracks_role(db: AsyncSession, deal_id: uuid.UUID, role_id: uuid.UUID) -> bool:
    stmt = select(func.count(DealRole.id)).where(
        DealRole.deal_id == deal_id, DealRole.role_id == role_id
    )
    return bool((await db.execute(stmt)).scalar_one())


async def deal_contact_counts(db: AsyncSession, deal_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """How many contacts each deal has, for a list view that wants the number without the people."""
    if not deal_ids:
        return {}
    stmt = (
        select(DealContact.deal_id, func.count(DealContact.id))
        .where(DealContact.deal_id.in_(deal_ids))
        .group_by(DealContact.deal_id)
    )
    return {deal_id: count for deal_id, count in (await db.execute(stmt)).all()}


async def deal_count_for_contact(db: AsyncSession, contact_id: uuid.UUID) -> int:
    """
    How many deals one contact is attached to.

    Counts distinct deals, not link rows: somebody who is both champion and executive sponsor on the
    same deal holds two roles there but appears on one deal, and reporting "2 deals" would be wrong.
    """
    stmt = select(func.count(func.distinct(DealContact.deal_id))).where(
        DealContact.contact_id == contact_id
    )
    return int((await db.execute(stmt)).scalar_one())


async def champions_for_deal(db: AsyncSession, deal_id: uuid.UUID) -> list[Contact]:
    """
    The contacts holding the champion role on this deal.

    Matched by `ContactRole.key`, never by name: an admin renaming "Champion" to "Advocate" must not
    silently disable the stage gate.
    """
    stmt = (
        select(Contact)
        .join(DealContact, DealContact.contact_id == Contact.id)
        .join(ContactRole, ContactRole.id == DealContact.role_id)
        .where(DealContact.deal_id == deal_id, ContactRole.key == ContactRole.CHAMPION)
    )
    return list((await db.execute(stmt)).unique().scalars())


async def champions_for_deals(
    db: AsyncSession, deal_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[Contact]]:
    """The same thing for many deals at once, so flagging a whole book is one query rather than N."""
    if not deal_ids:
        return {}

    stmt = (
        select(DealContact.deal_id, Contact)
        .join(Contact, Contact.id == DealContact.contact_id)
        .join(ContactRole, ContactRole.id == DealContact.role_id)
        .where(DealContact.deal_id.in_(deal_ids), ContactRole.key == ContactRole.CHAMPION)
    )
    found: dict[uuid.UUID, list[Contact]] = {}
    for deal_id, contact in (await db.execute(stmt)).unique().all():
        found.setdefault(deal_id, []).append(contact)
    return found


def _complete_champion_exists() -> Any:
    """
    A correlated EXISTS: does this deal have a champion with all three details on record?

    Expressed in SQL rather than by loading contacts and asking `has_full_contact_details`, because the
    caller needs the answer for every deal in the book. It has to keep step with that property by hand,
    which is the cost of the bulk path — the three emptiness tests here are the same three fields.
    """
    return (
        select(1)
        .select_from(DealContact)
        .join(ContactRole, ContactRole.id == DealContact.role_id)
        .join(Contact, Contact.id == DealContact.contact_id)
        .where(
            DealContact.deal_id == Deal.id,
            ContactRole.key == ContactRole.CHAMPION,
            Contact.email != "",
            Contact.phone != "",
            Contact.linkedin_url != "",
        )
        .exists()
    )


async def deals_failing_champion_gate(
    db: AsyncSession, user: User
) -> list[tuple[uuid.UUID, str]]:
    """
    Deals parked at or past their pipeline's champion gate without a complete champion. `(deal_id, stage_name)`.

    The comparison is `stage.position >= gate`, one earlier than the move check, because a deal sitting in
    the gate stage needs a champion in order to *leave* it — it is subject to the rule even though it was
    allowed to arrive. Kept as SQL and not a Python filter so the whole book costs one query.

    Scoped like every other deal read, so a rep is told about their own book and an administrator about
    everybody's. Closed stages are excluded: a won deal that closed before the gate existed is history, and
    nagging about it would be asking somebody to fix the past.
    """
    stmt = (
        select(Deal.id, Stage.name)
        .join(Stage, Stage.id == Deal.stage_id)
        .join(PipelineTemplate, PipelineTemplate.id == Stage.pipeline_template_id)
        .where(
            PipelineTemplate.champion_gate_position.is_not(None),
            Stage.position >= PipelineTemplate.champion_gate_position,
            Stage.kind == StageKind.OPEN,
            ~_complete_champion_exists(),
        )
        .order_by(Stage.position, Deal.name)
    )
    return list((await db.execute(permissions.scope_deals(stmt, user))).all())


