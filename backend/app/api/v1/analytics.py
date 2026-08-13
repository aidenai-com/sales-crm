"""
Aggregations for the Analytics screen.

Split out of the Dashboard rather than added to it. `spec.md` §4.1 calls the Dashboard "an
action surface, not a reporting surface", and it had drifted into six stacked sections of
reporting. The charts belong on their own screen, behind filters; the Dashboard keeps only
what a rep can act on today.

Aggregation happens in Python over the already-scoped deal list rather than in SQL. The same
list is what the Dashboard and the board already load, the row counts are internal-CRM sized,
and doing it here means every figure passes through the same derivation — so a chart can never
disagree with a board about a deal.

**No weighted value.** Every slice used to carry `value * stage_probability / 100`. A stage's
percentage says how far along a deal is, not how likely it is to close, so that product was a
number shaped like expected revenue that meant nothing. Removed, not renamed.

**The whole screen is scoped by deal created date.** The period is a filter on creation, and it
applies to every panel — so the funnel describes the cohort created in the window rather than
the live pipeline. That is a real trade and `excluded_open_count` is how it stays visible.
"""

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.models import Deal, StageKind
from app.repositories import deals as deals_repo
from app.schemas.analytics import (
    AgeingRead,
    AnalyticsDeal,
    AnalyticsFilters,
    AnalyticsSummary,
    CreatedBucket,
    CreatedSummary,
    ForecastSlice,
    OutcomeMix,
    OwnerSlice,
<<<<<<< Updated upstream
    PartnerSlice,
=======
    DealRisk,
    Period,
    PipelineSlice,
    RiskReason,
    RiskSummary,
>>>>>>> Stashed changes
    StageSlice,
)
from app.services import ageing as ageing_service
from app.services import checklist as checklist_service
from app.services import contacts as contact_service
from app.services import health as health_service
from app.services import pipelines as pipeline_service
from app.services.serializers import deal_detail

router = APIRouter(prefix="/analytics", tags=["analytics"])

ZERO = Decimal("0")


# --- The period --------------------------------------------------------------


