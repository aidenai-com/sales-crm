"""Drop the End Customer role: it restates the contact's type

Revision ID: a2f61d8c94e7
Revises: f4a9d3e02b18
Create Date: 2026-08-12

"End Customer" was seeded as a role alongside Champion, Executive Sponsor and Partner Contact, and it
does not belong with them. The other three answer "what does this person do on this deal" — a question
whose answer differs per deal, which is exactly why roles are a per-deal mapping. "End customer" answers
"which side of the table does this person sit on", which is a property of the person and is already
recorded on the contact itself as `contacts.contact_type`.

Keeping both meant the same fact could be stated twice and disagree: a contact typed `partner` could be
mapped into the End Customer role on a deal, and nothing would object. It also cost a slot in the role
list, where every entry is meant to be a question worth tracking unfilled — and "we have not identified
an end customer" is not a real state of a deal.

Mapped people are **unmapped, not removed**: their role_id becomes NULL, so they stay on the deal as
somebody involved whose role is not yet decided. That is a state the model already supports and the deal
page already renders. Nothing about who is on the deal is lost, and their side is still on their contact
record.
"""

from alembic import op
import sqlalchemy as sa

revision = "a2f61d8c94e7"
down_revision = "f4a9d3e02b18"
branch_labels = None
depends_on = None

ROLE_KEY = "end-customer"


def upgrade() -> None:
    connection = op.get_bind()

    role_id = connection.execute(
        sa.text("SELECT id FROM contact_roles WHERE key = :key"), {"key": ROLE_KEY}
    ).scalar()

    # Idempotent by design: an installation seeded after this migration never had the role, and a
    # migration that fails on a database that is already in the intended state is a migration that
    # cannot be run twice.
    if role_id is None:
        return

    # The people first. `deal_contacts.role_id` is nullable and NULL means "involved, role undecided",
    # so this preserves every attachment while dropping only the claim about what they are.
    connection.execute(
        sa.text("UPDATE deal_contacts SET role_id = NULL WHERE role_id = :role_id"),
        {"role_id": role_id},
    )

    # Then the tracked slots. These are deleted rather than nulled: `deal_roles.role_id` is NOT NULL,
    # and a tracked role with no role is not a state that means anything.
    connection.execute(
        sa.text("DELETE FROM deal_roles WHERE role_id = :role_id"), {"role_id": role_id}
    )

    # Both foreign keys are ON DELETE RESTRICT, so this would refuse if either clean-up above had
    # missed a row — which is the guarantee that this migration cannot half-apply.
    connection.execute(
        sa.text("DELETE FROM contact_roles WHERE id = :role_id"), {"role_id": role_id}
    )


def downgrade() -> None:
    """
    Restores the role, but not the mappings — the rows that pointed at it were deliberately unmapped
    and there is no record of which they were. Anybody who needs them back has to re-map by hand; the
    people are all still on their deals, which is the part that mattered.
    """
    op.execute(
        """
        INSERT INTO contact_roles (id, key, name, position, is_system, created_at, updated_at)
        VALUES (gen_random_uuid(), 'end-customer', 'End Customer', 3, false, now(), now())
        ON CONFLICT (key) DO NOTHING
        """
    )
