"""Add the 'nudge' activity kind

Revision ID: c72a5e14b8f9
Revises: b4d81f2c9e57
Create Date: 2026-08-11

An administrator chasing a deal's owner is recorded on the deal's timeline, so the next person
to look can see the deal was escalated rather than merely ignored.

Unlike every other kind, this one does not count as working the deal — see
`health.NON_TOUCH_KINDS`. Counting it would clear the staleness flag that prompted the nudge,
so the chase would erase its own cause.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c72a5e14b8f9"
down_revision: Union[str, None] = "b4d81f2c9e57"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'nudge'")


def downgrade() -> None:
    """Postgres cannot drop an enum value, so the type is rebuilt without it."""
    op.execute("DELETE FROM activities WHERE kind = 'nudge'")

    op.execute("ALTER TYPE activity_kind RENAME TO activity_kind_old")
    sa.Enum(
        "call", "meeting", "email", "note", "stage-change", "document", name="activity_kind"
    ).create(op.get_bind())
    op.execute(
        "ALTER TABLE activities ALTER COLUMN kind TYPE activity_kind "
        "USING kind::text::activity_kind"
    )
    op.execute("DROP TYPE activity_kind_old")
