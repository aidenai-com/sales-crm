import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, computed_field

from app.models.enums import ActivityKind, ActivitySubjectType, Health
from app.schemas.auth import UserRead
from app.schemas.common import ORMModel, PayloadModel
from app.schemas.contact import DealContactAssignment

# --- Accounts and leads ------------------------------------------------------


class AccountRead(ORMModel):
    id: uuid.UUID
    name: str
    industry: str
    owner_id: uuid.UUID
    # `name_normalized` is deliberately absent. It is an internal comparison key, not information
    # about the company, and exposing it would invite a client to compute its own version.


class SimilarAccount(ORMModel):
    """
    A possible duplicate, shown while someone types a new account name.

    Carries `reason` and `blocks_creation` rather than leaving the client to infer severity from
    `score`: an exact normalized collision is refused outright, a trigram resemblance is only a
    prompt, and those two need to look different on screen.
    """

    id: uuid.UUID
    name: str
    industry: str
    owner_name: str
    #: Trigram similarity, 0..1. Zero for the exact and prefix routes, which do not compute one.
    score: float
    #: How this match was found: "exact", "normalized", "prefix" or "fuzzy".
    reason: str
    blocks_creation: bool


class AccountCreate(PayloadModel):
    name: str = Field(min_length=1, max_length=255)
    industry: str = Field(default="", max_length=120)
    #: Defaults to whoever is creating it. Anybody may create an account, and the person filing a company
    #: is almost always the person who will work it — asking is a question with one sensible answer.
    #:
    #: An administrator may still name somebody else here, and reassign later. A rep sending another
    #: user's id is refused by `require_own_assignment`, which treats a null as "myself".
    owner_id: uuid.UUID | None = None


