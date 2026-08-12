"""
Analytics aggregations and their filters.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient

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


async def test_weighted_value_uses_stage_probability(client: AsyncClient, as_admin, data):
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    qualify = next(s for s in response.json()["funnel"] if s["stageName"] == "Qualify")
    # 200,000 at 15% — the same derivation the board and the deal page use.
    assert Decimal(qualify["weightedValue"]) == Decimal("30000.00")


async def test_by_owner_splits_value_per_individual(client: AsyncClient, as_admin, data):
    """The 'filterable by individuals' half of the feedback."""
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    owners = {slice_["ownerName"]: slice_ for slice_ in response.json()["byOwner"]}

    assert owners["Priya Rep"]["openCount"] == 1
    assert Decimal(owners["Priya Rep"]["openValue"]) == Decimal("100000.00")
    # Marcus has one open deal and one won, so his won column is populated too.
    assert owners["Marcus Rep"]["openCount"] == 1
    assert owners["Marcus Rep"]["wonCount"] == 1


async def test_the_summary_no_longer_reports_by_partner(client: AsyncClient, as_admin):
    """
    Partner reporting was removed with `deals.partner_id`.

    This replaces a test that asserted a by-partner ranking with Direct as its baseline. The split was
    dropped deliberately rather than re-derived from a deal's partner-side contacts, so the absence is
    pinned here — otherwise the next person to read the Analytics screen sees a gap and fills it back in.
    """
    response = await client.get(f"{API}/analytics/summary", headers=as_admin)
    assert response.status_code == 200
    body = response.json()

    assert "byPartner" not in body
    # The rankings that survive.
    assert "byOwner" in body
    assert "funnel" in body


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
    """Owner plus close-date range must narrow together, not independently."""
    response = await client.get(
        f"{API}/analytics/summary",
        headers=as_admin,
        # snake_case: query parameters are not camelCased anywhere in this API, and FastAPI
        # ignores an unrecognised one silently, so a wrong spelling reads as "no filter".
        params={
            "owner_id": str(data["priya"].id),
            "close_from": str(date.today()),
            "close_to": str(date.today() + timedelta(days=365)),
        },
    )
    body = response.json()
    assert body["filters"]["dealCount"] == 1
    assert [s["ownerName"] for s in body["byOwner"]] == ["Priya Rep"]


async def test_a_close_range_that_excludes_everything_returns_empty_series(
    client: AsyncClient, as_admin, data
):
    response = await client.get(
        f"{API}/analytics/summary",
        headers=as_admin,
        params={"close_from": str(date.today() + timedelta(days=3650))},
    )
    body = response.json()

    assert body["filters"]["dealCount"] == 0
    assert body["byOwner"] == []
    assert body["forecast"] == []
    # The funnel still lists every stage — the shape of the pipeline does not depend on
    # whether the filter matched anything.
    assert len(body["funnel"]) == 3
    assert all(slice_["count"] == 0 for slice_ in body["funnel"])


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
