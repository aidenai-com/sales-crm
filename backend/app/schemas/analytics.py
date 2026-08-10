import uuid
from datetime import date
from decimal import Decimal

from app.schemas.common import ORMModel


class StageSlice(ORMModel):
    """One stage in the funnel. Empty stages are included — an empty stage is information."""

    stage_id: uuid.UUID
    stage_name: str
    stage_short_name: str
    color: str
    probability: int
    position: int
    count: int
    value: Decimal
    weighted_value: Decimal


class OwnerSlice(ORMModel):
    owner_id: uuid.UUID
    owner_name: str
    open_count: int
    open_value: Decimal
    weighted_value: Decimal
    won_count: int
    won_value: Decimal


class PartnerSlice(ORMModel):
    """
    Value sourced through a partner (R8).

    `partner_id` is null for the "Direct" row, which is deliberately included: partner
    contribution is only meaningful next to the business that arrived without one.
    """

    partner_id: uuid.UUID | None
    partner_name: str
    open_count: int
    open_value: Decimal
    won_count: int
    won_value: Decimal


class ForecastSlice(ORMModel):
    """One close month. `month` is the first day of that month, for stable sorting."""

    month: date
    label: str
    count: int
    value: Decimal
    weighted_value: Decimal


class OutcomeMix(ORMModel):
    won_count: int
    won_value: Decimal
    lost_count: int
    lost_value: Decimal
    open_count: int
    open_value: Decimal

    #: Won as a share of decided deals, 0–100. Open deals are excluded from the denominator:
    #: counting them as not-yet-won would report a win rate that only ever falls as the
    #: pipeline grows.
    win_rate: float


class AnalyticsFilters(ORMModel):
    """Echoed back so the client can confirm what the numbers actually describe."""

    pipeline_id: uuid.UUID | None
    owner_id: uuid.UUID | None
    partner_id: uuid.UUID | None
    close_from: date | None
    close_to: date | None
    deal_count: int


class AnalyticsSummary(ORMModel):
    filters: AnalyticsFilters
    funnel: list[StageSlice]
    by_owner: list[OwnerSlice]
    by_partner: list[PartnerSlice]
    forecast: list[ForecastSlice]
    outcomes: OutcomeMix
    total_open_value: Decimal
    total_weighted_value: Decimal


__all__ = [
    "AnalyticsFilters",
    "AnalyticsSummary",
    "ForecastSlice",
    "OutcomeMix",
    "OwnerSlice",
    "PartnerSlice",
    "StageSlice",
]
