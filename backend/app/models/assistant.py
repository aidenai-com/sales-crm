import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class AssistantUsage(UUIDMixin, TimestampMixin, Base):
    """
    One row per model call, for the administrator's usage dashboard.

    Recorded per *call* rather than per question, because a single question that triggers three
    tool round-trips is three billed requests. Aggregating them into one row would make the
    dashboard understate what the provider charges for, which is the one thing it exists to get
    right.

    Cost is stored as a computed amount rather than derived on read. The rate is configuration
    and configuration changes: a row priced at last month's rate must keep last month's cost, or
    every historical total silently rewrites itself the day someone updates the setting.

    `cost_usd` is nullable for exactly one reason — the rate may not be configured yet. Null
    means "tokens known, price unknown", which the dashboard reports honestly instead of
    printing zero.
    """

    __tablename__ = "assistant_usage"
    __table_args__ = (
        CheckConstraint("prompt_tokens >= 0", name="prompt_tokens_non_negative"),
        CheckConstraint("completion_tokens >= 0", name="completion_tokens_non_negative"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    #: Groups the calls belonging to one question, so the dashboard can show cost per
    #: conversation as well as per call.
    conversation_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False, index=True)

    model: Mapped[str] = mapped_column(String(120), nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    #: Null when no rate is configured. See the class docstring.
    cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6), nullable=True)

    #: How many tools the model asked for on this call. Zero for a plain answer.
    tool_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    #: Truncated. Enough to recognise a question in the dashboard, not a transcript store — the
    #: answers can quote deal values and owner names, and this table is visible to every admin.
    question_preview: Mapped[str] = mapped_column(Text, nullable=False, default="")

    #: Set when the call failed, so the dashboard distinguishes spend from breakage.
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(lazy="joined")  # noqa: F821

    def __repr__(self) -> str:
        return f"<AssistantUsage {self.model} {self.prompt_tokens}+{self.completion_tokens}>"
