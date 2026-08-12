"""Business units no longer have an owner

Revision ID: f0a4e79c2b13
Revises: e5c1a9b73d84
Create Date: 2026-08-11

Only accounts and deals carry an owner. A business unit's stewardship follows its account.

This is an authorization change, not a dropped field. `permissions.scope_leads` filtered strictly on
this column, so removing it moves lead visibility onto the account — and combined with accounts
becoming visible to every rep, business units become visible to every rep too.

Whoever received stale-lead reminders through `lead.owner_id` now receives them through
`account.owner_id`. For most rows those are the same person; where they differ, the reminder changes
hands.

The downgrade is LOSSY. It restores the column and fills it from the account owner, which is a valid
state but not the state that existed before — any business unit that had been assigned to someone
other than its account's owner cannot be recovered, because nothing in the schema remembers it. At
the time of writing three rows were in that position.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f0a4e79c2b13"
down_revision: Union[str, None] = "e5c1a9b73d84"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The index (`ix_leads_owner_id`) and the foreign key (`fk_leads_owner_id_users`) are dropped by
    # Postgres along with the column. Naming them here would only add two strings that have to stay
    # in step with the naming convention.
    op.drop_column("leads", "owner_id")


def downgrade() -> None:
    op.add_column("leads", sa.Column("owner_id", sa.UUID(), nullable=True))
    # From the account owner, because there is nothing else left to reconstruct it from.
    op.execute(
        "UPDATE leads SET owner_id = accounts.owner_id "
        "FROM accounts WHERE accounts.id = leads.account_id"
    )
    op.alter_column("leads", "owner_id", nullable=False)
    op.create_foreign_key(
        "fk_leads_owner_id_users", "leads", "users", ["owner_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_leads_owner_id", "leads", ["owner_id"])
