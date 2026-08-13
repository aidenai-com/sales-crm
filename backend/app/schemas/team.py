import uuid
from decimal import Decimal

from app.schemas.common import ORMModel
from app.schemas.crm import DealDetail


class RepStageSlice(ORMModel):
    """Where one rep's deals sit in a single stage."""

    stage_id: uuid.UUID
    stage_name: str
    stage_short_name: str
    color: str
    count: int
    value: Decimal


class RepPerformance(ORMModel):
    """
    One row of the per-rep table. This is BRD R11, which spec.md deferred to a later phase
    and which has now been asked for.
    """

    user_id: uuid.UUID
    name: str
    initials: str
    job_title: str
    role: str

    open_count: int
    open_value: Decimal
    at_risk_count: int
    closing_this_week_count: int
    won_count: int
    won_value: Decimal

    #: Activity logged in the last 30 days. Named in full rather than `activity_30d`,
    #: which camelises to the surprising `activity30D`.
    #:
    #: A weak proxy for effort — easy to game, and a rep working one large deal will log
    #: less than one working ten small ones. Useful for spotting silence, not for ranking.
    recent_activity_count: int
    #: Deals with nothing logged for 21+ days, or nothing ever.
    stalled_count: int

    stage_slices: list[RepStageSlice]


class StaleDeal(ORMModel):
    deal: DealDetail
    owner_name: str
    days_since_touch: int | None


class TeamOverview(ORMModel):
    reps: list[RepPerformance]
    #: Deals nobody has touched recently, worst first. Actionable rather than a scoreboard.
    stale_deals: list[StaleDeal]
    total_open_value: Decimal
    total_at_risk: int
