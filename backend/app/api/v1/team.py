import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import AdminUser, DbSession
from app.models import Activity, Health, StageKind, User
from app.repositories import deals as deals_repo
from app.repositories import users as users_repo
from app.schemas.team import RepPerformance, RepStageSlice, StaleDeal, TeamOverview
from app.services import health as health_service
from app.services.serializers import deal_detail

router = APIRouter(prefix="/team", tags=["team"])

ACTIVITY_WINDOW_DAYS = 30


@router.get("/overview", response_model=TeamOverview)
async def team_overview(
    db: DbSession,
    admin: AdminUser,
    stale_limit: int = Query(default=12, ge=1, le=100),
) -> TeamOverview:
    """
    The admin-only view of how the team is doing.

    Admin-gated by the `AdminUser` dependency, not by hiding the page: a rep calling this
    directly gets a 403. It is also the one place that reads across every rep's deals,
    which is exactly why it cannot be reachable by a rep.
    """
    now = datetime.now(timezone.utc)
    today = now.date()

    # `admin` passes the scoping predicate unchanged, so this genuinely sees everything.
    all_deals = await deals_repo.list_all(db, admin)
    last_activity = await deals_repo.last_activity_map(db)
    people = await users_repo.list_all(db)

    activity_counts = await _activity_counts(db, since=now - timedelta(days=ACTIVITY_WINDOW_DAYS))

    deals_by_owner: dict[uuid.UUID, list] = {}
    for deal in all_deals:
        deals_by_owner.setdefault(deal.owner_id, []).append(deal)

    reps: list[RepPerformance] = []
    for person in people:
        owned = deals_by_owner.get(person.id, [])
        reps.append(
            _summarise(person, owned, last_activity, activity_counts.get(person.id, 0), today, now)
        )

    # Everyone is listed, including reps with nothing — an empty pipeline is the single
    # most important thing this table can surface, and dropping those rows would hide it.
    reps.sort(key=lambda r: r.open_value, reverse=True)

    return TeamOverview(
        reps=reps,
        stale_deals=_stale(all_deals, last_activity, today, now, stale_limit),
        total_open_value=sum((r.open_value for r in reps), Decimal("0")),
        total_at_risk=sum(r.at_risk_count for r in reps),
    )


async def _activity_counts(db: DbSession, *, since: datetime) -> dict[uuid.UUID, int]:
    """Activity logged per author in the window, in one grouped query."""
    result = await db.execute(
        select(Activity.author_id, func.count())
        .where(Activity.occurred_at >= since)
        .group_by(Activity.author_id)
    )
    return {author_id: count for author_id, count in result.all()}


def _summarise(
    person: User,
    owned: list,
    last_activity: dict,
    activity_30d: int,
    today,
    now: datetime,
) -> RepPerformance:
    open_deals = [d for d in owned if d.stage.kind is StageKind.OPEN]
    won_deals = [d for d in owned if d.stage.kind is StageKind.WON]

    healths = {
        d.id: health_service.deal_health(d, last_activity.get(d.id), today=today, now=now)
        for d in open_deals
    }

    # Stalled is narrower than at-risk: an overdue deal is at risk but has been worked on.
    # Separating them is the difference between "chase the close" and "nobody is on this".
    stalled = 0
    for deal in open_deals:
        touched = last_activity.get(deal.id) or deal.created_at
        if touched is None:
            stalled += 1
            continue
        if touched.tzinfo is None:
            touched = touched.replace(tzinfo=timezone.utc)
        if (now - touched).days > health_service.STALE_AFTER_DAYS:
            stalled += 1

    by_stage: dict[uuid.UUID, RepStageSlice] = {}
    for deal in open_deals:
        slice_ = by_stage.get(deal.stage_id)
        if slice_ is None:
            by_stage[deal.stage_id] = RepStageSlice(
                stage_id=deal.stage_id,
                stage_name=deal.stage.name,
                stage_short_name=deal.stage.short_name,
                color=deal.stage.color,
                count=1,
                value=deal.value,
            )
        else:
            slice_.count += 1
            slice_.value += deal.value

    return RepPerformance(
        user_id=person.id,
        name=person.full_name,
        initials=person.initials,
        job_title=person.job_title,
        role=person.role.value,
        open_count=len(open_deals),
        # Decimal(...) rather than the raw value: SQLAlchemy hands back a Decimal from the
        # database but a plain int for an object that has not round-tripped yet, and mixing the two
        # refuses to sum.
        open_value=sum((Decimal(d.value) for d in open_deals), Decimal("0")),
        at_risk_count=sum(1 for h in healths.values() if h is Health.AT_RISK),
        closing_this_week_count=sum(1 for h in healths.values() if h is Health.CLOSING_SOON),
        won_count=len(won_deals),
        won_value=sum((Decimal(d.value) for d in won_deals), Decimal("0")),
        recent_activity_count=activity_30d,
        stalled_count=stalled,
        stage_slices=sorted(by_stage.values(), key=lambda s: s.stage_name),
    )


def _stale(all_deals: list, last_activity: dict, today, now: datetime, limit: int) -> list[StaleDeal]:
    """Open deals nobody has touched recently, longest-untouched first."""
    rows: list[StaleDeal] = []

    for deal in all_deals:
        if deal.stage.kind is not StageKind.OPEN:
            continue

        touched = last_activity.get(deal.id)
        reference = touched or deal.created_at
        if reference is not None and reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)

        days = None if reference is None else (now - reference).days
        if days is None or days > health_service.STALE_AFTER_DAYS:
            rows.append(
                StaleDeal(
                    deal=deal_detail(deal, last_activity, today=today, now=now),
                    owner_name=deal.owner.full_name,
                    days_since_touch=None if touched is None else (now - reference).days,
                )
            )

    rows.sort(key=lambda r: (r.days_since_touch is not None, -(r.days_since_touch or 0)))
    return rows[:limit]
