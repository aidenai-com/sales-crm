"""
Contact rules: the champion gate, role keys, and the shapes the API returns.

The gate is the only place in this application where a stage move can be refused for a reason other
than permissions, so it is deliberately narrow and says exactly what is missing.
"""

import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contact, ContactRole, DealContact, DealRole, Stage
from app.repositories import contacts as contacts_repo
from app.schemas.contact import ContactDetail, ContactRoleRead, DealContactRead, DealRoleRead


class ChampionRequired(Exception):
    """
    Raised when a stage demands a champion the deal does not have.

    Carries the sentence shown to the user, because the useful message differs by cause: no champion
    at all needs "identify one", and a champion missing a phone number needs "add their phone" —
    telling somebody to identify a champion they already identified is worse than saying nothing.
    """


def slugify_role(name: str) -> str:
    """
    A role name reduced to a key.

    Only ever used for roles a user creates. The seeded keys are fixed strings in the migration, so no
    rename can produce `champion` by accident and pick up the gate's behaviour — `slugify_role` is
    checked against the reserved set by the endpoint before it is used.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().casefold()).strip("-")
    return slug or "role"


#: Keys the application reasons about, which a user-created role may not claim.
RESERVED_ROLE_KEYS = frozenset({ContactRole.CHAMPION})


async def assert_champion_ready(db: AsyncSession, deal_id: uuid.UUID, stage: Stage) -> None:
    """
    Refuses a move into a stage that requires a champion when the deal has none fit for the job.

    "Fit for the job" means email, phone *and* LinkedIn — all three were named as the requirement, so
    a champion missing a LinkedIn URL does not satisfy it.

    Passes immediately when the stage does not require one, which keeps the common case free of a
    query. Stages are seeded requiring a champion everywhere except the first of each pipeline and the
    closed ones; see migration c94f7e20a1d5 for why.

    A deal with two champions passes if *any* one of them is complete. The requirement is that
    somebody on the inside is identified and reachable, not that every named champion is.
    """
    if not stage.requires_champion:
        return

    champions = await contacts_repo.champions_for_deal(db, deal_id)

    if not champions:
        raise ChampionRequired(
            f'"{stage.name}" needs an identified champion. Add a contact in the Champion role, '
            "with their email, phone and LinkedIn, before moving the deal here."
        )

    if any(champion.has_full_contact_details for champion in champions):
        return

    # Every champion is incomplete. Report the one closest to being usable, so the person reading this
    # has the shortest path forward rather than a list of everything wrong.
    closest = min(champions, key=lambda contact: len(contact.missing_details()))
    missing = closest.missing_details()
    joined = missing[0] if len(missing) == 1 else ", ".join(missing[:-1]) + f" and {missing[-1]}"
    raise ChampionRequired(
        f'{closest.full_name} is the champion on this deal but has no {joined} on record. '
        f'"{stage.name}" needs all three before the deal can move here.'
    )


# --- Serializers -------------------------------------------------------------


def contact_detail(contact: Contact, deal_count: int) -> ContactDetail:
    return ContactDetail(
        id=contact.id,
        created_at=contact.created_at,
        account_id=contact.account_id,
        full_name=contact.full_name,
        email=contact.email,
        phone=contact.phone,
        linkedin_url=contact.linkedin_url,
        designation=contact.designation,
        contact_type=contact.contact_type,
        account_name=contact.account.name,
        deal_count=deal_count,
    )


def deal_role_read(link: DealRole, filled_count: int) -> DealRoleRead:
    """A tracked role and how many people fill it. Zero is the state worth showing."""
    return DealRoleRead(
        id=link.id,
        role_id=link.role_id,
        role_key=link.role.key,
        role_name=link.role.name,
        position=link.role.position,
        filled_count=filled_count,
    )


def deal_contact_read(link: DealContact) -> DealContactRead:
    """
    Flattened: the deal page renders a person and their role in one row, and would otherwise walk two
    relationships per row to do it.
    """
    contact = link.contact
    return DealContactRead(
        id=link.id,
        contact_id=contact.id,
        # All three null together when nobody has worked out what this person is yet.
        role_id=link.role_id,
        role_key=link.role.key if link.role else None,
        role_name=link.role.name if link.role else None,
        full_name=contact.full_name,
        email=contact.email,
        phone=contact.phone,
        linkedin_url=contact.linkedin_url,
        designation=contact.designation,
        contact_type=contact.contact_type,
        account_id=contact.account_id,
        account_name=contact.account.name,
        missing_details=contact.missing_details(),
    )


def role_read(role: ContactRole) -> ContactRoleRead:
    return ContactRoleRead(
        id=role.id, key=role.key, name=role.name, position=role.position, is_system=role.is_system
    )
