"""An account is an account — drop is_partner

Revision ID: d7b6014fe3a2
Revises: c94f7e20a1d5
Create Date: 2026-08-12

Being a partner was a property of the company. It is now only a property of a *deal*: `deals.partner_id`
names whoever brought that particular opportunity, and any account can play that role on one deal while
being the customer on another.

That resolves a contradiction the old model carried. `Account` claimed one row could serve a firm that
was both a channel partner and a customer — but `is_partner` was a single boolean, and setting it
excluded the account from the customer tree and from every customer dropdown. A company that both
resold for us and bought from us could only be recorded as one or the other.

Visible effect: accounts previously flagged as partners now appear in the Accounts tab and in the
customer pickers, because there is no longer anything marking them as not-customers.

The downgrade restores the column but cannot restore its values — nothing in the schema remembers which
accounts were flagged. It fills `false`, which is a valid state and not the previous one. At the time of
writing four accounts were flagged: Accenture, Deloitte, NTT Data and Virtusa.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7b6014fe3a2"
down_revision: Union[str, None] = "c94f7e20a1d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `ix_accounts_is_partner` is dropped by Postgres along with the column.
    op.drop_column("accounts", "is_partner")


def downgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("is_partner", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_accounts_is_partner", "accounts", ["is_partner"])
