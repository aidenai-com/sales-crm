"""
Test fixtures.

These run against a real Postgres — the same server the app uses, but a throwaway
database created and dropped per session. Authorization is expressed largely as SQL
predicates (`scope_accounts` and friends), so testing it against SQLite or a mock would
verify Python that happens to compile rather than the rules that actually run.
"""

import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    Account,
    Deal,
    Lead,
    PipelineTemplate,
    Stage,
    StageDeliverable,
    StageKind,
    User,
    UserRole,
)

TEST_DB = f"crm_test_{uuid.uuid4().hex[:8]}"


def _url(database: str) -> str:
    return (
        f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}"
        f"@{settings.postgres_host}:{settings.postgres_port}/{database}"
    )


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    # CREATE DATABASE cannot run in a transaction, hence AUTOCOMMIT on the admin engine.
    admin = create_async_engine(_url(settings.postgres_db), isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.exec_driver_sql(f'CREATE DATABASE "{TEST_DB}"')
    await admin.dispose()

    test_engine = create_async_engine(_url(TEST_DB))
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield test_engine
    await test_engine.dispose()

    admin = create_async_engine(_url(settings.postgres_db), isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        # Any lingering connection would block the drop.
        await conn.exec_driver_sql(
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{TEST_DB}'"
        )
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{TEST_DB}"')
    await admin.dispose()


@pytest_asyncio.fixture
async def session(engine) -> AsyncGenerator[AsyncSession, None]:
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s


@pytest_asyncio.fixture
async def data(session: AsyncSession) -> dict:
    """
    A small fixture with the shape that makes the rules interesting: one account owned by
    Marcus, holding leads and deals owned by *different* reps. That split is the whole
    reason the visibility rule needed deciding.
    """
    # Each test gets a clean slate; the tables are shared across the session.
    for table in reversed(Base.metadata.sorted_tables):
        await session.execute(table.delete())
    await session.commit()

    admin = User(
        email="admin@example.com", full_name="Ada Admin", initials="AA",
        job_title="Administrator", role=UserRole.ADMIN, password_hash=hash_password("pw12345678"),
    )
    priya = User(
        email="priya@example.com", full_name="Priya Rep", initials="PR",
        job_title="AE", role=UserRole.REP, password_hash=hash_password("pw12345678"),
    )
    marcus = User(
        email="marcus@example.com", full_name="Marcus Rep", initials="MR",
        job_title="AE", role=UserRole.REP, password_hash=hash_password("pw12345678"),
    )
    session.add_all([admin, priya, marcus])
    await session.flush()

    pipeline = PipelineTemplate(name="Direct", tracks_partner=False)
    session.add(pipeline)
    await session.flush()

    open_stage = Stage(
        pipeline_template_id=pipeline.id, name="Qualify", short_name="Qualify",
        probability=15, color="#4a90e2", kind=StageKind.OPEN, position=1,
    )
    # A second open stage, so auto-advance has somewhere to go. With only one open stage
    # every advance test would pass for the wrong reason — the "last open stage" guard.
    second_stage = Stage(
        pipeline_template_id=pipeline.id, name="Propose", short_name="Propose",
        probability=60, color="#7b61ff", kind=StageKind.OPEN, position=2,
    )
    won_stage = Stage(
        pipeline_template_id=pipeline.id, name="Won", short_name="Won",
        probability=100, color="#004eba", kind=StageKind.WON, position=3,
    )
    session.add_all([open_stage, second_stage, won_stage])
    await session.flush()

    # Two deliverables on the first stage. Two rather than one, so a test can tick one and
    # assert the deal did *not* move.
    first_deliverable = StageDeliverable(stage_id=open_stage.id, text="Discovery call held", position=1)
    second_deliverable = StageDeliverable(stage_id=open_stage.id, text="Budget confirmed", position=2)
    # `second_stage` deliberately has none, which is what exercises the empty-checklist guard.
    session.add_all([first_deliverable, second_deliverable])
    await session.flush()

    # Marcus owns the account; Priya owns work inside it. This is the case that decides
    # whether the account tree resolves for Priya.
    shared = Account(name="Shared Bank", industry="Banking", owner_id=marcus.id, is_partner=False)
    marcus_only = Account(name="Marcus Only", industry="Insurance", owner_id=marcus.id, is_partner=False)
    session.add_all([shared, marcus_only])
    await session.flush()

    priya_lead = Lead(account_id=shared.id, business_unit="Priya Unit", owner_id=priya.id)
    marcus_lead = Lead(account_id=shared.id, business_unit="Marcus Unit", owner_id=marcus.id)
    session.add_all([priya_lead, marcus_lead])
    await session.flush()

    def deal(name: str, owner: User, lead: Lead | None, account: Account, stage: Stage) -> Deal:
        return Deal(
            name=name, account_id=account.id, lead_id=lead.id if lead else None,
            pipeline_template_id=pipeline.id, stage_id=stage.id, value=100_000,
            currency="USD", expected_close_date=date.today() + timedelta(days=45),
            owner_id=owner.id,
        )

    priya_deal = deal("Priya Deal", priya, priya_lead, shared, open_stage)
    marcus_deal = deal("Marcus Deal", marcus, marcus_lead, shared, open_stage)
    marcus_other = deal("Marcus Other", marcus, None, marcus_only, won_stage)
    session.add_all([priya_deal, marcus_deal, marcus_other])
    await session.commit()

    return {
        "admin": admin, "priya": priya, "marcus": marcus,
        "pipeline": pipeline, "open_stage": open_stage, "second_stage": second_stage,
        "won_stage": won_stage,
        "first_deliverable": first_deliverable, "second_deliverable": second_deliverable,
        "shared": shared, "marcus_only": marcus_only,
        "priya_lead": priya_lead, "marcus_lead": marcus_lead,
        "priya_deal": priya_deal, "marcus_deal": marcus_deal, "marcus_other": marcus_other,
    }


@pytest_asyncio.fixture
async def client(session: AsyncSession, data: dict) -> AsyncGenerator[AsyncClient, None]:
    """An HTTP client wired to the test database, so requests exercise the real routers."""

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def token_for(client: AsyncClient, email: str, password: str = "pw12345678") -> str:
    """Signs in and returns the access token. The default is the fixture users' password."""
    response = await client.post(
        f"{settings.api_v1_prefix}/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()["accessToken"]


@pytest_asyncio.fixture
async def as_priya(client: AsyncClient) -> dict[str, str]:
    return {"Authorization": f"Bearer {await token_for(client, 'priya@example.com')}"}


@pytest_asyncio.fixture
async def as_marcus(client: AsyncClient) -> dict[str, str]:
    return {"Authorization": f"Bearer {await token_for(client, 'marcus@example.com')}"}


@pytest_asyncio.fixture
async def as_admin(client: AsyncClient) -> dict[str, str]:
    return {"Authorization": f"Bearer {await token_for(client, 'admin@example.com')}"}
