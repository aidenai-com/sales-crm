"""
Contact rules: the champion gate, role keys, and the shapes the API returns.

The gate is the only place in this application where a stage move can be refused for a reason other
than permissions, so it is deliberately narrow and says exactly what is missing.
"""

import re
import uuid
from collections.abc import Sequence
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contact, ContactRole, Deal, DealContact, DealRole, Stage, StageKind, User
from app.repositories import contacts as contacts_repo
from app.schemas.contact import (
    ChampionGap,
    ContactDetail,
    ContactRoleRead,
    DealContactRead,
    DealRoleRead,
)


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


#: Where the deal stands in relation to the requirement. Only the closing clause differs, but the
#: difference matters: a deal being refused a move is being told why it cannot go, and a deal nobody is
#: touching should be told what it needs, not ordered.
#:
#: There is no `entering` context any more, and its absence is the rule. Under a positional gate a deal
#: enters the gate stage freely — the requirement is on *leaving* it, and on every forward move after that.
GateContext = Literal["leaving", "resting"]

_TAIL: dict[GateContext, str] = {
    "leaving": "before it can move on.",
    "resting": "before this deal can move on.",
}


def gate_blocks_move(gate_position: int | None, target_position: int) -> bool:
    """
    Whether moving into `target_position` needs a champion.

    The rule, in one line: **a champion is required to reach any stage past the gate.** With the gate at 2,
    moving 1→2 is free and 2→3 is not; moving 4→5 is not either, because 5 is also past 2. Comparing the
    *destination* to the gate rather than the origin is what makes a skipped move behave — a jump straight
    from 1 to 4 is still crossing the gate and is still refused.
    """
    return gate_position is not None and target_position > gate_position


def gate_applies_at(gate_position: int | None, stage: Stage) -> bool:
    """
    Whether a deal resting in `stage` is already subject to the requirement.

    True from the gate stage onward, which is one position earlier than `gate_blocks_move` — a deal sitting
    *in* the gate stage needs a champion in order to leave, so it is in scope for the warning even though it
    was allowed to arrive. That is the whole point of warning rather than only refusing: the deal is told
    what it will need before somebody drags it and is stopped.

    Terminal stages are excluded. A won deal needs nothing, and a lost one needs less than that.
    """
    return (
        gate_position is not None
        and stage.kind is StageKind.OPEN
        and stage.position >= gate_position
    )


def champion_shortfall(
    champions: Sequence[Contact], stage_name: str, context: GateContext
) -> str | None:
    """
    Why this set of champions does not satisfy `stage_name`, or `None` if it does.

    One function, so the sentence a refused move produces and the sentence a flagged deal displays can
    never drift apart — a warning that says something different from the refusal it predicts is worse
    than no warning.

    "Fit for the job" means email, phone *and* LinkedIn: all three were named as the requirement, so a
    champion missing a LinkedIn URL does not satisfy it. A deal with two champions passes if *any* one
    of them is complete — the requirement is that somebody on the inside is identified and reachable,
    not that every named champion is.
    """
    if not champions:
        subject = (
            f'From "{stage_name}" onward this pipeline needs an identified champion.'
            if context == "leaving"
            else f'This deal is in "{stage_name}", which needs an identified champion.'
        )
        return (
            f"{subject} Add a contact in the Champion role, with their email, phone and LinkedIn "
            f"{_TAIL[context]}"
        )

    if any(champion.has_full_contact_details for champion in champions):
        return None

    # Every champion is incomplete. Report the one closest to being usable, so the person reading this
    # has the shortest path forward rather than a list of everything wrong.
    closest = min(champions, key=lambda contact: len(contact.missing_details()))
    missing = closest.missing_details()
    joined = missing[0] if len(missing) == 1 else ", ".join(missing[:-1]) + f" and {missing[-1]}"
    return (
        f"{closest.full_name} is the champion on this deal but has no {joined} on record. "
        f"All three are needed {_TAIL[context]}"
    )


async def assert_champion_ready(
    db: AsyncSession, deal: Deal, to_stage: Stage
) -> None:
    """
    Refuses a forward move that would cross the gate without a champion.

    One check, not two. The old version asked the departure stage and the destination stage separately,
    because the requirement lived on each stage as a flag and a deal could be sitting in a gated stage it
    had entered before the flag was set. A positional gate has no such hole: the requirement applies from
    one place onward, so "is the destination past the gate" is the entire question, and it is asked once.

    The pipeline is read off the deal rather than off either stage. `Deal.pipeline` is joined-loaded and
    `PipelineTemplate.stages` is selectin-loaded, so both are already in memory — reaching through
    `Stage.pipeline` instead would be a lazy load inside async, which raises rather than fetching.
    """
    template = deal.pipeline
    gate = template.champion_gate_position
    if not gate_blocks_move(gate, to_stage.position):
        return

    # The gate stage's own name, not the departure stage's, when they differ: a deal at stage 4 with the
    # gate at 2 is subject to a rule that started at 2, and saying "from Qualify onward" explains the rule
    # while "from Validate onward" would misstate it.
    gate_stage = next(
        (stage for stage in template.stages if stage.position == gate), deal.stage
    )

    champions = await contacts_repo.champions_for_deal(db, deal.id)
    problem = champion_shortfall(champions, gate_stage.name, "leaving")
    if problem is not None:
        raise ChampionRequired(problem)


# There is no single-deal version of the at-rest check. `champion_gaps` below answers it for every deal the
# caller can see in two queries, and the deal page reads its own warning from that list — a second
# implementation of the same rule is a second thing to keep in step with `champion_shortfall`, which is the
# one function the refusal and the warning are supposed to share.


async def champion_gaps(db: AsyncSession, user: User) -> list[ChampionGap]:
    """
    Every deal the caller can see that is sitting in a stage whose champion requirement it fails.

    Two queries regardless of how many deals exist: one to find the failing ids, one to load the
    champions of just those. Doing it per deal would be an N+1 across the whole book to render a
    warning badge.
    """
    flagged = await contacts_repo.deals_failing_champion_gate(db, user)
    if not flagged:
        return []

    champions_by_deal = await contacts_repo.champions_for_deals(
        db, [deal_id for deal_id, _ in flagged]
    )

    gaps: list[ChampionGap] = []
    for deal_id, stage_name in flagged:
        detail = champion_shortfall(champions_by_deal.get(deal_id, []), stage_name, "resting")
        # `None` should be unreachable — the query selected these for failing — but a gap with no
        # reason to state would render as an empty warning, so it is dropped rather than shown.
        if detail is not None:
            gaps.append(ChampionGap(deal_id=deal_id, stage_name=stage_name, detail=detail))
    return gaps


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
