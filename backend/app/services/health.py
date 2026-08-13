import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from app.models import Deal, Health, StageKind

# These thresholds mirror the frontend's `lib/health.ts` exactly. They live here as the
# single authority once the API is the source of truth; the client should render what the
# server derives rather than recompute it.
STALE_AFTER_DAYS = 21
CLOSING_SOON_WITHIN_DAYS = 7

<<<<<<< Updated upstream
=======
#: Activity kinds that are recorded but do not count as working the deal.
#:
#: NUDGE, and the reason is circular if you get it wrong: an administrator nudges a deal *because* it
#: has been untouched for three weeks. If the nudge itself counted as a touch, the at-risk flag would
#: clear the instant it was raised, the deal would look healthy, and the next sweep would stop asking
#: anyone to do anything about it. The chase would erase its own cause.
#:
#: CONTACT_CHANGE for a plainer reason: filing who is involved is not contact with them. A deal whose
#: champion was mapped three weeks ago and never called since is exactly the stale deal this flag exists
#: to surface, and letting the bookkeeping clear it would hide the deals most in need of a call.
#:
#: Everything else counts, including DOCUMENT: filing a signed NDA is work on the deal.
NON_TOUCH_KINDS = frozenset({"nudge", "contact-change"})

>>>>>>> Stashed changes
# Stages at or above this probability count as "advanced" for dashboard reporting (R5).
ADVANCED_STAGE_THRESHOLD = 55


def deal_health(
    deal: Deal,
    last_activity_at: datetime | None,
    today: date | None = None,
    now: datetime | None = None,
) -> Health:
    """
    Health is derived, never stored: a stored flag goes stale the moment a date passes.

    Precedence is deliberate. At-risk beats closing-soon, because a deal that is both
    overdue and imminent is a problem rather than an opportunity.
    """
    today = today or datetime.now(timezone.utc).date()
    now = now or datetime.now(timezone.utc)

    days_until_close = (deal.expected_close_date - today).days
    if days_until_close < 0:
        return Health.AT_RISK

    # Creation counts as a touch. Without this a deal is at risk the instant it is created,
    # which is both wrong and the first thing a new user would see.
    last_touch = last_activity_at or deal.created_at
    if last_touch is None:
        return Health.AT_RISK

    # Tolerate a naive timestamp so this stays callable from scripts and tests.
    if last_touch.tzinfo is None:
        last_touch = last_touch.replace(tzinfo=timezone.utc)

    if (now - last_touch).days > STALE_AFTER_DAYS:
        return Health.AT_RISK

    if days_until_close <= CLOSING_SOON_WITHIN_DAYS:
        return Health.CLOSING_SOON

    return Health.HEALTHY


def is_open(deal: Deal) -> bool:
    """Read from stage kind, never inferred from probability. See StageKind."""
    return deal.stage.kind is StageKind.OPEN


def roll_up_health(healths: list[Health]) -> Health:
    """Worst case wins: a parent node must never look calmer than its children."""
    if Health.AT_RISK in healths:
        return Health.AT_RISK
    if Health.CLOSING_SOON in healths:
        return Health.CLOSING_SOON
    return Health.HEALTHY


def roll_up(
    deals: list[Deal],
    health_by_deal: dict[uuid.UUID, Health],
) -> tuple[Decimal, int, Health]:
    """Returns (open_value, open_count, rolled-up health) for a set of deals."""
    open_deals = [deal for deal in deals if is_open(deal)]
    open_value = sum((deal.value for deal in open_deals), Decimal("0"))
    health = roll_up_health([health_by_deal[deal.id] for deal in open_deals])
    return open_value, len(open_deals), health
