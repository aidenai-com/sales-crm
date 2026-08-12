"""
Reminders: what greets a user when they open the app.

Two independent sources feed one surface.

  Explicit    Rows in `reminders`, scheduled by a rep against a record.
  Derived     Leads nobody has touched for a week. Computed on read, never stored — for
              the same reason health is (see `app.services.health`): a staleness flag
              written to a row becomes wrong the moment a day passes without another write.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core import permissions
from app.core.config import settings
from app.models import Account, Activity, Deal, Lead, Reminder, Stage, StageKind, User
from app.schemas.reminder import ReminderInbox, ReminderRead, StaleLeadNudge
from app.services import health
from app.services.notifications import Notification, get_notifier

logger = logging.getLogger("app.reminders")

#: A lead with no activity for this long earns a follow-up nudge.
#:
#: Deliberately not the same as `health.STALE_AFTER_DAYS`, which is 21 days and governs deal
#: health. The two answer different questions — a lead going quiet for a week is worth a
#: nudge, a deal going quiet for three weeks is a risk — so unifying them would make one of
#: the two wrong.
LEAD_FOLLOW_UP_AFTER_DAYS = 7


# --- Explicit reminders -------------------------------------------------------


def _scope(stmt: Select, viewer: User) -> Select:
    """
    A rep sees reminders assigned to them. An admin sees all of them.

    Authorship is not a second route in, matching how activities already behave: a reminder
    you created but then reassigned is no longer yours to be nagged about.
    """
    if permissions.is_admin(viewer):
        return stmt
    return stmt.where(Reminder.assignee_id == viewer.id)


def _with_relations(stmt: Select) -> Select:
    return stmt.options(
        joinedload(Reminder.assignee),
        joinedload(Reminder.account),
        joinedload(Reminder.lead),
        joinedload(Reminder.deal),
    )


async def get(db: AsyncSession, reminder_id: uuid.UUID) -> Reminder | None:
    result = await db.execute(_with_relations(select(Reminder)).where(Reminder.id == reminder_id))
    return result.unique().scalar_one_or_none()


async def list_for(
    db: AsyncSession,
    viewer: User,
    *,
    include_complete: bool = False,
    assignee_id: uuid.UUID | None = None,
) -> list[Reminder]:
    stmt = _with_relations(select(Reminder)).order_by(Reminder.due_at)
    if not include_complete:
        stmt = stmt.where(Reminder.completed_at.is_(None))
    if assignee_id is not None:
        stmt = stmt.where(Reminder.assignee_id == assignee_id)

    result = await db.execute(_scope(stmt, viewer))
    return list(result.unique().scalars())


def to_read(reminder: Reminder, now: datetime | None = None) -> ReminderRead:
    now = now or datetime.now(timezone.utc)

    if reminder.deal is not None:
        label = reminder.deal.name
    elif reminder.lead is not None:
        label = reminder.lead.business_unit
    elif reminder.account is not None:
        label = reminder.account.name
    else:  # pragma: no cover - the exactly_one_subject constraint prevents this
        label = "Unknown"

    due_at = reminder.due_at
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)

    return ReminderRead(
        id=reminder.id,
        title=reminder.title,
        due_at=reminder.due_at,
        assignee_id=reminder.assignee_id,
        assignee_name=reminder.assignee.full_name,
        completed_at=reminder.completed_at,
        subject_type=reminder.subject_type,
        subject_id=reminder.subject_id,
        subject_label=label,
        overdue=reminder.completed_at is None and due_at <= now,
    )


# --- Derived stale-lead nudges ------------------------------------------------


async def stale_leads(
    db: AsyncSession, viewer: User, now: datetime | None = None
) -> list[StaleLeadNudge]:
    """
    Leads nobody has worked for a week.

    Activity on a lead's *deals* counts as activity on the lead. Counting only activity
    logged directly against the lead would nag an owner who is actively closing business
    under it, which is the fastest way to make people ignore the whole surface.

    A lead with no open deals is excluded. There is nothing to follow up on, and listing
    a business unit whose deals are all closed would fill the card with noise.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=LEAD_FOLLOW_UP_AFTER_DAYS)

    # Latest touch per lead, from either route, as correlated scalar subqueries. Postgres'
    # GREATEST ignores NULL arguments, so a lead touched through only one of the two routes
    # still reports that timestamp, and NULL survives only when neither route has anything.
    # Nudges are excluded from both routes: chasing a quiet lead must not make it look worked,
    # or the nudge would remove the lead from this very list. See health.NON_TOUCH_KINDS.
    direct = (
        select(func.max(Activity.occurred_at))
        .where(Activity.lead_id == Lead.id)
        .where(Activity.kind.notin_(health.NON_TOUCH_KINDS))
        .correlate(Lead)
        .scalar_subquery()
    )
    via_deals = (
        select(func.max(Activity.occurred_at))
        .join(Deal, Deal.id == Activity.deal_id)
        .where(Deal.lead_id == Lead.id)
        .where(Activity.kind.notin_(health.NON_TOUCH_KINDS))
        .correlate(Lead)
        .scalar_subquery()
    )
    last_touch = func.greatest(direct, via_deals)

    open_deal_count = (
        select(func.count())
        .select_from(Deal)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.lead_id == Lead.id, Stage.kind == StageKind.OPEN.value)
        .correlate(Lead)
        .scalar_subquery()
    )

    stmt = (
        select(Lead, last_touch.label("last_touch"), open_deal_count.label("open_deals"))
        # The account's owner, through the account: a business unit has no owner of its own, so the
        # person to chase about a quiet one is whoever holds the company relationship.
        .options(joinedload(Lead.account).joinedload(Account.owner))
        # A lead created moments ago has no activity yet, and is not neglected. Creation
        # counts as a touch, exactly as it does in health derivation.
        .where(Lead.created_at <= cutoff)
        .where(or_(last_touch.is_(None), last_touch <= cutoff))
        .where(open_deal_count > 0)
        .order_by(last_touch.nulls_first(), Lead.business_unit)
    )

    result = await db.execute(permissions.scope_leads(stmt, viewer))

    nudges: list[StaleLeadNudge] = []
    for lead, last, open_deals in result.unique().all():
        reference = last or lead.created_at
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)

        nudges.append(
            StaleLeadNudge(
                lead_id=lead.id,
                business_unit=lead.business_unit,
                account_id=lead.account_id,
                account_name=lead.account.name,
                owner_id=lead.account.owner_id,
                owner_name=lead.account.owner.full_name,
                last_activity_at=last,
                days_quiet=max(0, (now - reference).days),
                open_deal_count=int(open_deals),
            )
        )

    return nudges


