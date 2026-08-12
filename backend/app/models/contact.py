import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import ContactType


class Contact(UUIDMixin, TimestampMixin, Base):
    """
    A person at a customer or a partner — its own object, not a field on an account or a deal.

    Has no owner. Only accounts and deals do; a contact's stewardship follows its account.

    A partner contact's `account_id` *is* the partner account, so the customer/partner relationship is
    already carried by the foreign key. `contact_type` exists because the two are asked for separately
    and because a filter needs something cheap to test — not because it holds information the join
    does not.

    The same human at two accounts is two rows. That is correct rather than duplication: their
    designation, and their relevance to us, differ per company.
    """

    __tablename__ = "contacts"
    __table_args__ = (
        # One person filed once per account, by email. A partial unique *index* rather than a unique
        # constraint, because it has to exclude blank emails — a contact without an email is not a
        # duplicate of every other contact without one, and a plain constraint cannot say that.
        Index(
            "uq_contacts_account_email",
            "account_id",
            "email",
            unique=True,
            postgresql_where=text("email <> ''"),
        ),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    #: "" rather than NULL, here and below. There is no difference between "no email" and "email
    #: unknown", and one empty representation keeps `has_full_contact_details` a single comparison
    #: per field instead of a null-and-blank pair.
    email: Mapped[str] = mapped_column(String(320), nullable=False, default="", server_default="")
    phone: Mapped[str] = mapped_column(String(60), nullable=False, default="", server_default="")
    linkedin_url: Mapped[str] = mapped_column(String(500), nullable=False, default="", server_default="")
    designation: Mapped[str] = mapped_column(String(160), nullable=False, default="", server_default="")

    contact_type: Mapped[ContactType] = mapped_column(
        Enum(ContactType, name="contact_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )

    account: Mapped["Account"] = relationship(back_populates="contacts", lazy="joined")  # noqa: F821
    deal_links: Mapped[list["DealContact"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )

    @property
    def has_full_contact_details(self) -> bool:
        """
        Whether this contact could serve as a champion.

        All three of email, phone and LinkedIn, because all three were named as the requirement — a
        champion missing a LinkedIn URL does not satisfy it. Lives on the model so the stage gate and
        the UI's "incomplete" marker cannot disagree about what complete means.
        """
        return bool(self.email and self.phone and self.linkedin_url)

    def missing_details(self) -> list[str]:
        """Which of the three required fields are blank, for a message that says what to go and fill in."""
        return [
            label
            for label, value in (("email", self.email), ("phone", self.phone), ("LinkedIn", self.linkedin_url))
            if not value
        ]

    def __repr__(self) -> str:
        return f"<Contact {self.full_name} ({self.contact_type.value})>"


class ContactRole(UUIDMixin, TimestampMixin, Base):
    """
    What a person can be *on a deal*.

    A row rather than an enum, for the reason `PipelineTemplate` gives for stages: which roles a deal
    has is the user's decision, and adding one must not need a migration.

    `key` is the stable handle. Champion is seeded with `is_system` set, because the stage gate has to
    test for it and an admin renaming "Champion" to "Advocate" must not disable the gate silently.
    """

    __tablename__ = "contact_roles"
    __table_args__ = (
        CheckConstraint("position >= 1", name="position_positive"),
        UniqueConstraint("key", name="uq_contact_roles_key"),
        UniqueConstraint("name", name="uq_contact_roles_name"),
    )

    #: The one key the application reasons about by name.
    CHAMPION = "champion"

    key: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Cannot be deleted, and its `key` cannot be changed. See the class docstring.
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    def __repr__(self) -> str:
        return f"<ContactRole {self.name}>"


class DealRole(UUIDMixin, TimestampMixin, Base):
    """
    A role this deal tracks, whether or not anybody fills it yet.

    Separate from `DealContact` so the two halves of the flow can happen at different times. Roles are
    chosen when the deal is created — this deal will need a champion, an exec sponsor and a technical
    buyer — and the people who fill them are identified as the deal progresses. A row here with no
    matching `DealContact` is an open question the deal page can show as one.

    Without this table, "we need an Executive Sponsor and have not found them" has nowhere to live: a
    `DealContact` needs a contact, so the role could only exist once somebody filled it, which is
    exactly backwards from how the work actually happens.
    """

    __tablename__ = "deal_roles"
    __table_args__ = (UniqueConstraint("deal_id", "role_id", name="uq_deal_role"),)

    deal_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # RESTRICT, matching `DealContact.role_id`: deleting a role definition must not silently strip it
    # from every deal tracking it.
    role_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contact_roles.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    deal: Mapped["Deal"] = relationship(back_populates="role_slots")  # noqa: F821
    role: Mapped[ContactRole] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<DealRole {self.role_id} on {self.deal_id}>"


class DealContact(UUIDMixin, TimestampMixin, Base):
    """
    One contact on one deal, in a role or not yet in one.

    Roles are attached here rather than on the contact: the same person is a champion on one deal and
    merely an end customer on another, and storing the role on the contact would force a choice between
    the two.

    `role_id` is nullable, which is the point. A rep pulls people in from the directory as they meet
    them and works out what each of them is later — so "Amit is involved, we do not yet know as what" is
    a real and common state. Requiring a role at attach time would make somebody guess one, and a
    guessed champion is worse than an unmapped contact.

    Multiple contacts in the same role fall out of this for free, which is what the requirement for
    several partner contacts needs.
    """

    __tablename__ = "deal_contacts"
    __table_args__ = (
        # Two partial unique indexes rather than one constraint on the triple, because `role_id` is
        # nullable and Postgres treats NULLs as distinct — a plain constraint would happily allow the
        # same contact attached unmapped a dozen times.
        #
        # Mapped: one row per contact-and-role pairing. One person can be both champion and executive
        # sponsor, which is common enough that forbidding it would be wrong.
        Index(
            "uq_deal_contact_role",
            "deal_id",
            "contact_id",
            "role_id",
            unique=True,
            postgresql_where=text("role_id IS NOT NULL"),
        ),
        # Unmapped: one row per contact. Attaching the same person twice with no role is not a state
        # anybody means.
        Index(
            "uq_deal_contact_unmapped",
            "deal_id",
            "contact_id",
            unique=True,
            postgresql_where=text("role_id IS NULL"),
        ),
    )

    deal_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: Null until somebody works out what this person is on this deal.
    #:
    #: RESTRICT: deleting a role must not silently strip every deal that used it. The API refuses to
    #: delete a role still in use, and this is the database half of that promise.
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contact_roles.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    deal: Mapped["Deal"] = relationship(back_populates="contact_links")  # noqa: F821
    contact: Mapped[Contact] = relationship(back_populates="deal_links", lazy="joined")
    role: Mapped[ContactRole | None] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<DealContact {self.contact_id} as {self.role_id or 'unmapped'}>"
