from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import UserRole


class User(UUIDMixin, TimestampMixin, Base):
    """
    A person who signs in and owns records.

    This is the frontend's `Person`. `password_hash` is nullable so an external identity
    provider (Entra) can be added later for users who never set a local password, without
    a migration.
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    initials: Mapped[str] = mapped_column(String(4), nullable=False)
    job_title: Mapped[str] = mapped_column(String(120), nullable=False, default="")

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=UserRole.REP,
    )

    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    owned_accounts: Mapped[list["Account"]] = relationship(  # noqa: F821
        back_populates="owner", foreign_keys="Account.owner_id"
    )
    owned_deals: Mapped[list["Deal"]] = relationship(  # noqa: F821
        back_populates="owner", foreign_keys="Deal.owner_id"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role.value})>"
