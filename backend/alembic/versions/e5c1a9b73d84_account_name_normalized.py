"""Normalized account names, with a unique index and trigram search

Revision ID: e5c1a9b73d84
Revises: d19c3b7a4e02
Create Date: 2026-08-11

`Citi`, `CITI`, `Citi Bank Inc.` and `Citibank, N.A.` are one company. The existing unique
constraint on `accounts.name` catches only an exact repeat, which is the one duplicate nobody
creates.

Two indexes, doing two different jobs:

  uq_accounts_name_normalized   refuses an unambiguous duplicate outright
  ix_accounts_name_normalized_trgm  powers the as-you-type "did you mean" search

The unique index is partial — `WHERE name_normalized <> ''`. A name made entirely of legal-form
tokens ("Ltd", "The Group") normalizes to nothing, and without the predicate every such name would
collide with every other one.

`pg_trgm` needs privileges to install. On a managed Postgres where the migration user cannot create
extensions, install it once by hand as a superuser and this step becomes a no-op.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.account_names import normalize

revision: str = "e5c1a9b73d84"
down_revision: Union[str, None] = "d19c3b7a4e02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Nullable to begin with: the column has to exist before it can be filled.
    op.add_column("accounts", sa.Column("name_normalized", sa.String(length=255), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, name FROM accounts")).fetchall()

    # Backfilled in Python, through the same `normalize` the API calls. Reimplementing the rule in
    # SQL would give this index a different definition of "the same company" than the endpoint that
    # has to predict it, and the two would drift apart at the first change.
    keys: dict[str, str] = {}
    collisions: dict[str, list[str]] = {}
    for row in rows:
        key = normalize(row.name)
        if key:
            if key in keys:
                collisions.setdefault(key, [keys[key]]).append(row.name)
            else:
                keys[key] = row.name
        bind.execute(
            sa.text("UPDATE accounts SET name_normalized = :key WHERE id = :id"),
            {"key": key, "id": row.id},
        )

    if collisions:
        # Failing loudly, before the index exists. Postgres would refuse the unique index anyway,
        # but with a message naming an index rather than the accounts a human has to merge.
        detail = "; ".join(f"{key!r}: {names}" for key, names in collisions.items())
        raise RuntimeError(
            "Existing accounts normalize to the same name and must be merged before this "
            f"migration can run — {detail}"
        )

    op.alter_column("accounts", "name_normalized", nullable=False)

    op.create_index(
        "uq_accounts_name_normalized",
        "accounts",
        ["name_normalized"],
        unique=True,
        postgresql_where=sa.text("name_normalized <> ''"),
    )
    op.create_index(
        "ix_accounts_name_normalized_trgm",
        "accounts",
        ["name_normalized"],
        postgresql_using="gin",
        postgresql_ops={"name_normalized": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_accounts_name_normalized_trgm", table_name="accounts")
    op.drop_index("uq_accounts_name_normalized", table_name="accounts")
    op.drop_column("accounts", "name_normalized")
    # `pg_trgm` is left installed. Dropping it would break any other index built on it, and an
    # unused extension costs nothing.