class AccountUpdate(PayloadModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    industry: str | None = Field(default=None, max_length=120)
    #: Administrators only, enforced by `require_no_owner_change`.
    owner_id: uuid.UUID | None = None


class LeadRead(ORMModel):
    id: uuid.UUID
    account_id: uuid.UUID
    business_unit: str
    # No `owner_id`. Only accounts and deals have an owner; a business unit's stewardship follows its
    # account. The account tree still reports an `owner_name` at this level, read from the account.


class LeadCreate(PayloadModel):
    account_id: uuid.UUID
    business_unit: str = Field(min_length=1, max_length=255)


class LeadUpdate(PayloadModel):
    business_unit: str | None = Field(default=None, min_length=1, max_length=255)


# --- Deals -------------------------------------------------------------------


class DealRead(ORMModel):
    id: uuid.UUID
    name: str
    #: Creation counts as a touch when deriving health; see services/health.py.
    created_at: datetime
    account_id: uuid.UUID
    lead_id: uuid.UUID | None
    pipeline_template_id: uuid.UUID
    stage_id: uuid.UUID
    value: Decimal
    currency: str
    expected_close_date: date
    owner_id: uuid.UUID


class DealDetail(DealRead):
    """
    A deal with everything the UI needs to render it without further lookups, including
    the derived health that is never stored.
    """

    health: Health
    account_name: str
    lead_business_unit: str | None
    stage_name: str
    stage_short_name: str
    stage_probability: int
    stage_color: str
    pipeline_name: str
    owner_name: str
    is_open: bool
    last_activity_at: datetime | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def weighted_value(self) -> Decimal:
        return (self.value * self.stage_probability) / 100


class DealCreate(PayloadModel):
    name: str = Field(min_length=1, max_length=255)
    account_id: uuid.UUID
    lead_id: uuid.UUID | None = None
    pipeline_template_id: uuid.UUID
    stage_id: uuid.UUID
    value: Decimal = Field(default=Decimal("0"), ge=0)
    expected_close_date: date
    owner_id: uuid.UUID
    #: Who is involved and in what capacity, set at creation.
    #:
    #: Optional here, and deliberately so. "A deal must have at least one contact" is enforced by the
    #: create form, which will not enable its submit button without one — not by this schema. Two
    #: reasons: a `min_length=1` would make Pydantic reject the payload *before* the ownership check
    #: runs, turning a rep's 403 into a 422, and it would break every existing caller of this endpoint
    #: with no compatibility window.
    #:
    #: The cost is real and worth stating: a caller that is not the form — a script, a seed, an
    #: integration — can create a deal with nobody attached, and nothing here will stop it. If that
    #: becomes a problem, the fix is a `min_length` and a migration for the rows already created, not a
    #: second check somewhere else.
    #:
    #: A champion is not required at creation under any circumstances — qualification is exactly the
    #: stage where a rep legitimately does not have one yet, and the stage gate asks on the way out.
    #:
    #: A contact may arrive with no role. The creator pulls people in from the directory and works out
    #: what each of them is as the deal progresses.
    contacts: list[DealContactAssignment] = Field(default_factory=list)
    #: The roles this deal will track, whether or not anybody fills them yet. Chosen at creation and
    #: extendable at any time by the deal's owner.
    roles: list[uuid.UUID] = Field(default_factory=list)
    # No `currency`. All values are USD, enforced by a check constraint on the table. A
    # field nothing may vary should not be settable — offering it would imply the roll-ups
    # and the Excel export convert, and they do not.


class DealUpdate(PayloadModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    lead_id: uuid.UUID | None = None
    stage_id: uuid.UUID | None = None
    value: Decimal | None = Field(default=None, ge=0)
    expected_close_date: date | None = None
    owner_id: uuid.UUID | None = None


class DealStageMove(PayloadModel):
    stage_id: uuid.UUID


# --- Activities --------------------------------------------------------------


class ActivityRead(ORMModel):
    id: uuid.UUID
    kind: ActivityKind
    summary: str
    author_id: uuid.UUID
    occurred_at: datetime
    # Flattened from whichever of account_id / lead_id / deal_id is set, so the client
    # sees one simple pair rather than three nullable columns.
    subject_type: ActivitySubjectType
    subject_id: uuid.UUID


class ActivityDetail(ActivityRead):
    author_name: str
    subject_label: str


class ActivityCreate(PayloadModel):
    subject_type: ActivitySubjectType
    subject_id: uuid.UUID
    kind: ActivityKind
    summary: str = Field(min_length=1)
    # Defaults to the signed-in user when omitted.
    author_id: uuid.UUID | None = None
    occurred_at: datetime | None = None


# --- Account tree (R3) -------------------------------------------------------


class RollUp(ORMModel):
    open_value: Decimal
    open_count: int
    health: Health


class LeadNode(ORMModel):
    id: uuid.UUID
    business_unit: str
    owner_name: str
    deals: list[DealDetail]
    roll_up: RollUp


class AccountNode(ORMModel):
    id: uuid.UUID
    name: str
    industry: str
    owner_name: str
    leads: list[LeadNode]
    # Deals that roll up to the account without sitting under a business unit.
    direct_deals: list[DealDetail]
    roll_up: RollUp


# --- Dashboard ---------------------------------------------------------------


class DashboardMetrics(ORMModel):
    open_pipeline_value: Decimal
    weighted_pipeline_value: Decimal
    advanced_stage_count: int
    closing_this_week_count: int
    needs_attention_count: int


class StageBucket(ORMModel):
    stage_id: uuid.UUID
    stage_name: str
    stage_short_name: str
    probability: int
    color: str
    count: int
    value: Decimal


class PipelineHealth(ORMModel):
    pipeline_id: uuid.UUID
    pipeline_name: str
    buckets: list[StageBucket]


class DashboardSummary(ORMModel):
    metrics: DashboardMetrics
    high_priority: list[DealDetail]
    pipeline_health: list[PipelineHealth]
    recent_activity: list[ActivityDetail]


__all__ = [
    "AccountCreate",
    "AccountNode",
    "AccountRead",
    "AccountUpdate",
    "ActivityCreate",
    "ActivityDetail",
    "ActivityRead",
    "DashboardMetrics",
    "DashboardSummary",
    "DealCreate",
    "DealDetail",
    "DealRead",
    "DealStageMove",
    "DealUpdate",
    "LeadCreate",
    "LeadNode",
    "LeadRead",
    "LeadUpdate",
    "PipelineHealth",
    "RollUp",
    "SimilarAccount",
    "StageBucket",
    "UserRead",
]


class NudgeResult(ORMModel):
    """What the client needs to show after an admin chases a deal's owner."""

    deal_id: uuid.UUID
    owner_id: uuid.UUID
    owner_name: str
    #: The reminder created in the owner's inbox — the nudge is not only an email.
    reminder_id: uuid.UUID
    nudged_at: datetime
    detail: str
