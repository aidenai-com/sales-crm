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

    `account_id` is the customer. There is no partner field: who else is involved is expressed by the
    people on the deal, through `contact_links` — a partner-side contact attached to a deal is what
    "there is a partner here" means. A single `partner_id` could name only one, and named a company
    rather than somebody to call.

    `value` is Numeric, not float — money must not accumulate binary rounding error across
    a pipeline sum.
    """

    __tablename__ = "deals"
    __table_args__ = (
        CheckConstraint("value >= 0", name="value_non_negative"),
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
    lead: Mapped["Lead | None"] = relationship(back_populates="deals", lazy="joined")  # noqa: F821
    stage: Mapped["Stage"] = relationship(back_populates="deals", lazy="joined")  # noqa: F821
    pipeline: Mapped["PipelineTemplate"] = relationship(back_populates="deals", lazy="joined")  # noqa: F821
    owner: Mapped["User"] = relationship(  # noqa: F821
        back_populates="owned_deals", foreign_keys=[owner_id], lazy="joined"
    )
    # Not eager: a list of fifty deals does not need everybody's contacts, and the deal page loads
    # them deliberately. The champion gate loads them too, but only for the one deal being moved.
    contact_links: Mapped[list["DealContact"]] = relationship(  # noqa: F821
        back_populates="deal", cascade="all, delete-orphan"
    )
    #: The roles this deal tracks, whether or not anybody fills them yet.
    role_slots: Mapped[list["DealRole"]] = relationship(  # noqa: F821
        back_populates="deal", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Deal {self.name} ({self.value} {self.currency})>"
