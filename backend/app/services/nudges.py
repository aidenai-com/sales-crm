"""
Administrator nudges: chasing the owner of a deal that has gone wrong.

The deal explorer already tells an admin *which* deals need attention — `health.deal_health`
derives that, and the lead drawer lists it. What it could not do was act on it. An admin looking
at a stalled deal owned by somebody else had no move except leaving the CRM and writing an email
by hand, which is the point at which the escalation stops being visible to anyone else.

A nudge does three things, in one transaction:

  1. Emails the owner, so it reaches them where they are.
  2. Creates a reminder assigned to them, so it lands in their work queue rather than only in
     their mailbox. An email is read once; a reminder is owed until it is done.
  3. Writes an activity on the deal, so the next person to look sees the deal was escalated
     rather than merely ignored.

Deliberately *not* a fourth thing: it does not count as a touch. See `health.NON_TOUCH_KINDS`.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Activity, Deal, Reminder, User
from app.models.enums import ActivityKind
from app.services import health
from app.services.notifications import Notification, get_notifier

logger = logging.getLogger("app.nudges")

#: How long before the same deal can be nudged again.
#:
#: A day, because a nudge is an escalation and an escalation repeated hourly is just noise the
#: owner learns to filter. The window is per deal, not per admin: two admins independently
#: chasing the same deal should produce one email, not two, and the owner has no way to tell
#: those apart anyway.
COOLDOWN_HOURS = 24

#: The reminder is due immediately. A nudge that is due next week is not a nudge.
DUE_IN_MINUTES = 0


class NotNudgeable(Exception):
    """The deal is healthy, so there is nothing to chase."""


class OnCooldown(Exception):
    """This deal was nudged recently."""

    def __init__(self, last_nudged_at: datetime) -> None:
        self.last_nudged_at = last_nudged_at
        super().__init__("This deal was nudged recently")


async def last_nudged_at(db: AsyncSession, deal_id: uuid.UUID) -> datetime | None:
    """
    When this deal was last nudged, read off the timeline.

    The cooldown is derived from the activity rather than stored on the deal. A column would be
    a second copy of a fact the timeline already holds, and it would drift the moment anyone
    deleted the activity.
    """
    result = await db.execute(
        select(func.max(Activity.occurred_at)).where(
            Activity.deal_id == deal_id, Activity.kind == ActivityKind.NUDGE
        )
    )
    return result.scalar_one_or_none()


def _compose(deal: Deal, owner: User, admin: User, reason: str) -> Notification:
    return Notification(
        to=owner.email,
        subject=f"Please take a look at {deal.name}",
        body=(
            f"{admin.full_name} flagged this deal for your attention.\n\n"
            f"Deal: {deal.name}\n"
            f"Account: {deal.account.name}\n"
            f"Stage: {deal.stage.name}\n"
            f"Expected close: {deal.expected_close_date:%d %b %Y}\n"
            f"Why: {reason}\n\n"
            "A reminder has been added to your inbox in the CRM. Open the deal to log what is "
            "happening, or reschedule it if the close date has moved."
        ),
    )


def _reason(deal: Deal, last_activity_at: datetime | None, now: datetime) -> str:
    """
    Plain words for why this deal was flagged, reusing the health derivation's own two causes.

    Spelled out rather than left as "at risk", because the two causes need opposite responses:
    an overdue deal needs a new close date, a stalled one needs a phone call. An email that says
    only "at risk" makes the owner open the CRM to find out which.
    """
    today = now.date()
    days_overdue = (today - deal.expected_close_date).days
    if days_overdue > 0:
        return (
            f"The close date passed {days_overdue} day{'s' if days_overdue != 1 else ''} ago. "
            "It needs a new date or an outcome."
        )

    touch = last_activity_at or deal.created_at
    if touch is not None:
        if touch.tzinfo is None:
            touch = touch.replace(tzinfo=timezone.utc)
        quiet_days = (now - touch).days
        return (
            f"Nothing has been logged against it for {quiet_days} days."
            if quiet_days
            else "It has gone quiet."
        )

    return "It has gone quiet."


async def nudge(
    db: AsyncSession,
    deal: Deal,
    admin: User,
    last_activity_at: datetime | None,
    now: datetime | None = None,
) -> Reminder:
    """
    Chase this deal's owner. Returns the reminder created for them.

    Raises `NotNudgeable` if the deal is not at risk, and `OnCooldown` if it was nudged inside
    the window. Both are refusals rather than silent no-ops: an admin who clicks and sees
    nothing happen will click again.

    The email is sent *before* the commit deliberately. If the mail server refuses, the caller
    gets an exception and nothing is written — better than a reminder and a timeline entry
    claiming an owner was contacted when nobody was. The reverse ordering trades a visible
    failure for an invisible lie.
    """
    now = now or datetime.now(timezone.utc)

    if health.deal_health(deal, last_activity_at, now=now) is not health.Health.AT_RISK:
        raise NotNudgeable("Only a deal that is at risk can be nudged")

    previous = await last_nudged_at(db, deal.id)
    if previous is not None:
        if previous.tzinfo is None:
            previous = previous.replace(tzinfo=timezone.utc)
        if now - previous < timedelta(hours=COOLDOWN_HOURS):
            raise OnCooldown(previous)

    owner = deal.owner
    reason = _reason(deal, last_activity_at, now)

    if not await get_notifier().send(_compose(deal, owner, admin, reason)):
        raise RuntimeError("The nudge email could not be sent")

    reminder = Reminder(
        deal_id=deal.id,
        title=f"Nudged by {admin.full_name}: act on {deal.name}",
        due_at=now + timedelta(minutes=DUE_IN_MINUTES),
        assignee_id=owner.id,
        created_by_id=admin.id,
        # Already delivered by this function, so the sweep must not send a second copy.
        notified_at=now,
    )
    db.add(reminder)
    db.add(
        Activity(
            deal_id=deal.id,
            kind=ActivityKind.NUDGE,
            summary=f"{admin.full_name} nudged {owner.full_name} to act on this deal. {reason}",
            author_id=admin.id,
            occurred_at=now,
        )
    )

    await db.commit()
    await db.refresh(reminder)
    logger.info("Deal %s nudged by %s to owner %s", deal.id, admin.id, owner.id)
    return reminder
