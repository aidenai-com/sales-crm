"""Stages can require a champion before a deal enters them

Revision ID: c94f7e20a1d5
Revises: b8e13d5a06c7
Create Date: 2026-08-11

"A deal should not be moved forward without identifying a Champion" — expressed per stage rather than
as one global rule, so it follows the pipelines-as-data pattern and can be tuned per pipeline without
a migration. Editable in Settings.

Seeded on for every stage except the first of each pipeline. Requiring a champion in order to *leave*
qualification is precisely the stage where a rep legitimately does not have one yet, so gating it
would make the first stage impossible to exit.

Closed stages are also left ungated. Demanding a champion before a deal can be marked lost would trap
dead deals in the pipeline and inflate every open-value figure on the dashboard — the gate would
corrupt the reporting it exists to protect.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c94f7e20a1d5"
down_revision: Union[str, None] = "b8e13d5a06c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stages",
        sa.Column("requires_champion", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute(
        """
        UPDATE stages SET requires_champion = true
        WHERE kind = 'open'
          AND position > (
            SELECT MIN(position) FROM stages AS first
            WHERE first.pipeline_template_id = stages.pipeline_template_id
          )
        """
    )


def downgrade() -> None:
    op.drop_column("stages", "requires_champion")
