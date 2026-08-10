import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import ActivityKind, ActivitySubjectType


class Activity(UUIDMixin, TimestampMixin, Base):
    """
    Activity logged against an account, a lead, or a deal (R4).

    Stored as three nullable foreign keys with a constraint that exactly one is set,
    rather than a bare (subject_type, subject_id) pair. The pair is friendlier in the API
    but cannot be a foreign key, so deleting a record would leave orphaned activity. The
    API still exposes `subject_type` / `subject_id`, computed from whichever column is set,
    so the wire format stays simple.
    """

    __tablename__ = "activities"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(account_id, lead_id, deal_id) = 1",
            name="exactly_one_subject",
        ),
    )

    account_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=True, index=True
    )
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("deals.id", ondelete="CASCADE"), nullable=True, index=True
    )

    kind: Mapped[ActivityKind] = mapped_column(
        Enum(ActivityKind, name="activity_kind", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)

    author_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    author: Mapped["User"] = relationship(lazy="joined")  # noqa: F821
    account: Mapped["Account | None"] = relationship()  # noqa: F821
    lead: Mapped["Lead | None"] = relationship()  # noqa: F821
    deal: Mapped["Deal | None"] = relationship()  # noqa: F821

    @property
    def subject_type(self) -> ActivitySubjectType:
        if self.deal_id is not None:
            return ActivitySubjectType.DEAL
        if self.lead_id is not None:
            return ActivitySubjectType.LEAD
        return ActivitySubjectType.ACCOUNT

    @property
    def subject_id(self) -> uuid.UUID:
        return self.deal_id or self.lead_id or self.account_id  # type: ignore[return-value]

    def __repr__(self) -> str:
        return f"<Activity {self.kind.value} on {self.subject_type.value}>"
