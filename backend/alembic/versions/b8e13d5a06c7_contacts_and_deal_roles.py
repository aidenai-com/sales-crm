"""Contacts as their own object, with roles held at the deal

Revision ID: b8e13d5a06c7
Revises: f0a4e79c2b13
Create Date: 2026-08-11

Three tables:

  contacts        a person at a customer or a partner
  contact_roles   what a person can be *on a deal* — rows, not an enum
  deal_contacts   which contact holds which role on which deal

Roles are rows because which roles a deal has is the user's decision, and a new one must not need a
migration. That is the same reasoning `pipeline_templates` records for stages.

The four seeded roles are the ones named in the requirements. Champion is marked `is_system` and
keyed `champion`: the stage gate needs something to test that an admin cannot rename or delete out
from under it. The other three are ordinary rows and can be edited or removed.

A contact has no owner. Only accounts and deals do.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b8e13d5a06c7"
down_revision: Union[str, None] = "f0a4e79c2b13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: Created once, explicitly, below.
#:
#: `create_type=False` matters: with it left at the default, `create_table` emits its own CREATE TYPE
#: for the enum column on top of the explicit `.create()` call, and the migration fails on its own
#: second attempt with "type contact_type already exists".
CONTACT_TYPE = postgresql.ENUM("customer", "partner", name="contact_type", create_type=False)


def upgrade() -> None:
    sa.Enum("customer", "partner", name="contact_type").create(op.get_bind(), checkfirst=True)

    op.create_table(
        "contacts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False, server_default=""),
        sa.Column("phone", sa.String(length=60), nullable=False, server_default=""),
        sa.Column("linkedin_url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("designation", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("contact_type", CONTACT_TYPE, nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], name="fk_contacts_account_id_accounts", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_contacts"),
        # The three fields the champion gate demands are stored as "" rather than NULL. There is no
        # difference here between "no email" and "email unknown", and one empty representation means
        # the completeness check is a single comparison instead of a null-and-blank pair.
    )
    op.create_index("ix_contacts_account_id", "contacts", ["account_id"])
    op.create_index("ix_contacts_full_name", "contacts", ["full_name"])
    # One person is filed once per account. The same human at two accounts is two contacts, which is
    # correct — their designation and their relevance differ per company.
    op.create_index(
        "uq_contacts_account_email",
        "contacts",
        ["account_id", "email"],
        unique=True,
        postgresql_where=sa.text("email <> ''"),
    )

    op.create_table(
        "contact_roles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("key", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.CheckConstraint("position >= 1", name="position_positive"),
        sa.PrimaryKeyConstraint("id", name="pk_contact_roles"),
        sa.UniqueConstraint("key", name="uq_contact_roles_key"),
        sa.UniqueConstraint("name", name="uq_contact_roles_name"),
    )

    op.create_table(
        "deal_contacts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("contact_id", sa.UUID(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], name="fk_deal_contacts_deal_id_deals", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], name="fk_deal_contacts_contact_id_contacts", ondelete="CASCADE"),
        # RESTRICT, not CASCADE: deleting a role must not silently strip every deal that used it.
        # The API refuses to delete a role still in use, and this is the database half of that.
        sa.ForeignKeyConstraint(["role_id"], ["contact_roles.id"], name="fk_deal_contacts_role_id_contact_roles", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_deal_contacts"),
        # Unique on the triple, not on (deal, contact): one person can legitimately be both the
        # champion and the executive sponsor, and forbidding that would be wrong.
        sa.UniqueConstraint("deal_id", "contact_id", "role_id", name="uq_deal_contact_role"),
    )
    op.create_index("ix_deal_contacts_deal_id", "deal_contacts", ["deal_id"])
    op.create_index("ix_deal_contacts_contact_id", "deal_contacts", ["contact_id"])
    op.create_index("ix_deal_contacts_role_id", "deal_contacts", ["role_id"])

    op.execute(
        """
        INSERT INTO contact_roles (id, key, name, position, is_system, created_at, updated_at)
        VALUES
          (gen_random_uuid(), 'champion',          'Champion',          1, true,  now(), now()),
          (gen_random_uuid(), 'executive-sponsor', 'Executive Sponsor', 2, false, now(), now()),
          (gen_random_uuid(), 'end-customer',      'End Customer',      3, false, now(), now()),
          (gen_random_uuid(), 'partner-contact',   'Partner Contact',   4, false, now(), now())
        """
    )


def downgrade() -> None:
    op.drop_table("deal_contacts")
    op.drop_table("contact_roles")
    op.drop_table("contacts")
    sa.Enum(name="contact_type").drop(op.get_bind(), checkfirst=True)
