import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import ActivitySubjectType


class Reminder(UUIDMixin, TimestampMixin, Base):
    """
    A follow-up a rep scheduled against an account, a lead, or a deal.

    Structured exactly like `Activity`: three nullable foreign keys with a constraint that
    exactly one is set, rather than a `(subject_type, subject_id)` pair. The pair reads
    better on the wire but cannot be a foreign key, so deleting a deal would leave reminders
    pointing at nothing. The API still exposes `subject_type` / `subject_id` as computed
    properties, so the wire format stays simple either way.

    This table holds only reminders somebody typed. The other half of the feature — nudging
    an owner about a lead nobody has touched for a week — is derived on read in
    `app.services.reminders` and deliberately not stored: a staleness flag written to a row
    is wrong the moment a day passes without anybody writing to it again.
    """

    __tablename__ = "reminders"
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

    title: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    assignee_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    #: Stamped by the sweep in `app.services.reminders`. Its only job is to stop the same
    #: reminder emailing somebody on every pass; a nudge that arrives four times an hour
    #: gets filtered, and then the ones that matter get filtered too.
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    assignee: Mapped["User"] = relationship(foreign_keys=[assignee_id], lazy="joined")  # noqa: F821
    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_id])  # noqa: F821
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

    @property
    def is_complete(self) -> bool:
        return self.completed_at is not None

    def __repr__(self) -> str:
        return f"<Reminder {self.title[:40]} due {self.due_at:%Y-%m-%d}>"
