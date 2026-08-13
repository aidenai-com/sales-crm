"""
Analytics aggregations and their filters.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.models import Account, Deal

API = settings.api_v1_prefix
pytestmark = pytest.mark.asyncio


async def test_funnel_includes_stages_holding_nothing(client: AsyncClient, as_admin, data):
    """
    A funnel that omits its empty stages hides exactly the gap a reader is looking for.
    """
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    assert response.status_code == 200

    funnel = response.json()["funnel"]
    by_name = {slice_["stageName"]: slice_ for slice_ in funnel}

    assert set(by_name) == {"Qualify", "Propose", "Won"}
    assert by_name["Propose"]["count"] == 0
    assert Decimal(by_name["Propose"]["value"]) == Decimal("0")
    # Two open deals sit in Qualify in the fixture, at 100,000 each.
    assert by_name["Qualify"]["count"] == 2
    assert Decimal(by_name["Qualify"]["value"]) == Decimal("200000.00")


async def test_no_response_carries_a_weighted_value(client: AsyncClient, as_admin, data):
    """
    Weighted value is gone from the whole application, and this pins it.

    It was `value * stage_probability / 100`. A stage percentage says how far along a deal is, not how
    likely it is to be won, so the product was a figure shaped like expected revenue that meant nothing —
    and it was printed on five screens and inside the assistant answers. The absence is asserted rather
    than assumed, because "weighted pipeline" is the obvious thing for the next person to add back.
    """
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    assert response.status_code == 200
    assert "eighted" not in response.text

    # The progression percentage itself stays — a real property of the stage, just not a multiplier.
    qualify = next(s for s in response.json()["funnel"] if s["stageName"] == "Qualify")
    assert qualify["probability"] == 15
    assert Decimal(qualify["value"]) == Decimal("200000.00")


async def test_by_owner_splits_value_per_individual(client: AsyncClient, as_admin, data):
    """The 'filterable by individuals' half of the feedback."""
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    owners = {slice_["ownerName"]: slice_ for slice_ in response.json()["byOwner"]}

    assert owners["Priya Rep"]["openCount"] == 1
    assert Decimal(owners["Priya Rep"]["openValue"]) == Decimal("100000.00")
    # Marcus has one open deal and one won, so his won column is populated too.
    assert owners["Marcus Rep"]["openCount"] == 1
    assert owners["Marcus Rep"]["wonCount"] == 1


async def test_by_partner_reports_direct_alongside_partners(
    client: AsyncClient, as_admin, session, data
):
    """
    Partner contribution only means something next to the business that arrived without one.
    """
    partner = Account(
        name="Channel Co", industry="Consulting", owner_id=data["marcus"].id, is_partner=True
    )
    session.add(partner)
    await session.flush()
    session.add(
        Deal(
            name="Partner-led", account_id=data["shared"].id, partner_id=partner.id,
            pipeline_template_id=data["pipeline"].id, stage_id=data["open_stage"].id,
            value=Decimal("50000"), expected_close_date=date.today() + timedelta(days=30),
            owner_id=data["marcus"].id,
        )
    )
    await session.commit()

    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    partners = response.json()["byPartner"]

    names = [slice_["partnerName"] for slice_ in partners]
    assert "Channel Co" in names
    assert "Direct" in names
    # Direct sorts last regardless of size, so the partner rows read as the chart's subject.
    assert names[-1] == "Direct"

    channel = next(s for s in partners if s["partnerName"] == "Channel Co")
    assert Decimal(channel["openValue"]) == Decimal("50000.00")


async def test_forecast_groups_open_deals_by_close_month(
    client: AsyncClient, as_admin, session, data
):
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    forecast = response.json()["forecast"]

    assert forecast, "the fixture's open deals must land in some month"
    # Months are the first of the month, and sorted.
    months = [slice_["month"] for slice_ in forecast]
    assert months == sorted(months)
    assert all(month.endswith("-01") for month in months)


async def test_forecast_excludes_closed_deals(client: AsyncClient, as_admin, data):
    """A forecast including closed business is a report of the past in a forecast's clothing."""
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    total_forecast = sum(Decimal(s["value"]) for s in response.json()["forecast"])
    # Two open deals at 100,000; the won one is excluded.
    assert total_forecast == Decimal("200000.00")


async def test_win_rate_counts_only_decided_deals(client: AsyncClient, as_admin, data):
    """
    Including open deals in the denominator would report a win rate that falls every time
    somebody adds a deal — pipeline growth, not closing ability.
    """
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    outcomes = response.json()["outcomes"]

    assert outcomes["wonCount"] == 1
    assert outcomes["lostCount"] == 0
    assert outcomes["openCount"] == 2
    # One won, nothing lost: 100%, not 33%.
    assert outcomes["winRate"] == 100.0


async def test_win_rate_is_zero_rather_than_an_error_with_nothing_decided(
    client: AsyncClient, as_priya, data
):
    """Priya's scope holds one open deal and nothing decided."""
    response = await client.get(f"{API}/analytics/summary", headers=as_priya)
    assert response.json()["outcomes"]["winRate"] == 0.0


async def test_filters_compose(client: AsyncClient, as_admin, data):
    """Owner plus period must narrow together, not independently."""
    response = await client.get(
        f"{API}/analytics/summary",
        headers=as_admin,
        # snake_case: query parameters are not camelCased anywhere in this API, and FastAPI
        # ignores an unrecognised one silently, so a wrong spelling reads as "no filter".
        params={"owner_id": str(data["priya"].id), "period": "year"},
    )
    body = response.json()
    assert body["filters"]["dealCount"] == 1
    assert [s["ownerName"] for s in body["byOwner"]] == ["Priya Rep"]


