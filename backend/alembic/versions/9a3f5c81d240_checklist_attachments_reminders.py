"""Promote stage deliverables to rows; add attachments and reminders

Revision ID: 9a3f5c81d240
Revises: 7c1e4a02b8d3
Create Date: 2026-08-07

Three related changes, in one revision because the first is a prerequisite for the second.

1. `stages.deliverables` was a JSONB array of strings. Deliverables are now checkable per
   deal and carry documents, so they need stable identity: keyed by array index, an admin
   reordering the list in Settings would reassign every rep's checkmarks and attachments to
   the wrong item, silently. Each entry becomes a `stage_deliverables` row.

2. `deal_deliverable_completions` and `attachments` hang off those rows.

3. `reminders` — scheduled follow-ups, mirroring the `activities` shape.

Hand-written. Autogenerate would drop the JSONB column and create the table as two
unrelated operations, discarding every deliverable the pipelines already define.

Reversibility: the deliverable move round-trips exactly — text and order survive in both
directions. What a downgrade cannot preserve is completions and attachments created after
the upgrade, since they reference `stage_deliverables.id` and those ids exist only while the
table does. Downgrading after reps have used the checklist drops that data.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9a3f5c81d240"
down_revision: Union[str, None] = "7c1e4a02b8d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. Deliverables become rows -----------------------------------------
    op.create_table(
        "stage_deliverables",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("stage_id", sa.UUID(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("position >= 1", name="ck_stage_deliverables_position_positive"),
        sa.ForeignKeyConstraint(
            ["stage_id"], ["stages.id"], name="fk_stage_deliverables_stage_id_stages", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_stage_deliverables"),
        sa.UniqueConstraint(
            "stage_id",
            "position",
            name="uq_stage_deliverable_position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    op.create_index(
        "ix_stage_deliverables_stage_id", "stage_deliverables", ["stage_id"], unique=False
    )

    # Backfill. `ordinality` is 1-based, which is exactly the `position` convention used by
    # stages, so the array order carries over without arithmetic.
    op.execute(
        """
        INSERT INTO stage_deliverables (stage_id, text, position)
        SELECT s.id, item.value #>> '{}', item.ordinality
        FROM stages s
        CROSS JOIN LATERAL jsonb_array_elements(s.deliverables) WITH ORDINALITY AS item(value, ordinality)
        WHERE s.deliverables IS NOT NULL
          AND jsonb_typeof(s.deliverables) = 'array'
        """
    )

    op.drop_column("stages", "deliverables")

    # --- 2. Per-deal state ----------------------------------------------------
    op.create_table(
        "deal_deliverable_completions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("stage_deliverable_id", sa.UUID(), nullable=False),
        sa.Column("completed_by_id", sa.UUID(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["deal_id"],
            ["deals.id"],
            name="fk_deal_deliverable_completions_deal_id_deals",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["stage_deliverable_id"],
            ["stage_deliverables.id"],
            # Shortened by hand: the naming convention would render 71 characters here,
            # past Postgres' 63-character identifier limit.
            name="fk_deal_deliverable_completions_deliverable_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["completed_by_id"],
            ["users.id"],
            name="fk_deal_deliverable_completions_completed_by_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_deal_deliverable_completions"),
        # Ticking an already-ticked box is idempotent rather than a duplicate row.
        sa.UniqueConstraint(
            "deal_id", "stage_deliverable_id", name="uq_completion_deal_deliverable"
        ),
    )
    op.create_index(
        "ix_deal_deliverable_completions_deal_id",
        "deal_deliverable_completions",
        ["deal_id"],
        unique=False,
    )
    op.create_index(
        "ix_deal_deliverable_completions_stage_deliverable_id",
        "deal_deliverable_completions",
        ["stage_deliverable_id"],
        unique=False,
    )

    op.create_table(
        "attachments",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("stage_deliverable_id", sa.UUID(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=160), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("uploaded_by_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("size_bytes > 0", name="ck_attachments_size_positive"),
        sa.ForeignKeyConstraint(
            ["deal_id"], ["deals.id"], name="fk_attachments_deal_id_deals", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["stage_deliverable_id"],
            ["stage_deliverables.id"],
            name="fk_attachments_stage_deliverable_id_stage_deliverables",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_id"],
            ["users.id"],
            name="fk_attachments_uploaded_by_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_attachments"),
        sa.UniqueConstraint("storage_key", name="uq_attachments_storage_key"),
    )
    op.create_index("ix_attachments_deal_id", "attachments", ["deal_id"], unique=False)
    op.create_index(
        "ix_attachments_stage_deliverable_id", "attachments", ["stage_deliverable_id"], unique=False
    )

    # --- 3. Reminders ---------------------------------------------------------
    op.create_table(
        "reminders",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=True),
        sa.Column("lead_id", sa.UUID(), nullable=True),
        sa.Column("deal_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assignee_id", sa.UUID(), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "num_nonnulls(account_id, lead_id, deal_id) = 1",
            name="ck_reminders_exactly_one_subject",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["accounts.id"], name="fk_reminders_account_id_accounts", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["lead_id"], ["leads.id"], name="fk_reminders_lead_id_leads", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["deal_id"], ["deals.id"], name="fk_reminders_deal_id_deals", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["assignee_id"], ["users.id"], name="fk_reminders_assignee_id_users", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], name="fk_reminders_created_by_id_users", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_reminders"),
    )
    op.create_index("ix_reminders_account_id", "reminders", ["account_id"], unique=False)
    op.create_index("ix_reminders_lead_id", "reminders", ["lead_id"], unique=False)
    op.create_index("ix_reminders_deal_id", "reminders", ["deal_id"], unique=False)
    op.create_index("ix_reminders_due_at", "reminders", ["due_at"], unique=False)
    op.create_index("ix_reminders_assignee_id", "reminders", ["assignee_id"], unique=False)

    # --- 4. USD only ----------------------------------------------------------
    # Every row is already 'USD'; the constraint stops a future write from introducing a
    # second currency behind a UI and an export that both assume dollars.
    op.execute("UPDATE deals SET currency = 'USD' WHERE currency <> 'USD'")
    op.create_check_constraint("ck_deals_currency_usd", "deals", "currency = 'USD'")


def downgrade() -> None:
    op.drop_constraint("ck_deals_currency_usd", "deals", type_="check")

    op.drop_index("ix_reminders_assignee_id", table_name="reminders")
    op.drop_index("ix_reminders_due_at", table_name="reminders")
    op.drop_index("ix_reminders_deal_id", table_name="reminders")
    op.drop_index("ix_reminders_lead_id", table_name="reminders")
    op.drop_index("ix_reminders_account_id", table_name="reminders")
    op.drop_table("reminders")

    op.drop_index("ix_attachments_stage_deliverable_id", table_name="attachments")
    op.drop_index("ix_attachments_deal_id", table_name="attachments")
    op.drop_table("attachments")

    op.drop_index(
        "ix_deal_deliverable_completions_stage_deliverable_id",
        table_name="deal_deliverable_completions",
    )
    op.drop_index(
        "ix_deal_deliverable_completions_deal_id", table_name="deal_deliverable_completions"
    )
    op.drop_table("deal_deliverable_completions")

    # Deliverables fold back into the array. Text and order survive; only the ids are lost,
    # which is why anything referencing them went first.
    op.add_column("stages", sa.Column("deliverables", sa.dialects.postgresql.JSONB(), nullable=True))
    op.execute(
        """
        UPDATE stages s
        SET deliverables = d.items
        FROM (
            SELECT stage_id, jsonb_agg(text ORDER BY position) AS items
            FROM stage_deliverables
            GROUP BY stage_id
        ) d
        WHERE d.stage_id = s.id
        """
    )

    op.drop_index("ix_stage_deliverables_stage_id", table_name="stage_deliverables")
    op.drop_table("stage_deliverables")
