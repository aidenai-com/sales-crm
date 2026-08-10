import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Deal(UUIDMixin, TimestampMixin, Base):
    """
    An opportunity tracked through pipeline stages, rolling up to an account.

    R8: partner-led deals carry both fields on the same record. `account_id` is always the
    customer; `partner_id` names the partner bringing the deal, and is null on direct deals.

    `value` is Numeric, not float — money must not accumulate binary rounding error across
    a pipeline sum.
    """

    __tablename__ = "deals"
    __table_args__ = (
        CheckConstraint("value >= 0", name="value_non_negative"),
        # A partner cannot introduce a deal to itself.
        CheckConstraint("partner_id IS NULL OR partner_id <> account_id", name="partner_not_customer"),
        # All values are USD. The column stays so the wire format is unchanged and a future
        # multi-currency decision has somewhere to land, but nothing may write anything else:
        # the UI, the roll-ups and the Excel export all sum values without converting, so a
        # single euro row would silently corrupt every total on the dashboard.
        CheckConstraint("currency = 'USD'", name="currency_usd"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Optional: a deal can roll up to an account without sitting under a business unit.
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    partner_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )

    pipeline_template_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("pipeline_templates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # RESTRICT is the database half of spec 6.3: a stage holding deals cannot be deleted.
    stage_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("stages.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    #: Always "USD" — see the check constraint above. Not settable through the API.
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD", server_default="USD")
    expected_close_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    account: Mapped["Account"] = relationship(  # noqa: F821
        back_populates="deals", foreign_keys=[account_id], lazy="joined"
    )
    partner: Mapped["Account | None"] = relationship(  # noqa: F821
        foreign_keys=[partner_id], lazy="joined"
    )
    lead: Mapped["Lead | None"] = relationship(back_populates="deals", lazy="joined")  # noqa: F821
    stage: Mapped["Stage"] = relationship(back_populates="deals", lazy="joined")  # noqa: F821
    pipeline: Mapped["PipelineTemplate"] = relationship(back_populates="deals", lazy="joined")  # noqa: F821
    owner: Mapped["User"] = relationship(  # noqa: F821
        back_populates="owned_deals", foreign_keys=[owner_id], lazy="joined"
    )

    def __repr__(self) -> str:
        return f"<Deal {self.name} ({self.value} {self.currency})>"
