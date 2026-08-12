"""
Model package.

Every model is imported here so that `Base.metadata` is fully populated before Alembic
autogenerate or `create_all` runs. Import order matters only for readability; SQLAlchemy
resolves relationships by name.
"""

from app.models.account import Account, Lead
from app.models.activity import Activity
from app.models.deal import Deal
from app.models.assistant import AssistantUsage
from app.models.contact import Contact, ContactRole, DealContact, DealRole
from app.models.deliverable import Attachment, DealDeliverableCompletion
from app.models.enums import (
    ActivityKind,
    ActivitySubjectType,
    ContactType,
    Health,
    StageKind,
    UserRole,
)
from app.models.pipeline import PipelineTemplate, Stage, StageDeliverable
from app.models.reminder import Reminder
from app.models.user import User

__all__ = [
    "Account",
    "Activity",
    "ActivityKind",
    "ActivitySubjectType",
    "AssistantUsage",
    "Attachment",
    "Contact",
    "ContactRole",
    "ContactType",
    "Deal",
    "DealContact",
    "DealRole",
    "DealDeliverableCompletion",
    "Health",
    "Lead",
    "PipelineTemplate",
    "Reminder",
    "Stage",
    "StageDeliverable",
    "StageKind",
    "User",
    "UserRole",
]
