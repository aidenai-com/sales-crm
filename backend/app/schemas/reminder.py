import uuid
from datetime import datetime

from pydantic import Field

from app.models.enums import ActivitySubjectType
from app.schemas.common import ORMModel, PayloadModel


class ReminderRead(ORMModel):
    id: uuid.UUID
    title: str
    due_at: datetime
    assignee_id: uuid.UUID
    assignee_name: str
    completed_at: datetime | None
    # Flattened from whichever of account_id / lead_id / deal_id is set, matching how
    # activities already present themselves.
    subject_type: ActivitySubjectType
    subject_id: uuid.UUID
    subject_label: str
    #: True when `due_at` has passed and nobody has completed it.
    overdue: bool


class ReminderCreate(PayloadModel):
    subject_type: ActivitySubjectType
    subject_id: uuid.UUID
    title: str = Field(min_length=1)
    due_at: datetime
    #: Defaults to the signed-in user. A rep may not assign to anybody else.
    assignee_id: uuid.UUID | None = None


class ReminderUpdate(PayloadModel):
    title: str | None = Field(default=None, min_length=1)
    due_at: datetime | None = None
    assignee_id: uuid.UUID | None = None


class StaleLeadNudge(ORMModel):
    """
    A lead nobody has touched for a week.

    Derived on every read rather than stored: a staleness flag written to a row is wrong the
    moment a day passes without anybody writing to it again. See `app.services.reminders`.

    There is no id to complete or dismiss — the nudge disappears when the lead is worked,
    which is the only outcome that should make it disappear.
    """

    lead_id: uuid.UUID
    business_unit: str
    account_id: uuid.UUID
    account_name: str
    owner_id: uuid.UUID
    owner_name: str
    #: Null when the lead has never had any activity at all.
    last_activity_at: datetime | None
    days_quiet: int
    open_deal_count: int


class ReminderInbox(ORMModel):
    """
    What greets a user on opening the app.

    Two independent sources in one payload, because the surface is one card and two requests
    would let half of it arrive late.
    """

    overdue: list[ReminderRead]
    upcoming: list[ReminderRead]
    stale_leads: list[StaleLeadNudge]
    #: Everything above, counted once, for the nav badge.
    total_count: int


__all__ = [
    "ReminderCreate",
    "ReminderInbox",
    "ReminderRead",
    "ReminderUpdate",
    "StaleLeadNudge",
]
