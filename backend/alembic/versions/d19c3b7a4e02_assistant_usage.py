"""Assistant usage, for the administrator's cost dashboard

Revision ID: d19c3b7a4e02
Revises: c72a5e14b8f9
Create Date: 2026-08-11

One row per model call, not per question: a question that triggers three tool round-trips is
three billed requests, and collapsing them would understate what the provider charges for.

`cost_usd` is nullable because the per-token rate is configuration and may be unset. Null means
"tokens known, price unknown", which the dashboard reports rather than printing a false zero.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d19c3b7a4e02"
down_revision: Union[str, None] = "c72a5e14b8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_usage",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("tool_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("question_preview", sa.Text(), nullable=False, server_default=""),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("prompt_tokens >= 0", name="ck_assistant_usage_prompt_tokens_non_negative"),
        sa.CheckConstraint(
            "completion_tokens >= 0", name="ck_assistant_usage_completion_tokens_non_negative"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_assistant_usage_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_assistant_usage"),
    )
    op.create_index("ix_assistant_usage_user_id", "assistant_usage", ["user_id"], unique=False)
    op.create_index(
        "ix_assistant_usage_conversation_id", "assistant_usage", ["conversation_id"], unique=False
    )
    # The dashboard's every query is "spend over a window", so the ordering column is indexed.
    op.create_index("ix_assistant_usage_created_at", "assistant_usage", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_assistant_usage_created_at", table_name="assistant_usage")
    op.drop_index("ix_assistant_usage_conversation_id", table_name="assistant_usage")
    op.drop_index("ix_assistant_usage_user_id", table_name="assistant_usage")
    op.drop_table("assistant_usage")
