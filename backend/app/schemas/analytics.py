"""
Wire shapes for the analytics screen.

Two things govern all of them.

**There is no weighted value anywhere.** It used to be `value * stage_probability / 100`, on every slice
here. A stage's percentage describes how far along a deal is, not how likely it is to be won, so that
multiplication produced a figure which looked like expected revenue and was not. It is removed rather than
renamed: a wrong number with an honest label is still a wrong number.

**The deal list travels with the summary.** Every panel on the screen can be drilled into its deals, and the
alternative — a request per drill — would let the drilled rows describe a slightly different set from the
bars they came out of. One request, one set of deals, so a total and its parts can never disagree. The cost
is that the response carries every matching deal; it is the same set the client already loads for the deals
index, so this is not new weight for the browser.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from app.models.enums import Health
from app.schemas.common import ORMModel

#: Which window the whole screen describes, by deal *created* date.
#:
#: Scoping everything rather than only the creation panel is a deliberate choice with a real consequence: a
#: deal created eight months ago and still open falls outside "this quarter", so the funnel describes recent
#: cohorts rather than the live pipeline. `excluded_open_count` below exists so that omission is stated on
#: screen instead of being silent.
Period = Literal["week", "month", "quarter", "year"]


class AgeingRead(ORMModel):
    """
    How long a deal has been where it is, and against what.

    `basis` is reported rather than hidden because the two measures make different claims. `stage` is measured
    from a logged move and is about the current stage alone; `cycle` is measured from creation against every
    stage up to here, and is used when no move was ever recorded. Presenting them identically would overstate
    the weaker one — "47 days in Validate" and "151 days to reach Validate" are not the same sentence.
    """

    basis: Literal["stage", "cycle"]
    days_used: int
    #: Null when the stages carry no expected duration, in which case nothing is judged.
    days_expected: int | None
    days_over: int
    days_left: int | None


class RiskReason(ORMModel):
    """
    One thing wrong with a deal, and the thing to do about it.

    The pair is the point. A report that says a deal is stuck and stops there moves the problem to whoever
    read it; every reason here carries the action it implies, and the action is drawn from what the deal
    already records — usually its own next unticked deliverable.
    """

    #: Stable key for the UI to style and group by: "stuck", "overdue", "cold", "no-champion",
    #: "actions-outstanding", "no-actions-defined".
    code: str
    #: One sentence naming what is wrong, with the specifics in it.
    detail: str
    #: What to do, in the imperative. Never generic advice — either a named deliverable or a concrete step.
    action: str


class DealRisk(ORMModel):
    """
    A deal needing intervention, with everything an administrator needs to intervene.

    Answers the four questions in one row: **who** is the owner, **where** is the stage, **why** are the
    reasons, and **what action** is the first outstanding deliverable. Nothing here is a score — a number
    between 0 and 100 would compress the reasons back into something nobody can act on.
    """

    deal_id: uuid.UUID
    deal_name: str
    account_name: str
    owner_id: uuid.UUID
    owner_name: str
    stage_id: uuid.UUID
    stage_name: str
    stage_short_name: str
    pipeline_id: uuid.UUID
    pipeline_name: str
    value: Decimal
    expected_close_date: date
    health: Health
    ageing: AgeingRead
    reasons: list[RiskReason]
    #: The next unticked deliverable on the current stage, and the progress behind it. `actions_total` of
    #: zero means the stage defines none — a gap in the pipeline's own setup, not a finished checklist.
    next_action: str | None
    actions_total: int
    actions_done: int
    #: Days since anybody logged anything. Null when nothing ever has been.
    days_since_activity: int | None


class RiskSummary(ORMModel):
    """
    The exception report, worst first.

    Ordered by days over the allowance rather than by value, because the requirement is about deals that have
    stopped moving. The client can re-sort by value; the default answers the question the report exists for.
    """

    deals: list[DealRisk]
    #: How many open deals are past their allowance, and what they are worth. The headline pair.
    stuck_count: int
    stuck_value: Decimal
    #: Open deals in scope, so the stuck figure has a denominator instead of floating free.
    open_count: int
    open_value: Decimal
    #: Deals whose stage defines no deliverables. Counted separately because it is a configuration gap that
    #: no rep can fix, and it would otherwise sit in the list looking like their fault.
    without_actions_count: int


class AnalyticsDeal(ORMModel):
    """
    One deal, flat, carrying every key the client groups by.

    A single flat list rather than a copy of the deals inside each slice: the same deal appears in a stage, a
    pipeline, an owner, a close month and a created bucket, and repeating it five times would be five chances
    for the copies to disagree.
    """

    id: uuid.UUID
    name: str
    account_name: str
    value: Decimal
    pipeline_id: uuid.UUID
    pipeline_name: str
    stage_id: uuid.UUID
    stage_name: str
    stage_short_name: str
    owner_id: uuid.UUID
    owner_name: str
    expected_close_date: date
    created_at: datetime
    is_open: bool
    health: Health
    #: Null on closed deals, which are exempt: a won deal that took nine months took nine months.
    ageing: AgeingRead | None = None


class StageSlice(ORMModel):
    """One stage in the funnel. Empty stages are included — an empty stage is information."""

    #: Which pipeline this stage belongs to. Needed because the response carries every pipeline's stages
    #: when no pipeline filter is set, and the client drills into one of them — without this it would draw
    #: two processes as one funnel, which is the exact confusion the drill exists to prevent.
    pipeline_id: uuid.UUID
    stage_id: uuid.UUID
    stage_name: str
    stage_short_name: str
    color: str
    #: How far along the deal is, not a likelihood. Returned as a plain label for the axis; nothing
    #: multiplies by it.
    probability: int
    position: int
    count: int
    value: Decimal


class PipelineSlice(ORMModel):
    """
    One pipeline, for the all-pipelines view.

    `account_count` is distinct accounts, not deals: several deals on one account is the normal case, and
    "how many companies is this" is a different question from "how many deals".
    """

    pipeline_id: uuid.UUID
    pipeline_name: str
    count: int
    account_count: int
    value: Decimal


class OwnerSlice(ORMModel):
    owner_id: uuid.UUID
    owner_name: str
    open_count: int
    open_value: Decimal
    won_count: int
    won_value: Decimal
    #: Resolved deals, so the win rate can be printed with its denominator. A 1-of-1 shown as "100%" reads
    #: as competence; shown as "1 of 1" it reads as what it is.
    resolved_count: int


class ForecastSlice(ORMModel):
    """One close month. `month` is the first day of that month, for stable sorting."""

    month: date
    label: str
    count: int
    value: Decimal


class CreatedBucket(ORMModel):
    """
    Pipeline created in one bucket inside the selected period.

    Buckets are weeks inside a month and months inside a quarter or year — a period always divides into
    something a person can compare across without counting past a dozen bars.
    """

    start: date
    label: str
    count: int
    value: Decimal


class CreatedSummary(ORMModel):
    """
    What was created in the period, and what was created in the one before it.

    The prior figure is here because a creation number alone cannot say whether it is good. Same length of
    window, immediately preceding, so the comparison is like for like.
    """

    buckets: list[CreatedBucket]
    count: int
    value: Decimal
    prior_count: int
    prior_value: Decimal
    prior_label: str
    #: The previous window bucketed the same way, so the chart can draw it *behind* this one.
    #:
    #: Bucketed rather than only totalled because the comparison a reader wants is per bucket: "March was
    #: our month last year too" is a different finding from "we created more last year". Always the same
    #: length as `buckets`, so the two align position for position.
    prior_buckets: list[CreatedBucket]


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
    period: Period
    #: The window the period resolved to, so the screen can name the dates rather than only the word.
    period_from: date
    period_to: date
    deal_count: int
    account_count: int
    #: Open deals created *before* the window, and therefore absent from every panel. Printed on screen,
    #: because scoping the whole page by created date hides live pipeline and that should not be silent.
    excluded_open_count: int


class AnalyticsSummary(ORMModel):
    filters: AnalyticsFilters
    funnel: list[StageSlice]
    by_pipeline: list[PipelineSlice]
    by_owner: list[OwnerSlice]
    forecast: list[ForecastSlice]
    created: CreatedSummary
    risks: RiskSummary
    outcomes: OutcomeMix
    total_open_value: Decimal
    #: Every deal in scope, for drilling. See the module docstring for why it travels with the summary.
    deals: list[AnalyticsDeal]


__all__ = [
    "AgeingRead",
    "AnalyticsDeal",
    "AnalyticsFilters",
    "AnalyticsSummary",
    "CreatedBucket",
    "CreatedSummary",
    "ForecastSlice",
    "OutcomeMix",
    "OwnerSlice",
    "Period",
    "DealRisk",
    "PipelineSlice",
    "RiskReason",
    "RiskSummary",
    "StageSlice",
]