def resolve_period(period: Period, today: date) -> tuple[date, date]:
    """
    The window a period word means, as an inclusive pair of dates.

    Calendar periods, not rolling ones: "this quarter" means the quarter you are in, because that is what a
    sales team is measured against. A rolling ninety days would answer a different question and would move
    every morning, so two people opening the screen a day apart could not compare notes.

    The week starts Monday, matching ISO and every calendar in the product.
    """
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    if period == "month":
        start = today.replace(day=1)
        return start, _month_end(start)
    if period == "quarter":
        start = date(today.year, 3 * ((today.month - 1) // 3) + 1, 1)
        # Three months on, minus a day: the last day of the quarter without special-casing December.
        return start, _month_end(_add_months(start, 2))
    return date(today.year, 1, 1), date(today.year, 12, 31)


def _month_end(day: date) -> date:
    return _add_months(day.replace(day=1), 1) - timedelta(days=1)


def _add_months(day: date, months: int) -> date:
    """Month arithmetic on a first-of-month date. Only ever called with day=1, so no clamping is needed."""
    total = day.month - 1 + months
    return date(day.year + total // 12, total % 12 + 1, 1)


def _prior_window(period: Period, start: date, end: date) -> tuple[date, date, str]:
    """
    The window immediately before this one, and what to call it.

    The preceding *calendar* period rather than "the same number of days before", so a comparison between
    two quarters is a comparison between two quarters even though they differ in length by a day or two.
    """
    if period == "week":
        return start - timedelta(days=7), start - timedelta(days=1), "last week"
    if period == "month":
        prior = _add_months(start, -1)
        return prior, _month_end(prior), "last month"
    if period == "quarter":
        prior = _add_months(start, -3)
        return prior, _month_end(_add_months(prior, 2)), "last quarter"
    return date(start.year - 1, 1, 1), date(start.year - 1, 12, 31), "last year"


# --- The endpoint ------------------------------------------------------------


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    db: DbSession,
    user: CurrentUser,
    pipeline_id: uuid.UUID | None = Query(default=None),
    owner_id: uuid.UUID | None = Query(default=None),
<<<<<<< Updated upstream
    partner_id: uuid.UUID | None = Query(default=None),
    close_from: date | None = Query(default=None),
    close_to: date | None = Query(default=None),
=======
    # The year, not the quarter. Because the period scopes *every* panel by created date, a default that
    # excluded most of the book would open the screen on an almost-empty funnel — which reads as no
    # pipeline rather than as a narrow window. The widest calendar period is the one that always has
    # something to show; narrowing is a deliberate act.
    period: Period = Query(default="year"),
>>>>>>> Stashed changes
) -> AnalyticsSummary:
    """
    Every panel on the Analytics screen, in one round trip.

    All of them share one filtered deal set, so they cannot disagree with each other — separate endpoints
    filtered independently would eventually be read side by side and found inconsistent. The deal list is
    returned for the same reason: drilling into a bar must show the deals that bar was drawn from, not a
    freshly fetched set that may have moved.
    """
    today = date.today()
    period_from, period_to = resolve_period(period, today)
    prior_from, prior_to, prior_label = _prior_window(period, period_from, period_to)

<<<<<<< Updated upstream
    if partner_id is not None:
        deals = [deal for deal in deals if deal.partner_id == partner_id]
    if close_from is not None:
        deals = [deal for deal in deals if deal.expected_close_date >= close_from]
    if close_to is not None:
        deals = [deal for deal in deals if deal.expected_close_date <= close_to]
=======
    scoped = await deals_repo.list_all(db, user, pipeline_id=pipeline_id, owner_id=owner_id)
    templates = await pipeline_service.list_templates(db)
    # One map for the whole response. Health is derived from last activity, and asking per deal would be an
    # N+1 across the book to draw a dot.
    last_activity = await deals_repo.last_activity_map(db)
    # Three more bulk reads, all for the risk report. Each is one query for the whole book: the alternative
    # is a query per deal per signal, which on a hundred deals is four hundred round trips to draw a list.
    last_move = await deals_repo.last_stage_change_map(db)
    actions = await checklist_service.actions_by_deal(db)
    champion_gaps = {gap.deal_id: gap for gap in await contact_service.champion_gaps(db, user)}

    # Every pipeline's stages, for the cumulative expected-days sums. Read from the templates already
    # loaded rather than off each deal, because `Stage.pipeline` is not eagerly loaded and reaching through
    # it inside a loop would be a lazy load per deal.
    stages_by_pipeline = {template.id: list(template.stages) for template in templates}

    def created_within(deal: Deal, start: date, end: date) -> bool:
        return start <= deal.created_at.date() <= end

    deals = [deal for deal in scoped if created_within(deal, period_from, period_to)]
    prior_deals = [deal for deal in scoped if created_within(deal, prior_from, prior_to)]
>>>>>>> Stashed changes

    open_deals = [deal for deal in deals if deal.stage.kind is StageKind.OPEN]

    # Open deals the period hides. Counted from the unfiltered scope so the screen can say what it is not
    # showing — scoping a funnel by creation date silently drops live pipeline, and silence is the problem.
    excluded_open = sum(
        1
        for deal in scoped
        if deal.stage.kind is StageKind.OPEN and not created_within(deal, period_from, period_to)
    )

    return AnalyticsSummary(
        filters=AnalyticsFilters(
            pipeline_id=pipeline_id,
            owner_id=owner_id,
<<<<<<< Updated upstream
            partner_id=partner_id,
            close_from=close_from,
            close_to=close_to,
=======
            period=period,
            period_from=period_from,
            period_to=period_to,
>>>>>>> Stashed changes
            deal_count=len(deals),
            account_count=len({deal.account_id for deal in deals}),
            excluded_open_count=excluded_open,
        ),
        funnel=_funnel(templates, deals, pipeline_id),
        by_pipeline=_by_pipeline(deals),
        by_owner=_by_owner(deals),
        by_partner=_by_partner(deals),
        forecast=_forecast(open_deals),
        created=_created(
            deals, prior_deals, period, period_from, period_to, prior_from, prior_to, prior_label
        ),
        risks=_risks(
            open_deals, stages_by_pipeline, last_move, last_activity, actions, champion_gaps, today
        ),
        outcomes=_outcomes(deals),
        total_open_value=sum((deal.value for deal in open_deals), ZERO),
        deals=[
            _deal_row(deal, last_activity, stages_by_pipeline, last_move, today) for deal in deals
        ],
    )


def _deal_row(
    deal: Deal,
    last_activity: dict[uuid.UUID, datetime | None],
    stages_by_pipeline: dict[uuid.UUID, list],
    last_move: dict[uuid.UUID, datetime],
    today: date,
) -> AnalyticsDeal:
    """
    One deal flattened for the client to group and drill.

    Health comes through `deal_detail`, the same serializer the board and the dashboard use, rather than
    calling `deal_health` again here. Two derivations of the same dot would eventually disagree, and the
    disagreement would show up as a deal that is amber on a chart and green on the board.
    """
    detail = deal_detail(deal, last_activity)
    return AnalyticsDeal(
        id=deal.id,
        name=deal.name,
        account_name=deal.account.name,
        value=deal.value,
        pipeline_id=deal.pipeline_template_id,
        pipeline_name=deal.pipeline.name,
        stage_id=deal.stage_id,
        stage_name=deal.stage.name,
        stage_short_name=deal.stage.short_name,
        owner_id=deal.owner_id,
        owner_name=deal.owner.full_name,
        expected_close_date=deal.expected_close_date,
        created_at=deal.created_at,
        is_open=detail.is_open,
        health=detail.health,
        ageing=_ageing_read(
            ageing_service.deal_ageing(
                deal,
                stages_by_pipeline.get(deal.pipeline_template_id, []),
                last_move.get(deal.id),
                today,
            )
        ),
    )


def _ageing_read(value: ageing_service.Ageing | None) -> AgeingRead | None:
    if value is None:
        return None
    return AgeingRead(
        basis=value.basis,
        days_used=value.days_used,
        days_expected=value.days_expected,
        days_over=value.days_over,
        days_left=value.days_left,
    )


def _risks(
    open_deals: list[Deal],
    stages_by_pipeline: dict[uuid.UUID, list],
    last_move: dict[uuid.UUID, datetime],
    last_activity: dict[uuid.UUID, datetime | None],
    actions: dict[uuid.UUID, checklist_service.StageActions],
    champion_gaps: dict[uuid.UUID, object],
    today: date,
) -> RiskSummary:
    """
    The exception report: which deals have stopped moving, why, and what to do.

    Every reason is derived from something the deal already records — its age against the process, its own
    unticked deliverables, when anybody last logged anything, whether it has a reachable champion. Nothing is
    a static weight, which is the point: a probability multiplier applied to every deal alike cannot tell you
    which one needs a call.

    Reasons carry their action, and the action is a named deliverable wherever one exists. "This deal is
    stuck" without a next step just moves the problem to whoever read the report.

    Ordered by days over the allowance, worst first. Not by value: the report exists to find deals that have
    stopped, and sorting by size would bury a small deal that has been motionless for four months under a
    large one that is a week late. The client can re-sort.

    **Only four things qualify a deal for this list**: it is past its allowance, its close date has gone, it
    has been quiet too long, or it needs a champion it does not have. Outstanding deliverables and stages with
    no deliverables defined are attached as context to rows already flagged — a deal three days into a stage
    with an untouched checklist is on schedule, and putting it here would turn the exception report back into
    a list of every deal, which is what the requirement was written against.
    """
    rows: list[DealRisk] = []
    stuck_count = 0
    stuck_value = ZERO
    without_actions = 0

    for deal in open_deals:
        stages = stages_by_pipeline.get(deal.pipeline_template_id, [])
        age = ageing_service.deal_ageing(deal, stages, last_move.get(deal.id), today)
        if age is None:
            continue

        progress = actions.get(deal.id, checklist_service.StageActions(0, 0, None))
        # Creation counts as a touch, exactly as it does in `services.health`. A deal created this morning
        # with nothing logged against it is new, not neglected, and two definitions of "last touched" in one
        # application would eventually disagree on the same deal.
        touched = last_activity.get(deal.id)
        since = touched or deal.created_at
        days_quiet = (today - since.date()).days if since is not None else None

        reasons: list[RiskReason] = []

        if age.is_stuck:
            stuck_count += 1
            stuck_value += deal.value
            where = deal.stage.name
            reasons.append(
                RiskReason(
                    code="stuck",
                    detail=(
                        f"{age.days_used} days in {where}, {age.days_expected} expected — "
                        f"{age.days_over} over."
                        if age.basis == "stage"
                        else (
                            # The overrun stated, not left to be worked out. A reader given "90 days" and
                            # "allows 15" has to subtract before they know how bad it is, and the number they
                            # would arrive at is the one the list is sorted by.
                            f"{age.days_over} days past the {age.days_expected} the process allows to clear "
                            f"{where} — {age.days_used} days since it was created. No stage move has been "
                            f"logged, so this measures the whole cycle so far rather than this stage alone."
                        )
                    ),
                    action=(
                        f"Next: {progress.next_text}"
                        if progress.next_text
                        else "Agree a dated next step with the customer, or move the deal on."
                    ),
                )
            )

        overdue_by = (today - deal.expected_close_date).days
        if overdue_by > 0:
            reasons.append(
                RiskReason(
                    code="overdue",
                    detail=f"Close date passed {overdue_by} days ago.",
                    action="Re-date it against a real next step, or close it lost.",
                )
            )

        if days_quiet is not None and days_quiet > health_service.STALE_AFTER_DAYS:
            reasons.append(
                RiskReason(
                    code="cold",
                    detail=(
                        f"Nothing logged for {days_quiet} days."
                        if touched is not None
                        else f"Nothing has been logged in the {days_quiet} days since it was created."
                    ),
                    action="Make contact and log it, so the next person can see it happened.",
                )
            )

        gap = champion_gaps.get(deal.id)
        if gap is not None:
            reasons.append(
                RiskReason(
                    code="no-champion",
                    detail=getattr(gap, "detail", "This deal has no complete champion."),
                    action="Name a champion and record their email, phone and LinkedIn.",
                )
            )

        if progress.total == 0:
            without_actions += 1

        # Nothing below this line qualifies a deal for the report, and that division is what makes it an
        # *exception* report rather than a list of every deal. An untouched checklist three days into a stage
        # is a deal on schedule; a stage with no deliverables defined is an administrator's problem. Both are
        # worth saying **about a deal already flagged**, and neither is grounds for flagging one.
        if not reasons:
            continue

        if progress.total == 0:
            reasons.append(
                RiskReason(
                    code="no-actions-defined",
                    # Phrased as the configuration gap it is. A rep cannot fix a stage that was set up
                    # without deliverables, and a blank next-action cell would read as their omission.
                    detail=f"{deal.stage.name} defines no deliverables, so there is no next action to give.",
                    action="Add the stage's deliverables in Settings — Pipelines.",
                )
            )
        elif progress.outstanding > 0:
            reasons.append(
                RiskReason(
                    code="actions-outstanding",
                    detail=f"{progress.done} of {progress.total} actions done for {deal.stage.short_name}.",
                    action=f"Next: {progress.next_text}",
                )
            )

        rows.append(
            DealRisk(
                deal_id=deal.id,
                deal_name=deal.name,
                account_name=deal.account.name,
                owner_id=deal.owner_id,
                owner_name=deal.owner.full_name,
                stage_id=deal.stage_id,
                stage_name=deal.stage.name,
                stage_short_name=deal.stage.short_name,
                pipeline_id=deal.pipeline_template_id,
                pipeline_name=deal.pipeline.name,
                value=deal.value,
                expected_close_date=deal.expected_close_date,
                health=health_service.deal_health(deal, touched),
                ageing=_ageing_read(age),
                reasons=reasons,
                next_action=progress.next_text,
                actions_total=progress.total,
                actions_done=progress.done,
                days_since_activity=days_quiet,
            )
        )

    rows.sort(key=lambda row: (-row.ageing.days_over, -row.value, row.deal_name))

    return RiskSummary(
        deals=rows,
        stuck_count=stuck_count,
        stuck_value=stuck_value,
        open_count=len(open_deals),
        open_value=sum((deal.value for deal in open_deals), ZERO),
        without_actions_count=without_actions,
    )


def _funnel(templates, deals: list[Deal], pipeline_id: uuid.UUID | None) -> list[StageSlice]:
    """
    Count and value per stage.

    Every stage of every matching template appears, including those holding nothing. A
    funnel that omits its empty stages hides exactly the gap a reader is looking for.
    """
    by_stage: dict[uuid.UUID, list[Deal]] = defaultdict(list)
    for deal in deals:
        by_stage[deal.stage_id].append(deal)

    slices: list[StageSlice] = []
    for template in templates:
        if pipeline_id is not None and template.id != pipeline_id:
            continue
        for stage in sorted(template.stages, key=lambda item: item.position):
            in_stage = by_stage.get(stage.id, [])
            slices.append(
                StageSlice(
                    pipeline_id=template.id,
                    stage_id=stage.id,
                    stage_name=stage.name,
                    stage_short_name=stage.short_name,
                    color=stage.color,
                    probability=stage.probability,
                    position=stage.position,
                    count=len(in_stage),
                    value=sum((deal.value for deal in in_stage), ZERO),
                )
            )

    return slices


def _by_pipeline(deals: list[Deal]) -> list[PipelineSlice]:
    """
    Deals, companies and value per pipeline — the top level of the funnel drill.

    Accounts are counted distinct because several deals on one company is the normal case, and "how many
    companies" is a different question from "how many deals". Summing a per-deal account count would answer
    neither.
    """
    grouped: dict[uuid.UUID, list[Deal]] = defaultdict(list)
    names: dict[uuid.UUID, str] = {}
    for deal in deals:
        grouped[deal.pipeline_template_id].append(deal)
        names[deal.pipeline_template_id] = deal.pipeline.name

    slices = [
        PipelineSlice(
            pipeline_id=pipeline,
            pipeline_name=names[pipeline],
            count=len(rows),
            account_count=len({deal.account_id for deal in rows}),
            value=sum((deal.value for deal in rows), ZERO),
        )
        for pipeline, rows in grouped.items()
    ]
    slices.sort(key=lambda item: (-item.value, item.pipeline_name))
    return slices


def _by_owner(deals: list[Deal]) -> list[OwnerSlice]:
    """
    Value per individual — the "filterable by individuals" half of the feedback.

    Note this is not R11, the per-rep deal count deferred by `spec.md` §8. R11 was a
    breakdown on the Dashboard; this is a chart on a reporting screen the stakeholder asked
    for directly. The distinction is which surface it lives on.
    """
    grouped: dict[uuid.UUID, list[Deal]] = defaultdict(list)
    names: dict[uuid.UUID, str] = {}
    for deal in deals:
        grouped[deal.owner_id].append(deal)
        names[deal.owner_id] = deal.owner.full_name

    slices = [
        OwnerSlice(
            owner_id=owner_id,
            owner_name=names[owner_id],
            open_count=sum(1 for d in owned if d.stage.kind is StageKind.OPEN),
            open_value=sum((d.value for d in owned if d.stage.kind is StageKind.OPEN), ZERO),
            won_count=sum(1 for d in owned if d.stage.kind is StageKind.WON),
            won_value=sum((d.value for d in owned if d.stage.kind is StageKind.WON), ZERO),
            # Won plus lost. Returned so the client can print "3 of 5" instead of "60%", which on small
            # numbers is the difference between a fact and a flattering rounding.
            resolved_count=sum(
                1 for d in owned if d.stage.kind in (StageKind.WON, StageKind.LOST)
            ),
        )
        for owner_id, owned in grouped.items()
    ]
    slices.sort(key=lambda item: (-item.open_value, item.owner_name))
    return slices


def _by_partner(deals: list[Deal]) -> list[PartnerSlice]:
    """
    Value sourced through each partner, with a Direct row alongside.

    Direct is included on purpose: partner contribution only means something next to the
    business that arrived without a partner.
    """
    grouped: dict[uuid.UUID | None, list[Deal]] = defaultdict(list)
    names: dict[uuid.UUID | None, str] = {None: "Direct"}
    for deal in deals:
        grouped[deal.partner_id].append(deal)
        if deal.partner_id is not None and deal.partner is not None:
            names[deal.partner_id] = deal.partner.name

    slices = [
        PartnerSlice(
            partner_id=partner_id,
            partner_name=names.get(partner_id, "Unknown partner"),
            open_count=sum(1 for d in sourced if d.stage.kind is StageKind.OPEN),
            open_value=sum((d.value for d in sourced if d.stage.kind is StageKind.OPEN), ZERO),
            won_count=sum(1 for d in sourced if d.stage.kind is StageKind.WON),
            won_value=sum((d.value for d in sourced if d.stage.kind is StageKind.WON), ZERO),
        )
        for partner_id, sourced in grouped.items()
    ]
    # Direct last regardless of size, so the partner rows read as the subject of the chart.
    slices.sort(key=lambda item: (item.partner_id is None, -item.open_value, item.partner_name))
    return slices


def _forecast(open_deals: list[Deal]) -> list[ForecastSlice]:
    """
    Open value by expected close month.

    Open deals only. A forecast that included closed business would be a report of the past
    wearing a forecast's label.
    """
    grouped: dict[date, list[Deal]] = defaultdict(list)
    for deal in open_deals:
        month = deal.expected_close_date.replace(day=1)
        grouped[month].append(deal)

    return [
        ForecastSlice(
            month=month,
            label=month.strftime("%b %Y"),
            count=len(in_month),
            value=sum((deal.value for deal in in_month), ZERO),
        )
        for month, in_month in sorted(grouped.items())
    ]


def _created(
    deals: list[Deal],
    prior_deals: list[Deal],
    period: Period,
    period_from: date,
    period_to: date,
    prior_from: date,
    prior_to: date,
    prior_label: str,
) -> CreatedSummary:
    """
    How much pipeline was created in the window, bucketed, with the previous window bucketed the same way.

    Buckets are chosen so a reader never counts past about a dozen bars: days for a week, weeks for a month,
    months for a quarter or a year. Empty buckets are kept — a week with nothing created is the signal
    somebody opened this panel to find, and dropping it would draw a continuous line over a gap.

    The prior window is bucketed too, and the two lists are aligned by *position* rather than by date, which
    is the only thing that works across window lengths: February has four week-buckets and March has five, so
    pairing them by date would leave a bucket with no partner. Position pairing answers the question a reader
    actually asks — "how did the third week compare with the third week" — and the labels stay each window's
    own, so nothing pretends the dates line up.
    """
    edges = _bucket_edges(period, period_from, period_to)
    prior_edges = _bucket_edges(period, prior_from, prior_to)

    def fill(bounds: list[tuple[date, date]], rows: list[Deal]) -> list[CreatedBucket]:
        return [
            CreatedBucket(
                start=start,
                label=_bucket_label(period, start, index),
                count=len([d for d in rows if start <= d.created_at.date() <= end]),
                value=sum(
                    (d.value for d in rows if start <= d.created_at.date() <= end), ZERO
                ),
            )
            for index, (start, end) in enumerate(bounds)
        ]

    buckets = fill(edges, deals)
    prior_buckets = fill(prior_edges, prior_deals)

    # Truncated or padded to match, so the client can index one against the other without checking. A month
    # of five weeks compared against one of four would otherwise leave the last column with no partner.
    prior_buckets = prior_buckets[: len(buckets)]
    while len(prior_buckets) < len(buckets):
        index = len(prior_buckets)
        prior_buckets.append(
            CreatedBucket(
                start=buckets[index].start, label=buckets[index].label, count=0, value=ZERO
            )
        )

    return CreatedSummary(
        buckets=buckets,
        count=len(deals),
        value=sum((deal.value for deal in deals), ZERO),
        prior_count=len(prior_deals),
        prior_value=sum((deal.value for deal in prior_deals), ZERO),
        prior_label=prior_label,
        prior_buckets=prior_buckets,
    )


def _bucket_edges(period: Period, start: date, end: date) -> list[tuple[date, date]]:
    """Inclusive bucket bounds covering the window exactly, with the last bucket clipped to the end."""
    if period == "week":
        return [(start + timedelta(days=i), start + timedelta(days=i)) for i in range(7)]

    if period == "month":
        edges: list[tuple[date, date]] = []
        cursor = start
        while cursor <= end:
            close = min(cursor + timedelta(days=6), end)
            edges.append((cursor, close))
            cursor = close + timedelta(days=1)
        return edges

    months = 3 if period == "quarter" else 12
    return [
        (_add_months(start, i), _month_end(_add_months(start, i)))
        for i in range(months)
    ]


def _bucket_label(period: Period, start: date, index: int) -> str:
    if period == "week":
        return start.strftime("%a")
    if period == "month":
        # "w/c 3 Aug" — a week inside a month has no name, so it is identified by the day it starts.
        return f"w/c {start.day} {start.strftime('%b')}"
    return start.strftime("%b")


def _outcomes(deals: list[Deal]) -> OutcomeMix:
    won = [deal for deal in deals if deal.stage.kind is StageKind.WON]
    lost = [deal for deal in deals if deal.stage.kind is StageKind.LOST]
    still_open = [deal for deal in deals if deal.stage.kind is StageKind.OPEN]

    decided = len(won) + len(lost)

    return OutcomeMix(
        won_count=len(won),
        won_value=sum((deal.value for deal in won), ZERO),
        lost_count=len(lost),
        lost_value=sum((deal.value for deal in lost), ZERO),
        open_count=len(still_open),
        open_value=sum((deal.value for deal in still_open), ZERO),
        # Denominator is decided deals only. Including open ones would report a win rate
        # that falls every time somebody adds a deal, which describes pipeline growth
        # rather than how well the team closes.
        win_rate=round(len(won) / decided * 100, 1) if decided else 0.0,
    )
