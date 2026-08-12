import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Account(UUIDMixin, TimestampMixin, Base):
    """
    Top-level record: a company. Not a customer, not a partner — an account.

    There is no `is_partner`. Being a partner is not a property of a company at all — it shows in the
    people on a deal, through a partner-side `Contact` attached to it, so the same account can be the
    partner on one deal and the customer on another.

    The flag used to exist and created the problem it was meant to solve. It claimed one row could serve
    a firm that was both a channel partner and a customer, but a single boolean cannot be both — setting
    it removed the account from the customer tree and from every customer picker, so a company that
    resold for us *and* bought from us could only be recorded as one of the two. Dropped in migration
    d7b6014fe3a2.
    """

    __tablename__ = "accounts"

    name: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    #: The comparison key that makes `Citi`, `CITI` and `Citibank, N.A.` one company. Derived from
    #: `name` by `app.services.account_names.normalize` on every write — never set by a client, and
    #: never edited by hand. Carries a partial unique index, so a normalized collision is refused by
    #: the database rather than only by the endpoint that checked for it.
    name_normalized: Mapped[str] = mapped_column(String(255), nullable=False, default="", index=True)
    industry: Mapped[str] = mapped_column(String(120), nullable=False, default="")
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
    contacts: Mapped[list["Contact"]] = relationship(  # noqa: F821
        back_populates="account", cascade="all, delete-orphan", order_by="Contact.full_name"
    )

    def __repr__(self) -> str:
        return f"<Account {self.name}>"


class Lead(UUIDMixin, TimestampMixin, Base):
    """
    Sits under an account, distinguished by business unit or function. One account has many leads.

    Has no owner. Only accounts and deals do — a business unit's stewardship follows its account, and
    `owner_id` was dropped in migration f0a4e79c2b13.

    That removal is why `permissions.scope_leads` now reaches through `account_id`: there is nothing
    on this row left to scope by.
    """

    __tablename__ = "leads"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    business_unit: Mapped[str] = mapped_column(String(255), nullable=False)

    account: Mapped[Account] = relationship(back_populates="leads", lazy="joined")
    # A lead's deals detach rather than vanish: deleting a business unit should not
    # silently destroy its opportunities.
    deals: Mapped[list["Deal"]] = relationship(back_populates="lead")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Lead {self.business_unit}>"