# --- The inbox ----------------------------------------------------------------


async def inbox(db: AsyncSession, viewer: User, now: datetime | None = None) -> ReminderInbox:
    """
    Everything demanding attention, in one payload.

    One request rather than two, because the Dashboard renders it as a single card and
    splitting it would let half the card arrive late and reflow the page under the reader.
    """
    now = now or datetime.now(timezone.utc)
    horizon = now + timedelta(days=settings.reminder_due_within_days)

    open_reminders = await list_for(db, viewer)
    reads = [to_read(reminder, now) for reminder in open_reminders]

    overdue = [read for read in reads if read.overdue]
    upcoming = [read for read in reads if not read.overdue and read.due_at <= horizon]
    nudges = await stale_leads(db, viewer, now)

    return ReminderInbox(
        overdue=overdue,
        upcoming=upcoming,
        stale_leads=nudges,
        total_count=len(overdue) + len(upcoming) + len(nudges),
    )


# --- The sweep ----------------------------------------------------------------


async def due_for_notification(db: AsyncSession, now: datetime | None = None) -> list[Reminder]:
    """
    Reminders that are due, incomplete, and have never been notified.

    Unscoped by design: this runs as a background job with no signed-in user, and each
    reminder is delivered to its own assignee.
    """
    now = now or datetime.now(timezone.utc)
    result = await db.execute(
        _with_relations(select(Reminder))
        .where(
            and_(
                Reminder.due_at <= now,
                Reminder.completed_at.is_(None),
                Reminder.notified_at.is_(None),
            )
        )
        .order_by(Reminder.due_at)
    )
    return list(result.unique().scalars())


def compose(reminder: Reminder) -> Notification:
    label = (
        reminder.deal.name
        if reminder.deal is not None
        else reminder.lead.business_unit
        if reminder.lead is not None
        else reminder.account.name
        if reminder.account is not None
        else "a record"
    )
    return Notification(
        to=reminder.assignee.email,
        subject=f"Reminder: {reminder.title}",
        body=(
            f"{reminder.title}\n\n"
            f"Against: {label}\n"
            f"Due: {reminder.due_at:%d %b %Y at %H:%M} UTC\n\n"
            "Open the CRM to log what happened or reschedule."
        ),
    )


async def run_sweep(db: AsyncSession, now: datetime | None = None) -> int:
    """
    One pass. Returns how many reminders were notified.

    Each reminder is handled in isolation: an exception on one must not abort the pass or
    kill the task that calls this. A sweep that dies takes every future reminder with it,
    silently and permanently, which is far worse than one dropped email.
    """
    now = now or datetime.now(timezone.utc)
    notifier = get_notifier()
    sent = 0

    for reminder in await due_for_notification(db, now):
        try:
            if await notifier.send(compose(reminder)):
                # Stamped only on success, so a transient failure is retried next pass
                # rather than swallowed.
                reminder.notified_at = now
                sent += 1
        except Exception:
            logger.exception("Could not notify reminder %s; continuing", reminder.id)

    if sent:
        await db.commit()
    return sent


async def sweep_forever(session_factory) -> None:
    """
    The background loop, started from the FastAPI lifespan.

    A plain asyncio task rather than APScheduler or Celery. The stack has no scheduler and
    one interval loop does not justify adding one, along with its broker and its deployment
    story.

    `CancelledError` propagates so shutdown is clean; everything else is logged and the loop
    continues, because a crashed sweep fails silently forever.
    """
    interval = max(30, settings.reminder_sweep_interval_seconds)
    logger.info("Reminder sweep running every %ss", interval)

    while True:
        try:
            await asyncio.sleep(interval)
            async with session_factory() as db:
                count = await run_sweep(db)
            if count:
                logger.info("Reminder sweep notified %d reminder(s)", count)
        except asyncio.CancelledError:
            logger.info("Reminder sweep stopped")
            raise
        except Exception:
            logger.exception("Reminder sweep failed; will retry in %ss", interval)
