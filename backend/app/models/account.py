import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Account(UUIDMixin, TimestampMixin, Base):
    """
    Top-level record; the name is the direct customer's name (R1).

    One table holds customers and partners, distinguished by `is_partner`. A company that
    is both — Accenture as a channel partner and a customer in its own right — is a single
    row, so there is nothing to keep in sync. This resolves the open question in spec 3.
    """

    __tablename__ = "accounts"

    name: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    industry: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    is_partner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    owner: Mapped["User"] = relationship(back_populates="owned_accounts", foreign_keys=[owner_id])  # noqa: F821
    leads: Mapped[list["Lead"]] = relationship(  # noqa: F821
        back_populates="account", cascade="all, delete-orphan", order_by="Lead.business_unit"
    )
    # Deals where this account is the customer.
    deals: Mapped[list["Deal"]] = relationship(  # noqa: F821
        back_populates="account", cascade="all, delete-orphan", foreign_keys="Deal.account_id"
    )

    def __repr__(self) -> str:
        return f"<Account {self.name}{' (partner)' if self.is_partner else ''}>"


class Lead(UUIDMixin, TimestampMixin, Base):
    """
    Sits under an account, distinguished by business unit or function, with its own
    owner (R2). One account has many leads.
    """

    __tablename__ = "leads"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    business_unit: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    account: Mapped[Account] = relationship(back_populates="leads")
    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])  # noqa: F821
    # A lead's deals detach rather than vanish: deleting a business unit should not
    # silently destroy its opportunities.
    deals: Mapped[list["Deal"]] = relationship(back_populates="lead")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Lead {self.business_unit}>"
