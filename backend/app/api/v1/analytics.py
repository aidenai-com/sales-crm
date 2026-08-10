"""
Aggregations for the Analytics screen.

Split out of the Dashboard rather than added to it. `spec.md` §4.1 calls the Dashboard "an
action surface, not a reporting surface", and it had drifted into six stacked sections of
reporting. The charts belong on their own screen, behind filters; the Dashboard keeps only
what a rep can act on today.

Aggregation happens in Python over the already-scoped deal list rather than in SQL. The same
list is what the Dashboard and the board already load, the row counts are internal-CRM sized,
and doing it here means every figure passes through the same `deal_detail` derivation — so a
chart can never disagree with a board about a deal's health or weighted value.
"""

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.models import Deal, StageKind
from app.repositories import deals as deals_repo
from app.schemas.analytics import (
    AnalyticsFilters,
    AnalyticsSummary,
    ForecastSlice,
    OutcomeMix,
    OwnerSlice,
    PartnerSlice,
    StageSlice,
)
from app.services import pipelines as pipeline_service

router = APIRouter(prefix="/analytics", tags=["analytics"])

ZERO = Decimal("0")


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    db: DbSession,
    user: CurrentUser,
    pipeline_id: uuid.UUID | None = Query(default=None),
    owner_id: uuid.UUID | None = Query(default=None),
    partner_id: uuid.UUID | None = Query(default=None),
    close_from: date | None = Query(default=None),
    close_to: date | None = Query(default=None),
) -> AnalyticsSummary:
    """
    Every chart on the Analytics screen, in one round trip.

    All five series share one filtered deal set, so they cannot disagree with each other —
    five endpoints filtered independently would eventually be read side by side and found
    inconsistent.
    """
    deals = await deals_repo.list_all(db, user, pipeline_id=pipeline_id, owner_id=owner_id)
    templates = await pipeline_service.list_templates(db)

    if partner_id is not None:
        deals = [deal for deal in deals if deal.partner_id == partner_id]
    if close_from is not None:
        deals = [deal for deal in deals if deal.expected_close_date >= close_from]
    if close_to is not None:
        deals = [deal for deal in deals if deal.expected_close_date <= close_to]

    open_deals = [deal for deal in deals if deal.stage.kind is StageKind.OPEN]

    return AnalyticsSummary(
        filters=AnalyticsFilters(
            pipeline_id=pipeline_id,
            owner_id=owner_id,
            partner_id=partner_id,
            close_from=close_from,
            close_to=close_to,
            deal_count=len(deals),
        ),
        funnel=_funnel(templates, deals, pipeline_id),
        by_owner=_by_owner(deals),
        by_partner=_by_partner(deals),
        forecast=_forecast(open_deals),
        outcomes=_outcomes(deals),
        total_open_value=sum((deal.value for deal in open_deals), ZERO),
        total_weighted_value=sum((_weighted(deal) for deal in open_deals), ZERO),
    )


def _weighted(deal: Deal) -> Decimal:
    """
    `Decimal(deal.value)` rather than `deal.value` directly.

    A `Numeric` column read back from Postgres is already a Decimal, but a value just
    assigned in Python may still be an int — and `int * int / 100` is a float, which then
    refuses to sum with the Decimal accumulator. Coercing here keeps every total exact
    regardless of where the value came from, which is the same reason `value` is Numeric
    rather than float in the first place.
    """
    return (Decimal(deal.value) * deal.stage.probability) / 100


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
                    stage_id=stage.id,
                    stage_name=stage.name,
                    stage_short_name=stage.short_name,
                    color=stage.color,
                    probability=stage.probability,
                    position=stage.position,
                    count=len(in_stage),
                    value=sum((deal.value for deal in in_stage), ZERO),
                    weighted_value=sum((_weighted(deal) for deal in in_stage), ZERO),
                )
            )

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
            weighted_value=sum((_weighted(d) for d in owned if d.stage.kind is StageKind.OPEN), ZERO),
            won_count=sum(1 for d in owned if d.stage.kind is StageKind.WON),
            won_value=sum((d.value for d in owned if d.stage.kind is StageKind.WON), ZERO),
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
            weighted_value=sum((_weighted(deal) for deal in in_month), ZERO),
        )
        for month, in_month in sorted(grouped.items())
    ]


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
