"""Add the 'document' activity kind

Revision ID: b4d81f2c9e57
Revises: 9a3f5c81d240
Create Date: 2026-08-10

Filing a document against a deliverable is work somebody did on the deal, so it belongs in
the timeline next to the calls and the emails rather than being visible only as a row in the
attachment list. This adds the kind; `app/api/v1/checklists.py` writes them.

Postgres 12 and later allow ALTER TYPE ... ADD VALUE inside a transaction block, provided the
new value is not *used* in that same transaction. Nothing here inserts an activity, so the
single-transaction migration Alembic runs is safe.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b4d81f2c9e57"
down_revision: Union[str, None] = "9a3f5c81d240"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'document'")


def downgrade() -> None:
    """
    Postgres cannot drop a value from an enum, so the type is rebuilt without it.

    The activities that used the value go first. They have to: they are the reason the value
    cannot simply be dropped, and there is nothing to migrate them *to* — a document upload is
    not a call or a note, and relabelling it as one would put a false entry in the timeline
    that no later reader could identify as false.
    """
    op.execute("DELETE FROM activities WHERE kind = 'document'")

    op.execute("ALTER TYPE activity_kind RENAME TO activity_kind_old")
    sa.Enum(
        "call", "meeting", "email", "note", "stage-change", name="activity_kind"
    ).create(op.get_bind())
    op.execute(
        "ALTER TABLE activities ALTER COLUMN kind TYPE activity_kind "
        "USING kind::text::activity_kind"
    )
    op.execute("DROP TYPE activity_kind_old")
