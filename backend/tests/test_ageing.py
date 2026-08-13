"""
Ageing, and the exception report built on it.

The rules here are the ones a report will be trusted or distrusted on, so each is pinned separately: which
clock a figure is measured on, what happens when the evidence is missing, and — most importantly — what does
*not* put a deal in the exception list. A report that flags everything is the failure this feature exists to
correct, so "an untouched checklist is not an exception" is as much a requirement as "a stuck deal is".
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.models import Activity, ActivityKind, Deal, Stage, StageDeliverable, StageKind
from app.services import ageing as ageing_service

API = settings.api_v1_prefix
pytestmark = pytest.mark.asyncio

TODAY = date(2026, 8, 13)


def _stage(position: int, expected: int | None, kind: StageKind = StageKind.OPEN):
    """A stand-in with only the attributes ageing reads, so these stay unit tests."""

    class FakeStage:
        def __init__(self) -> None:
            self.position = position
            self.expected_days = expected
            self.kind = kind
            self.name = f"Stage {position}"
            self.short_name = f"S{position}"

    return FakeStage()


def _deal(stage, created_days_ago: int):
    class FakeDeal:
        def __init__(self) -> None:
            self.stage = stage
            self.created_at = datetime(2026, 8, 13, tzinfo=UTC) - timedelta(days=created_days_ago)

    return FakeDeal()


# --- The cumulative allowance ------------------------------------------------


def test_cumulative_expected_days_sums_the_stages_up_to_here():
    stages = [_stage(1, 21), _stage(2, 30), _stage(3, 45)]
    assert ageing_service.cumulative_expected_days(stages, 1) == 21
    assert ageing_service.cumulative_expected_days(stages, 2) == 51
    assert ageing_service.cumulative_expected_days(stages, 3) == 96


def test_cumulative_expected_days_excludes_terminal_stages():
    """Nothing is expected to leave Closed Won, so its duration cannot be part of an allowance."""
    stages = [_stage(1, 21), _stage(2, 30), _stage(3, 999, StageKind.WON)]
    assert ageing_service.cumulative_expected_days(stages, 3) == 51


def test_one_missing_duration_makes_the_whole_allowance_unknown():
    """
    A partial sum would be a *smaller* allowance than the process actually gives.

    That is the dangerous direction: it would flag deals that are perfectly on schedule, which is exactly the
    noise that makes an exception report get ignored. None is the honest answer.
    """
    stages = [_stage(1, 21), _stage(2, None), _stage(3, 45)]
    assert ageing_service.cumulative_expected_days(stages, 3) is None


# --- Which clock, and why ----------------------------------------------------


def test_a_logged_move_measures_the_current_stage_alone():
    stage = _stage(4, 45)
    deal = _deal(stage, created_days_ago=151)
    moved = datetime(2026, 8, 13, tzinfo=UTC) - timedelta(days=10)

    age = ageing_service.deal_ageing(deal, [_stage(1, 21), _stage(2, 30), _stage(3, 45), stage], moved, TODAY)

    assert age is not None
    assert age.basis == "stage"
    # Ten days in this stage, not the 151 the deal has existed for. Attributing the whole pipeline's age to
    # the current stage is the mistake this branch exists to avoid.
    assert age.days_used == 10
    assert age.days_expected == 45
    assert age.days_over == 0
    assert age.days_left == 35
    assert age.is_stuck is False


def test_no_logged_move_measures_the_cycle_so_far():
    stage = _stage(4, 45)
    stages = [_stage(1, 21), _stage(2, 30), _stage(3, 45), stage]
    deal = _deal(stage, created_days_ago=151)

    age = ageing_service.deal_ageing(deal, stages, None, TODAY)

    assert age is not None
    assert age.basis == "cycle"
    assert age.days_used == 151
    # The cumulative allowance to the end of stage 4, not stage 4's own 45 days.
    assert age.days_expected == 141
    assert age.days_over == 10
    assert age.is_stuck is True


def test_the_users_own_example_a_stage_that_has_eaten_the_whole_cycle():
    """
    "Deal has been in Discovery for 3 months. Expected total sales cycle is only 3 months."

    Discovery is stage 2 of a 90-day process, so 90 days spent to reach the end of stage 2 is 39 days past
    what the process allows by then. The report must say so.
    """
    discovery = _stage(2, 30)
    stages = [_stage(1, 21), discovery, _stage(3, 39)]
    deal = _deal(discovery, created_days_ago=90)

    age = ageing_service.deal_ageing(deal, stages, None, TODAY)

    assert age is not None
    assert age.days_used == 90
    assert age.days_expected == 51
    assert age.days_over == 39
    assert age.is_stuck is True


def test_a_closed_deal_has_no_ageing():
    """A won deal that took nine months took nine months. Reporting it as overdue is unactionable history."""
    won = _stage(6, None, StageKind.WON)
    assert ageing_service.deal_ageing(_deal(won, 400), [won], None, TODAY) is None


def test_no_expected_duration_means_no_verdict_rather_than_a_guess():
    stage = _stage(1, None)
    age = ageing_service.deal_ageing(_deal(stage, 200), [stage], None, TODAY)

    assert age is not None
    assert age.days_used == 200
    assert age.days_expected is None
    # Not stuck: nothing said how long this should take, so nothing can call it late.
    assert age.days_over == 0
    assert age.is_stuck is False


def test_a_back_dated_record_cannot_produce_a_negative_age():
    """A negative age would sort straight to the top of a worst-first list."""
    stage = _stage(1, 21)
    future = datetime(2026, 8, 13, tzinfo=UTC) + timedelta(days=5)
    age = ageing_service.deal_ageing(_deal(stage, 0), [stage], future, TODAY)
    assert age is not None
    assert age.days_used == 0


# --- The exception report ----------------------------------------------------


async def test_the_report_names_who_where_why_and_what_action(
    client: AsyncClient, as_admin, session, data
):
    """
    The four questions the requirement asks, answered in one row.

    The fixture's deals were created 90 days ago with no stage moves logged, so they are past a cumulative
    allowance of 45 days and the report has something to say about them.
    """
    for deal in (await session.execute(select(Deal))).scalars():
        deal.created_at = datetime.now(UTC) - timedelta(days=90)
    for stage in (await session.execute(select(Stage))).scalars():
        if stage.kind is StageKind.OPEN:
            stage.expected_days = 15
    await session.commit()

    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"period": "year"}
    )
    assert response.status_code == 200
    risks = response.json()["risks"]

    assert risks["deals"], "deals 90 days into a 30-day allowance must be flagged"
    row = risks["deals"][0]

    # Who, where.
    assert row["ownerName"]
    assert row["stageName"]
    # Why — with the numbers in it, not a bare label.
    codes = {reason["code"] for reason in row["reasons"]}
    assert "stuck" in codes
    stuck = next(reason for reason in row["reasons"] if reason["code"] == "stuck")
    assert str(row["ageing"]["daysOver"]) in stuck["detail"]
    # What action — every reason carries one.
    assert all(reason["action"] for reason in row["reasons"])
    # Ordered worst first.
    overs = [entry["ageing"]["daysOver"] for entry in risks["deals"]]
    assert overs == sorted(overs, reverse=True)


async def test_an_untouched_checklist_alone_is_not_an_exception(
    client: AsyncClient, as_admin, session, data
):
    """
    The difference between an exception report and a list of every deal.

    A deal three days into its stage with nothing ticked is on schedule. If unticked deliverables qualified a
    deal, every new deal would be flagged the day it was created and the report would be worthless.
    """
    today = datetime.now(UTC)
    for deal in (await session.execute(select(Deal))).scalars():
        deal.created_at = today
        deal.expected_close_date = (today + timedelta(days=60)).date()
    for stage in (await session.execute(select(Stage))).scalars():
        stage.expected_days = 30
    await session.commit()

    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"period": "year"}
    )
    risks = response.json()["risks"]

    assert risks["stuckCount"] == 0
    assert risks["deals"] == [], "a fresh deal with an untouched checklist is not an exception"


async def test_a_logged_stage_move_switches_the_basis_to_the_stage(
    client: AsyncClient, as_admin, session, data
):
    """
    The sharper measure takes over the moment there is evidence for it.

    Without this the report would keep blaming the whole cycle for a deal that moved yesterday.
    """
    today = datetime.now(UTC)
    deal = data["priya_deal"]
    deal.created_at = today - timedelta(days=200)
    for stage in (await session.execute(select(Stage))).scalars():
        stage.expected_days = 30
    session.add(
        Activity(
            deal_id=deal.id,
            kind=ActivityKind.STAGE_CHANGE,
            summary="Moved to Qualify.",
            author_id=data["priya"].id,
            occurred_at=today - timedelta(days=2),
        )
    )
    await session.commit()

    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"period": "year"}
    )
    body = response.json()
    row = next(entry for entry in body["deals"] if entry["id"] == str(deal.id))

    assert row["ageing"]["basis"] == "stage"
    assert row["ageing"]["daysUsed"] == 2
    assert row["ageing"]["daysOver"] == 0


async def test_stages_without_deliverables_are_counted_as_a_configuration_gap(
    client: AsyncClient, as_admin, session, data
):
    """
    Counted across the whole book, not only among flagged deals.

    It is an administrator's own setup gap: a rep cannot add deliverables to a stage, and a report that filed
    this under their performance would be blaming the wrong person.
    """
    # The fixture's open stage *does* define deliverables, so start by confirming the count is clean — then
    # remove them and confirm it notices. Asserting the end state alone would pass against a hard-coded zero.
    before = (
        await client.get(f"{API}/analytics/summary", headers=as_admin, params={"period": "year"})
    ).json()["risks"]
    assert before["withoutActionsCount"] == 0

    for deliverable in (await session.execute(select(StageDeliverable))).scalars():
        await session.delete(deliverable)
    await session.commit()

    after = (
        await client.get(f"{API}/analytics/summary", headers=as_admin, params={"period": "year"})
    ).json()["risks"]

    # Every open deal now sits in a stage with nothing defined.
    assert after["withoutActionsCount"] == after["openCount"]


async def test_a_rep_sees_only_their_own_exceptions(client: AsyncClient, as_priya, session, data):
    """
    Scoped like every other read.

    The tab is hidden for reps in the UI, but the endpoint is the boundary: hiding a control is presentation,
    and a report about the whole team must not be one request away.
    """
    for deal in (await session.execute(select(Deal))).scalars():
        deal.created_at = datetime.now(UTC) - timedelta(days=200)
    for stage in (await session.execute(select(Stage))).scalars():
        stage.expected_days = 10
    await session.commit()

    response = await client.get(
        f"{API}/analytics/summary", headers=as_priya, params={"period": "year"}
    )
    risks = response.json()["risks"]

    assert risks["openCount"] == 1
    assert {row["ownerName"] for row in risks["deals"]} <= {"Priya Rep"}
