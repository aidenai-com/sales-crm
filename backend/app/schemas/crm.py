import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, computed_field

from app.models.enums import ActivityKind, ActivitySubjectType, Health
from app.schemas.auth import UserRead
from app.schemas.common import ORMModel, PayloadModel

# --- Accounts and leads ------------------------------------------------------


class AccountRead(ORMModel):
    id: uuid.UUID
    name: str
    industry: str
    is_partner: bool
    owner_id: uuid.UUID


class AccountCreate(PayloadModel):
    name: str = Field(min_length=1, max_length=255)
    industry: str = Field(default="", max_length=120)
    is_partner: bool = False
    owner_id: uuid.UUID


class AccountUpdate(PayloadModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    industry: str | None = Field(default=None, max_length=120)
    is_partner: bool | None = None
    owner_id: uuid.UUID | None = None


class LeadRead(ORMModel):
    id: uuid.UUID
    account_id: uuid.UUID
    business_unit: str
    owner_id: uuid.UUID


class LeadCreate(PayloadModel):
    account_id: uuid.UUID
    business_unit: str = Field(min_length=1, max_length=255)
    owner_id: uuid.UUID


class LeadUpdate(PayloadModel):
    business_unit: str | None = Field(default=None, min_length=1, max_length=255)
    owner_id: uuid.UUID | None = None


# --- Deals -------------------------------------------------------------------


class DealRead(ORMModel):
    id: uuid.UUID
    name: str
    #: Creation counts as a touch when deriving health; see services/health.py.
    created_at: datetime
    account_id: uuid.UUID
    lead_id: uuid.UUID | None
    partner_id: uuid.UUID | None
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
    partner_name: str | None
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
    partner_id: uuid.UUID | None = None
    pipeline_template_id: uuid.UUID
    stage_id: uuid.UUID
    value: Decimal = Field(default=Decimal("0"), ge=0)
    expected_close_date: date
    owner_id: uuid.UUID
    # No `currency`. All values are USD, enforced by a check constraint on the table. A
    # field nothing may vary should not be settable — offering it would imply the roll-ups
    # and the Excel export convert, and they do not.


class DealUpdate(PayloadModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    lead_id: uuid.UUID | None = None
    partner_id: uuid.UUID | None = None
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
    "StageBucket",
    "UserRead",
]
