"""the champion gate becomes one position per pipeline, and stages gain an expected duration

Revision ID: 5d3f8a21c74b
Revises: 4b1e7c9d2a56
Create Date: 2026-08-13

The gate was a boolean per stage, which could express things a sales process cannot mean: two gates, or a gap
where the requirement lapses and returns. The rule people actually have is positional — *from* qualification
onward a deal must have a named, reachable champion — so it is stored that way, once, on the pipeline.

Consequences worth stating, because they are behavioural and not just structural:

- A deal may now *enter* the gate stage with no champion. The requirement is on leaving it, which is where it
  belongs: a rep arriving at qualification legitimately has nobody yet, and refusing entry would make the
  honest recording of a deal impossible.
- Every forward move past the gate is checked, not only the one immediately after it. A champion unmapped at
  stage 4 stops the deal at stage 4.
- A move that skips stages is checked against its destination, so jumping 1→4 across a gate at 2 is refused.

`expected_days` arrives alongside it because both are configured in the same act — statements about how the
process is meant to run rather than facts about any one deal. It is an expectation, not a rule: nothing is
refused because of it, which is why it stays editable while the gate does not.

Backfill. Every existing stage carries `requires_champion = false`, because the seed recreated stages after
the migration that set those flags — so no gate has been in force at all. AidenAI Direct is set to position
2, its qualification stage. Partner Co-Sell is left ungated: in a co-sell the partner is the relationship, so
the champion is often on their side and never a record here, and a gate would then refuse moves for a missing
row rather than a missing person. `expected_days` is backfilled by stage name from the same table the seed
uses, so an existing database matches a freshly seeded one instead of showing blanks.

Hand-written: autogenerate cannot read back the trigram and partial-unique indexes on
`accounts.name_normalized` and proposes dropping them, which would take duplicate-account detection with it.
"""

import sqlalchemy as sa
from alembic import op

revision: str = "5d3f8a21c74b"
down_revision: str | None = "4b1e7c9d2a56"
branch_labels: str | None = None
depends_on: str | None = None

#: Expected days by stage name, mirroring `seed_data.py`. Duplicated rather than imported: a migration that
#: reads application code changes meaning when that code changes, and this one must always do what it did the
#: day it ran.
EXPECTED_DAYS = {
    "Prospecting": 21,
    "Discover & Qualify": 30,
    "Solution Alignment & Competitive Strategy": 45,
    "Technical Validation & ROI Diagnostic": 45,
    "Proposal, Negotiation & Close": 30,
    "Identify": 14,
    "Onboarding": 30,
    "Enabled": 45,
    "Co-Sell Pipeline": 30,
    "Joint Proposal": 21,
}


def upgrade() -> None:
    op.add_column(
        "pipeline_templates",
        sa.Column("champion_gate_position", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "champion_gate_position_positive",
        "pipeline_templates",
        "champion_gate_position IS NULL OR champion_gate_position >= 1",
    )
    op.add_column("stages", sa.Column("expected_days", sa.Integer(), nullable=True))

    for name, days in EXPECTED_DAYS.items():
        op.execute(
            sa.text("UPDATE stages SET expected_days = :days WHERE name = :name").bindparams(
                days=days, name=name
            )
        )

    # Named rather than applied to every pipeline, because a gate is not a default — it is a decision about
    # one sales process, and it cannot be revised afterwards.
    #
    # AidenAI Direct gates at 2, its qualification stage: stage 1 is research, where a rep legitimately has
    # nobody yet, and everything after 2 is work that cannot honestly be done without somebody on the inside.
    #
    # Partner Co-Sell is deliberately left ungated. In a co-sell the partner *is* the relationship, so the
    # champion frequently sits on their side of it and is never a record in this CRM. A gate there would
    # refuse moves for a missing row rather than for a missing person.
    #
    # The two conditions the API validates are asserted rather than assumed: the gate must land on an open
    # stage with at least one open stage after it, or the requirement could never fire.
    op.execute(
        """
        UPDATE pipeline_templates t SET champion_gate_position = 2
        WHERE t.name = 'AidenAI Direct'
        AND EXISTS (
            SELECT 1 FROM stages s
            WHERE s.pipeline_template_id = t.id AND s.position = 2 AND s.kind = 'open'
        )
        AND EXISTS (
            SELECT 1 FROM stages s
            WHERE s.pipeline_template_id = t.id AND s.position > 2 AND s.kind = 'open'
        )
        """
    )

    op.drop_column("stages", "requires_champion")


def downgrade() -> None:
    op.add_column(
        "stages",
        sa.Column(
            "requires_champion", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )
    # The positional rule projected back onto per-stage flags: true from the gate onward, open stages only.
    # Not a perfect inverse — the old flag meant "needed to *enter* here" — but it is the closest statement
    # the old shape can make, and it errs toward keeping the requirement rather than dropping it.
    op.execute(
        """
        UPDATE stages s SET requires_champion = true
        FROM pipeline_templates t
        WHERE t.id = s.pipeline_template_id
          AND t.champion_gate_position IS NOT NULL
          AND s.position >= t.champion_gate_position
          AND s.kind = 'open'
        """
    )
    op.drop_column("stages", "expected_days")
    op.drop_constraint("champion_gate_position_positive", "pipeline_templates", type_="check")
    op.drop_column("pipeline_templates", "champion_gate_position")
