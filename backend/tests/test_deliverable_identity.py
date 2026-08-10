"""
That a stage edit preserves deliverable identity.

This is the reason deliverables became rows rather than staying a JSONB array, so it is the
test that would catch the regression back. If these fail, an admin fixing a typo in Settings
erases every rep's checkmarks and uploaded documents across every deal.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.core.config import settings
from app.models import DealDeliverableCompletion, StageDeliverable

API = settings.api_v1_prefix
pytestmark = pytest.mark.asyncio


async def _tick(client: AsyncClient, as_priya, data, deliverable_id) -> None:
    response = await client.put(
        f"{API}/deals/{data['priya_deal'].id}/deliverables/{deliverable_id}/completion",
        headers=as_priya,
    )
    assert response.status_code == 200


def _stage_payload(body: dict, stage_id) -> dict:
    return next(stage for stage in body["stages"] if stage["id"] == str(stage_id))


async def test_renaming_a_deliverable_keeps_its_id_and_its_completions(
    client: AsyncClient, as_priya, as_admin, session, data
):
    original_id = data["first_deliverable"].id
    await _tick(client, as_priya, data, original_id)

    response = await client.patch(
        f"{API}/pipelines/{data['pipeline'].id}/stages/{data['open_stage'].id}",
        headers=as_admin,
        json={
            "deliverables": [
                {"id": str(original_id), "text": "Discovery call completed"},
                {"id": str(data["second_deliverable"].id), "text": "Budget confirmed"},
            ]
        },
    )
    assert response.status_code == 200

    stage = _stage_payload(response.json(), data["open_stage"].id)
    renamed = stage["deliverables"][0]
    assert renamed["id"] == str(original_id), "the id must survive a rename"
    assert renamed["text"] == "Discovery call completed"

    # The tick is still there, against the same row.
    remaining = await session.execute(
        select(func.count()).select_from(DealDeliverableCompletion).where(
            DealDeliverableCompletion.stage_deliverable_id == original_id
        )
    )
    assert remaining.scalar_one() == 1


async def test_reordering_does_not_reassign_completions(
    client: AsyncClient, as_priya, as_admin, session, data
):
    """
    The failure the JSONB array made inevitable: with position as the key, swapping two
    entries would move a rep's checkmark onto the other deliverable.
    """
    first_id = data["first_deliverable"].id
    second_id = data["second_deliverable"].id
    await _tick(client, as_priya, data, first_id)

    response = await client.patch(
        f"{API}/pipelines/{data['pipeline'].id}/stages/{data['open_stage'].id}",
        headers=as_admin,
        json={
            "deliverables": [
                {"id": str(second_id), "text": "Budget confirmed"},
                {"id": str(first_id), "text": "Discovery call held"},
            ]
        },
    )
    assert response.status_code == 200

    stage = _stage_payload(response.json(), data["open_stage"].id)
    assert [d["id"] for d in stage["deliverables"]] == [str(second_id), str(first_id)]

    checklist = await client.get(
        f"{API}/deals/{data['priya_deal'].id}/checklist", headers=as_priya
    )
    deliverables = next(
        s for s in checklist.json()["stages"] if s["stageId"] == str(data["open_stage"].id)
    )["deliverables"]

    # The tick followed the row, not the position.
    ticked = [d["id"] for d in deliverables if d["complete"]]
    assert ticked == [str(first_id)]


async def test_adding_a_deliverable_leaves_existing_ticks_alone(
    client: AsyncClient, as_priya, as_admin, data
):
    first_id = data["first_deliverable"].id
    await _tick(client, as_priya, data, first_id)

    response = await client.patch(
        f"{API}/pipelines/{data['pipeline'].id}/stages/{data['open_stage'].id}",
        headers=as_admin,
        json={
            "deliverables": [
                {"id": str(first_id), "text": "Discovery call held"},
                {"id": str(data["second_deliverable"].id), "text": "Budget confirmed"},
                {"text": "Security review passed"},
            ]
        },
    )
    assert response.status_code == 200
    stage = _stage_payload(response.json(), data["open_stage"].id)
    assert len(stage["deliverables"]) == 3

    checklist = await client.get(
        f"{API}/deals/{data['priya_deal'].id}/checklist", headers=as_priya
    )
    current = next(
        s for s in checklist.json()["stages"] if s["stageId"] == str(data["open_stage"].id)
    )
    assert current["totalCount"] == 3
    assert current["completeCount"] == 1


async def test_removing_a_deliverable_removes_its_completion(
    client: AsyncClient, as_priya, as_admin, session, data
):
    """Cascade, not orphan. A completion referencing a deleted deliverable has no meaning."""
    first_id = data["first_deliverable"].id
    await _tick(client, as_priya, data, first_id)

    response = await client.patch(
        f"{API}/pipelines/{data['pipeline'].id}/stages/{data['open_stage'].id}",
        headers=as_admin,
        json={"deliverables": [{"id": str(data["second_deliverable"].id), "text": "Budget confirmed"}]},
    )
    assert response.status_code == 200

    orphans = await session.execute(
        select(func.count()).select_from(DealDeliverableCompletion).where(
            DealDeliverableCompletion.stage_deliverable_id == first_id
        )
    )
    assert orphans.scalar_one() == 0


async def test_omitting_deliverables_leaves_them_untouched(
    client: AsyncClient, as_admin, session, data
):
    """
    An unrelated edit must not wipe the checklist. Reading a missing key as an empty list is
    the bug this guards.
    """
    response = await client.patch(
        f"{API}/pipelines/{data['pipeline'].id}/stages/{data['open_stage'].id}",
        headers=as_admin,
        json={"probability": 25},
    )
    assert response.status_code == 200

    stage = _stage_payload(response.json(), data["open_stage"].id)
    assert stage["probability"] == 25
    assert len(stage["deliverables"]) == 2


async def test_sending_an_empty_list_does_clear_them(client: AsyncClient, as_admin, data):
    """The counterpart: an explicit empty list is an instruction, not an omission."""
    response = await client.patch(
        f"{API}/pipelines/{data['pipeline'].id}/stages/{data['open_stage'].id}",
        headers=as_admin,
        json={"deliverables": []},
    )
    assert response.status_code == 200
    assert _stage_payload(response.json(), data["open_stage"].id)["deliverables"] == []


async def test_duplicating_a_pipeline_creates_fresh_deliverable_rows(
    client: AsyncClient, as_admin, session, data
):
    """
    Sharing rows would mean a deal on the copy ticking a box on the original's checklist.
    """
    response = await client.post(
        f"{API}/pipelines/{data['pipeline'].id}/duplicate",
        headers=as_admin,
        json={"name": "Direct (copy)"},
    )
    assert response.status_code == 201

    copied = response.json()["stages"]
    qualify = next(stage for stage in copied if stage["name"] == "Qualify")
    copied_ids = {d["id"] for d in qualify["deliverables"]}

    assert len(copied_ids) == 2
    assert str(data["first_deliverable"].id) not in copied_ids
    assert [d["text"] for d in qualify["deliverables"]] == [
        "Discovery call held",
        "Budget confirmed",
    ]

    total = await session.execute(select(func.count()).select_from(StageDeliverable))
    assert total.scalar_one() == 4  # two originals plus two copies


async def test_a_rep_cannot_edit_deliverables(client: AsyncClient, as_priya, data):
    """Pipeline editing is admin-only (spec 6.3), and the checklist is part of the pipeline."""
    response = await client.patch(
        f"{API}/pipelines/{data['pipeline'].id}/stages/{data['open_stage'].id}",
        headers=as_priya,
        json={"deliverables": [{"text": "Sneaky"}]},
    )
    assert response.status_code == 403
