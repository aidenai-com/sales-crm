"""
Seeds the database with a realistic dataset.

Idempotent: it checks for existing users first and does nothing if the database has
already been seeded, so it is safe to run on every container start. Pass --force to wipe
the CRM tables and reseed.

    python -m app.seed
    python -m app.seed --force
"""

import argparse
import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.models import (
    Account,
    Activity,
    ActivityKind,
    Contact,
    ContactRole,
    Deal,
    DealContact,
    DealRole,
    Lead,
    PipelineTemplate,
    Reminder,
    Stage,
    StageDeliverable,
    User,
    UserRole,
)
from app.seed_data import (
    ACCOUNTS,
    ACTIVITIES,
    CONTACT_ROLES,
    CONTACTS,
    DEAL_PEOPLE,
    DEALS,
    LEADS,
    PIPELINES,
    USERS,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("seed")


async def already_seeded(db: AsyncSession) -> bool:
    result = await db.execute(select(func.count()).select_from(User))
    return int(result.scalar_one()) > 0


async def wipe(db: AsyncSession) -> None:
    """
    Order matters: activities reference deals, deals reference stages and accounts, and
    stages reference templates. Deleting in dependency order avoids relying on cascades.

    Completions and attachments are not listed: both cascade from deals, which are deleted
    here. `StageDeliverable` cascades from `Stage` for the same reason. Reminders do not
    cascade from anything deleted before them, so they go first explicitly.

    `DealRole` and `DealContact` are listed even though both cascade from `Deal`, because both also hold
    a RESTRICT foreign key to `ContactRole` — so deleting the roles would be refused while any mapping
    survived, and the order below is what makes that work. `ContactRole` itself is *not* wiped: it is
    seeded by migration and is configuration rather than demo data.
    """
    for model in (Reminder, Activity, DealContact, DealRole, Deal, Contact, Lead, StageDeliverable, Stage, PipelineTemplate, Account, User):
        await db.execute(delete(model))
    await db.flush()
    logger.info("Cleared existing CRM data")


async def seed(db: AsyncSession) -> None:
    today = date.today()
    now = datetime.now(timezone.utc)

    # --- Users ---------------------------------------------------------------
    users: dict[str, User] = {}

    admin = User(
        email=settings.seed_admin_email,
        full_name="Ashrith Reddy",
        initials="AR",
        job_title="Administrator",
        role=UserRole.ADMIN,
        password_hash=hash_password(settings.seed_admin_password),
    )
    db.add(admin)
    users[admin.email] = admin

    for email, full_name, initials, job_title, role in USERS:
        user = User(
            email=email,
            full_name=full_name,
            initials=initials,
            job_title=job_title,
            role=role,
            password_hash=hash_password(settings.seed_user_password),
        )
        db.add(user)
        users[email] = user

    await db.flush()
    logger.info("Seeded %d users", len(users))

    # --- Pipelines -----------------------------------------------------------
    templates: dict[str, PipelineTemplate] = {}
    stages: dict[tuple[str, str], Stage] = {}

    for name, stage_defs in PIPELINES:
        template = PipelineTemplate(name=name)
        db.add(template)
        await db.flush()
        templates[name] = template

        for position, definition in enumerate(stage_defs, start=1):
            stage = Stage(
                pipeline_template_id=template.id,
                name=definition["name"],
                short_name=definition["short_name"],
                probability=definition["probability"],
                color=definition["color"],
                kind=definition["kind"],
                position=position,
                wip_limit=None,
                entry_criteria=definition.get("entry_criteria"),
                exit_criteria=definition.get("exit_criteria"),
                key_activities=definition.get("key_activities"),
            )
            # Rows now, not a JSONB array — a rep ticks these off and files documents
            # against them, so each needs an id that survives an admin edit.
            for order, text in enumerate(definition.get("deliverables") or [], start=1):
                stage.deliverables.append(StageDeliverable(text=text, position=order))
            db.add(stage)
            stages[(name, definition["name"])] = stage

    await db.flush()
    logger.info(
        "Seeded %d pipelines with %d stages",
        len(templates),
        len(stages),
    )

    # --- Accounts and leads --------------------------------------------------
    accounts: dict[str, Account] = {}
    for key, name, industry, owner_email in ACCOUNTS:
        account = Account(
            name=name,
            industry=industry,
            owner_id=users[owner_email].id,
        )
        db.add(account)
        accounts[key] = account

    await db.flush()

    leads: dict[str, Lead] = {}
    for key, account_key, business_unit in LEADS:
        # No owner. A business unit's stewardship follows its account — see migration f0a4e79c2b13.
        lead = Lead(
            account_id=accounts[account_key].id,
            business_unit=business_unit,
        )
        db.add(lead)
        leads[key] = lead

    await db.flush()
    logger.info("Seeded %d accounts and %d leads", len(accounts), len(leads))

    # --- Deals ---------------------------------------------------------------
    deals: dict[str, Deal] = {}
    for (
        key,
        name,
        account_key,
        lead_key,
        pipeline_name,
        stage_name,
        value,
        days_until_close,
        owner_email,
    ) in DEALS:
        deal = Deal(
            name=name,
            # Backdated deliberately. `created_at` defaults to now, and health treats
            # creation as a touch — so without this every seeded deal would look freshly
            # created and the "gone quiet for 21 days" state could never appear in the
            # demo data. Deals in a real pipeline have been open for months.
            created_at=now - timedelta(days=150),
            account_id=accounts[account_key].id,
            lead_id=leads[lead_key].id if lead_key else None,
            pipeline_template_id=templates[pipeline_name].id,
            stage_id=stages[(pipeline_name, stage_name)].id,
            value=Decimal(value),
            currency="USD",
            expected_close_date=today + timedelta(days=days_until_close),
            owner_id=users[owner_email].id,
        )
        db.add(deal)
        deals[key] = deal

    await db.flush()
    logger.info("Seeded %d deals", len(deals))

    # --- Contact roles -------------------------------------------------------
    #
    # Upserted by key rather than inserted. Migration b8e13d5a06c7 already seeded these, so a plain
    # insert would collide on `uq_contact_roles_key` on any database that has been migrated — which is
    # every database except one built by `create_all`.
    roles: dict[str, ContactRole] = {
        role.key: role for role in (await db.execute(select(ContactRole))).scalars()
    }
    for key, role_name, position, is_system in CONTACT_ROLES:
        if key not in roles:
            role = ContactRole(key=key, name=role_name, position=position, is_system=is_system)
            db.add(role)
            roles[key] = role
    await db.flush()

    # --- Contacts ------------------------------------------------------------
    contacts: dict[str, Contact] = {}
    for (
        key,
        account_key,
        full_name,
        designation,
        email,
        phone,
        linkedin,
        side,
    ) in CONTACTS:
        contact = Contact(
            account_id=accounts[account_key].id,
            full_name=full_name,
            designation=designation,
            email=email,
            phone=phone,
            linkedin_url=linkedin,
            contact_type=side,
        )
        db.add(contact)
        contacts[key] = contact

    await db.flush()
    logger.info("Seeded %d contacts", len(contacts))

    # --- Deal roles and their mappings ---------------------------------------
    role_slots = 0
    mappings = 0
    for deal_key, extra_roles, people in DEAL_PEOPLE:
        deal = deals[deal_key]

        # Every role named on a person is tracked, plus any listed as still being looked for. Without
        # the union, a deal could show somebody under a heading absent from its own list of roles.
        tracked = {role_key for _, role_key in people if role_key} | set(extra_roles)
        for role_key in tracked:
            db.add(DealRole(deal_id=deal.id, role_id=roles[role_key].id))
            role_slots += 1

        for contact_key, role_key in people:
            db.add(
                DealContact(
                    deal_id=deal.id,
                    contact_id=contacts[contact_key].id,
                    role_id=roles[role_key].id if role_key else None,
                )
            )
            mappings += 1

    await db.flush()
    logger.info("Seeded %d tracked roles and %d deal contacts", role_slots, mappings)

    # --- Activities ----------------------------------------------------------
    subject_lookup = {"account": accounts, "lead": leads, "deal": deals}

    for subject_kind, subject_key, kind, summary, author_email, days_ago in ACTIVITIES:
        target = subject_lookup[subject_kind][subject_key]
        column = {"account": "account_id", "lead": "lead_id", "deal": "deal_id"}[subject_kind]

        db.add(
            Activity(
                kind=ActivityKind(kind),
                summary=summary,
                author_id=users[author_email].id,
                occurred_at=now - timedelta(days=days_ago),
                **{column: target.id},
            )
        )

    await db.flush()
    logger.info("Seeded %d activities", len(ACTIVITIES))


async def main(force: bool) -> None:
    async with SessionLocal() as db:
        if await already_seeded(db):
            if not force:
                logger.info("Database already contains users; nothing to do. Use --force to reseed.")
                return
            await wipe(db)

        await seed(db)
        await db.commit()

    await engine.dispose()

    logger.info("")
    logger.info("Seed complete. Sign in with:")
    logger.info("  admin  %s / %s", settings.seed_admin_email, settings.seed_admin_password)
    logger.info("  rep    %s / %s", USERS[0][0], settings.seed_user_password)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the CRM database.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing CRM data before seeding.",
    )
    args = parser.parse_args()
    asyncio.run(main(force=args.force))
