"""Add the contact-change activity kind

Revision ID: b5d72e0af183
Revises: a2f61d8c94e7
Create Date: 2026-08-12

Changing who is on a deal, or which roles it tracks, is a change to the deal worth reading later: "we
named a champion in week two and nobody spoke to them for a month" is a story the timeline should be able
to tell. Until now those writes left no trace at all.

A new enum value rather than reuse of NOTE. A note is something a person wrote; this is something the
server recorded, and the timeline colours the two differently on purpose — grouping machine-written
entries with hand-written ones would make the timeline's own categories a lie.

`ALTER TYPE ... ADD VALUE` cannot be rolled back, so `downgrade` deliberately does nothing rather than
pretending. Removing an enum value in Postgres means rebuilding the type and every column using it, which
is not a price worth paying to undo an addition that breaks nothing.
"""

from alembic import op

revision = "b5d72e0af183"
down_revision = "a2f61d8c94e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS so re-running on a database that already has it is a no-op rather than a failure.
    op.execute("ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'contact-change'")


def downgrade() -> None:
    """
    Intentionally empty. An unused enum value is harmless; dropping one is a table rewrite.
    """