async def test_an_unknown_period_is_refused(client: AsyncClient, as_admin, data):
    """
    422, not a silent fallback.

    The period scopes every panel, so a misspelling that quietly became "this year" would draw a screen
    describing a window nobody asked for and label it with the one they did.
    """
    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"period": "fortnight"}
    )
    assert response.status_code == 422


async def test_a_period_that_excludes_everything_says_so_rather_than_hiding_it(
    client: AsyncClient, as_admin, session, data
):
    """
    The screen is scoped by *created* date, so a narrow period can hide open pipeline entirely.

    That is the accepted cost of one global period, and `excludedOpenCount` is the mitigation: the omission
    is reported so the filter bar can print it, rather than a funnel quietly reading as "no pipeline".
    """
    # Push every deal creation into last year, leaving this year window empty.
    for deal in (await session.execute(select(Deal))).scalars():
        deal.created_at = datetime.now(UTC) - timedelta(days=400)
    await session.commit()

    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"period": "year"}
    )
    body = response.json()

    assert body["filters"]["dealCount"] == 0
    assert body["byOwner"] == []
    assert body["forecast"] == []
    assert body["deals"] == []
    # Two open deals exist and are not shown. Reporting that is the whole point.
    assert body["filters"]["excludedOpenCount"] == 2
    # The funnel still lists every stage — the shape of the pipeline does not depend on
    # whether the filter matched anything.
    assert len(body["funnel"]) == 3
    assert all(slice_["count"] == 0 for slice_ in body["funnel"])


async def test_created_buckets_account_for_every_deal_in_the_period(
    client: AsyncClient, as_admin, data
):
    """
    The buckets partition the window: every deal lands in exactly one, or the creation chart draws a
    different total from the figure printed above it.
    """
    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"period": "year"}
    )
    body = response.json()
    created = body["created"]

    assert sum(bucket["count"] for bucket in created["buckets"]) == created["count"]
    assert created["count"] == body["filters"]["dealCount"]
    assert sum(Decimal(bucket["value"]) for bucket in created["buckets"]) == Decimal(created["value"])
    # Twelve months, empty ones kept — a month with nothing created is the signal, not a gap to close up.
    assert len(created["buckets"]) == 12


async def test_the_deal_list_matches_the_aggregates_it_was_drawn_from(
    client: AsyncClient, as_admin, data
):
    """
    Drilling reads this list, so if it disagreed with the bars a reader would open a stage of three and
    find two deals. One request, one deal set, is the property that prevents it.
    """
    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"period": "year"}
    )
    body = response.json()

    assert len(body["deals"]) == body["filters"]["dealCount"]
    assert sum(s["count"] for s in body["funnel"]) == body["filters"]["dealCount"]
    assert sum(s["count"] for s in body["byPipeline"]) == body["filters"]["dealCount"]

    # Every stage the deals sit in must appear in the funnel, and carry the pipeline it belongs to.
    stage_ids = {slice_["stageId"] for slice_ in body["funnel"]}
    assert {deal["stageId"] for deal in body["deals"]} <= stage_ids
    assert all(slice_["pipelineId"] for slice_ in body["funnel"])


async def test_by_pipeline_counts_companies_distinctly(client: AsyncClient, as_admin, data):
    """
    Two deals on one account is one company. The fixture holds three deals across two accounts, so a
    per-deal count would report three companies — the number the reader asked for companies to avoid.
    """
    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"period": "year"}
    )
    rows = response.json()["byPipeline"]

    assert len(rows) == 1
    assert rows[0]["count"] == 3
    # Fewer companies than deals is the assertion: distinct, not summed.
    assert rows[0]["accountCount"] == 2


async def test_pipeline_filter_restricts_the_funnel_to_that_pipeline(
    client: AsyncClient, as_admin, data
):
    response = await client.get(
        f"{API}/analytics/summary", headers=as_admin, params={"pipeline_id": str(data["pipeline"].id)}
    )
    assert {s["stageName"] for s in response.json()["funnel"]} == {"Qualify", "Propose", "Won"}


async def test_a_rep_only_sees_their_own_numbers(client: AsyncClient, as_priya, data):
    """
    Scoped like every other read. Analytics must not become the screen where a rep can read
    the whole company's pipeline.
    """
    response = await client.get(f"{API}/analytics/summary", headers=as_priya)
    body = response.json()

    assert body["filters"]["dealCount"] == 1
    assert [s["ownerName"] for s in body["byOwner"]] == ["Priya Rep"]
    assert Decimal(body["totalOpenValue"]) == Decimal("100000.00")


async def test_the_prior_period_is_bucketed_and_aligned_with_this_one(
    client: AsyncClient, as_admin, data
):
    """
    The created chart draws the previous window behind this one, so the two lists must line up by index.

    They are paired by *position*, not by date, because two windows rarely divide the same way — a month of
    five weeks against one of four would leave the last column with no partner. Position pairing answers the
    question a reader asks ("how did the third week compare with the third week") and the API pads or trims
    so the client can index one against the other without checking.
    """
    for period in ("week", "month", "quarter", "year"):
        response = await client.get(
            f"{API}/analytics/summary", headers=as_admin, params={"period": period}
        )
        created = response.json()["created"]
        assert len(created["priorBuckets"]) == len(created["buckets"]), period
        # The prior buckets describe the prior window, so they can never sum past its total.
        assert sum(Decimal(b["value"]) for b in created["priorBuckets"]) <= Decimal(
            created["priorValue"]
        ), period
