"""Deals carry roles and contacts, not a partner

Revision ID: e1c8a45b7f36
Revises: d7b6014fe3a2
Create Date: 2026-08-12

Three related changes, in one revision because none of them makes sense alone.

**`deals.partner_id` is dropped.** Who else is involved in a deal is now expressed by the people on it:
a partner-side contact attached to the deal is what "there is a partner here" means. The column could
only ever name one, and it named a company rather than a person to call.

**`pipeline_templates.tracks_partner` is dropped.** It existed for exactly one purpose — deciding whether
to show the Partner field — and that field is gone.

**`deal_contacts.role_id` becomes nullable, and `deal_roles` is added.** These two are what make the
intended flow possible. A deal now tracks a set of roles, and separately a set of people, and the
mapping between them fills in as the deal progresses:

  deal_roles      (deal_id, role_id)               the slots this deal tracks
  deal_contacts   (deal_id, contact_id, role_id?)  the people, mapped or not yet

The old table could express neither end of that. A row required both a contact and a role, so "this deal
needs an Executive Sponsor and we have not identified them" had nowhere to live, and neither did "Amit is
involved, we do not yet know as what".

Partner reporting goes with the column: `PartnerSlice`, the by-partner analytics grouping, and the
Partner column in the Excel export are all removed. That is a deliberate loss of the direct-versus-
partner-sourced split, chosen over deriving it from contacts.

The downgrade restores both columns but cannot restore their values — nothing left in the schema records
which deals had a partner, or which pipelines tracked one. It also collapses the role tables back, and
any contact attached without a role, or any unfilled role, is dropped on the way down because the old
shape has no way to hold them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1c8a45b7f36"
down_revision: Union[str, None] = "d7b6014fe3a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- The roles a deal tracks, filled or not ------------------------------
    op.create_table(
        "deal_roles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], name="fk_deal_roles_deal_id_deals", ondelete="CASCADE"),
        # RESTRICT for the same reason `deal_contacts.role_id` uses it: deleting a role definition must
        # not silently strip it from every deal that tracks it.
        sa.ForeignKeyConstraint(["role_id"], ["contact_roles.id"], name="fk_deal_roles_role_id_contact_roles", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_deal_roles"),
        sa.UniqueConstraint("deal_id", "role_id", name="uq_deal_role"),
    )
    op.create_index("ix_deal_roles_deal_id", "deal_roles", ["deal_id"])
    op.create_index("ix_deal_roles_role_id", "deal_roles", ["role_id"])

    # Every role already in use on a deal becomes a tracked slot, so nothing that was mapped before
    # appears unmapped afterwards.
    op.execute(
        """
        INSERT INTO deal_roles (id, deal_id, role_id, created_at, updated_at)
        SELECT gen_random_uuid(), deal_id, role_id, now(), now()
        FROM (SELECT DISTINCT deal_id, role_id FROM deal_contacts) AS existing
        """
    )

    # --- A contact can be on a deal before anyone knows what they are -------
    #
    # The old unique constraint was on (deal, contact, role). With a nullable role that no longer holds:
    # Postgres treats NULLs as distinct, so it would permit the same contact attached unmapped any
    # number of times. Replaced by a partial unique index per branch — one unmapped row per contact, and
    # one row per contact-and-role pairing.
    op.drop_constraint("uq_deal_contact_role", "deal_contacts", type_="unique")
    op.alter_column("deal_contacts", "role_id", nullable=True)

    op.create_index(
        "uq_deal_contact_role",
        "deal_contacts",
        ["deal_id", "contact_id", "role_id"],
        unique=True,
        postgresql_where=sa.text("role_id IS NOT NULL"),
    )
    op.create_index(
        "uq_deal_contact_unmapped",
        "deal_contacts",
        ["deal_id", "contact_id"],
        unique=True,
        postgresql_where=sa.text("role_id IS NULL"),
    )

    # --- The partner columns ------------------------------------------------
    #
    # The check constraint (`ck_deals_partner_not_customer`), the foreign key and the index all
    # reference `partner_id`, so Postgres drops them with the column. Naming them here would add three
    # strings that have to stay in step with the naming convention — and that convention has already
    # produced one double-prefixed name in this table, so it is not to be predicted by hand.
    op.drop_column("deals", "partner_id")
    op.drop_column("pipeline_templates", "tracks_partner")


def downgrade() -> None:
    op.add_column("pipeline_templates", sa.Column("tracks_partner", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("deals", sa.Column("partner_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_deals_partner_id_accounts", "deals", "accounts", ["partner_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_deals_partner_id", "deals", ["partner_id"])
    op.create_check_constraint(
        "partner_not_customer", "deals", "partner_id IS NULL OR partner_id <> account_id"
    )

    # Lossy. The old shape cannot hold an unmapped contact, so those rows go.
    op.execute("DELETE FROM deal_contacts WHERE role_id IS NULL")
    op.drop_index("uq_deal_contact_unmapped", table_name="deal_contacts")
    op.drop_index("uq_deal_contact_role", table_name="deal_contacts")
    op.alter_column("deal_contacts", "role_id", nullable=False)
    op.create_unique_constraint(
        "uq_deal_contact_role", "deal_contacts", ["deal_id", "contact_id", "role_id"]
    )

    # Unfilled roles have nowhere to go either.
    op.drop_table("deal_roles")
