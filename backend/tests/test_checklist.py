"""
Deliverable checklists and the automatic stage advance.

These cover the reversal of `spec.md` §6.4 introduced by feedback round 1: the checklist now
advances a deal, and every guard on that behaviour is asserted here rather than trusted.
"""

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.models import Stage, StageDeliverable, StageKind

API = settings.api_v1_prefix
pytestmark = pytest.mark.asyncio


def _checklist_stage(payload: dict, stage_id) -> dict:
    return next(stage for stage in payload["stages"] if stage["stageId"] == str(stage_id))


async def test_checklist_returns_every_stage_not_only_the_current_one(
    client: AsyncClient, as_priya, data
):
    """The requirement is to click across all statuses, so all of them must come back."""
    response = await client.get(
        f"{API}/deals/{data['priya_deal'].id}/checklist", headers=as_priya
    )
    assert response.status_code == 200

    body = response.json()
    returned = {stage["stageId"] for stage in body["stages"]}
    assert returned == {
        str(data["open_stage"].id),
        str(data["second_stage"].id),
        str(data["won_stage"].id),
    }
    assert body["currentStageId"] == str(data["open_stage"].id)

    current = _checklist_stage(body, data["open_stage"].id)
    assert current["isCurrentStage"] is True
    assert current["totalCount"] == 2
    assert current["completeCount"] == 0


async def test_ticking_one_of_two_does_not_advance(client: AsyncClient, as_priya, data):
    """A half-finished checklist must leave the deal exactly where it was."""
    response = await client.put(
        f"{API}/deals/{data['priya_deal'].id}"
        f"/deliverables/{data['first_deliverable'].id}/completion",
        headers=as_priya,
    )
    assert response.status_code == 200

    body = response.json()
    assert body["advancedToStageId"] is None
    assert body["checklist"]["currentStageId"] == str(data["open_stage"].id)

    current = _checklist_stage(body["checklist"], data["open_stage"].id)
    assert current["completeCount"] == 1
    assert current["deliverables"][0]["complete"] is True
    assert current["deliverables"][0]["completedByName"] == "Priya Rep"


async def test_ticking_the_last_one_advances_and_logs(client: AsyncClient, as_priya, data):
    deal_id = data["priya_deal"].id
    for deliverable in (data["first_deliverable"], data["second_deliverable"]):
        response = await client.put(
            f"{API}/deals/{deal_id}/deliverables/{deliverable.id}/completion", headers=as_priya
        )
        assert response.status_code == 200

    body = response.json()
    assert body["advancedToStageId"] == str(data["second_stage"].id)
    assert body["advancedToStageName"] == "Propose"
    assert body["advancedFromStageId"] == str(data["open_stage"].id)
    assert body["checklist"]["currentStageId"] == str(data["second_stage"].id)

    # The move is recorded like any other stage change, so the activity feed and the
    # last-touch health signal both see it.
    activities = await client.get(
        f"{API}/activities", headers=as_priya, params={"subjectType": "deal", "subjectId": str(deal_id)}
    )
    assert activities.status_code == 200
    stage_changes = [a for a in activities.json() if a["kind"] == "stage-change"]
    assert len(stage_changes) == 1
    assert "Propose" in stage_changes[0]["summary"]


async def test_ticking_twice_is_idempotent(client: AsyncClient, as_priya, data):
    """A double-clicked checkbox is not an error worth showing anybody."""
    url = (
        f"{API}/deals/{data['priya_deal'].id}"
        f"/deliverables/{data['first_deliverable'].id}/completion"
    )
    first = await client.put(url, headers=as_priya)
    second = await client.put(url, headers=as_priya)

    assert first.status_code == 200
    assert second.status_code == 200
    current = _checklist_stage(second.json()["checklist"], data["open_stage"].id)
    assert current["completeCount"] == 1


async def test_unticking_does_not_move_the_deal_back(client: AsyncClient, as_priya, data):
    """
    One mis-click must not rewrite pipeline history. The deal stays where the advance put it
    and the rep moves it manually if that is really what they meant.
    """
    deal_id = data["priya_deal"].id
    for deliverable in (data["first_deliverable"], data["second_deliverable"]):
        await client.put(
            f"{API}/deals/{deal_id}/deliverables/{deliverable.id}/completion", headers=as_priya
        )

    # The deal now sits in Propose, so the tick is no longer on its current stage.
    response = await client.delete(
        f"{API}/deals/{deal_id}/deliverables/{data['first_deliverable'].id}/completion",
        headers=as_priya,
    )
    assert response.status_code == 409

    deal = await client.get(f"{API}/deals/{deal_id}", headers=as_priya)
    assert deal.json()["stageId"] == str(data["second_stage"].id)


async def test_a_stage_with_no_deliverables_never_advances(
    client: AsyncClient, as_priya, session, data
):
    """An empty checklist is not a satisfied one."""
    deal = data["priya_deal"]
    deal.stage_id = data["second_stage"].id  # Propose defines no deliverables.
    await session.commit()

    checklist = await client.get(f"{API}/deals/{deal.id}/checklist", headers=as_priya)
    stage = _checklist_stage(checklist.json(), data["second_stage"].id)
    assert stage["totalCount"] == 0

    fresh = await client.get(f"{API}/deals/{deal.id}", headers=as_priya)
    assert fresh.json()["stageId"] == str(data["second_stage"].id)


async def test_never_advances_into_a_terminal_stage(
    client: AsyncClient, as_priya, session, data
):
    """
    Closing a deal won or lost is a judgement about the outcome, not the next step in a
    sequence. A completed checklist on the last open stage leaves the deal there.
    """
    deal = data["priya_deal"]
    deal.stage_id = data["second_stage"].id
    session.add_all(
        [
            StageDeliverable(stage_id=data["second_stage"].id, text="Contract signed", position=1),
        ]
    )
    await session.commit()

    checklist = await client.get(f"{API}/deals/{deal.id}/checklist", headers=as_priya)
    deliverable_id = _checklist_stage(checklist.json(), data["second_stage"].id)["deliverables"][0]["id"]

    response = await client.put(
        f"{API}/deals/{deal.id}/deliverables/{deliverable_id}/completion", headers=as_priya
    )
    assert response.status_code == 200
    assert response.json()["advancedToStageId"] is None
    assert response.json()["checklist"]["currentStageId"] == str(data["second_stage"].id)


async def test_cannot_tick_a_deliverable_on_a_stage_the_deal_is_not_in(
    client: AsyncClient, as_priya, session, data
):
    """
    Ticking a box on a stage the deal has already left has no defensible meaning, and would
    make the advance rule ambiguous.
    """
    deal = data["priya_deal"]
    deal.stage_id = data["second_stage"].id
    await session.commit()

    response = await client.put(
        f"{API}/deals/{deal.id}/deliverables/{data['first_deliverable'].id}/completion",
        headers=as_priya,
    )
    assert response.status_code == 409


async def test_a_rep_cannot_touch_another_reps_checklist(client: AsyncClient, as_priya, data):
    """Reported as missing, not forbidden — a 403 would confirm the deal id is real."""
    response = await client.put(
        f"{API}/deals/{data['marcus_deal'].id}"
        f"/deliverables/{data['first_deliverable'].id}/completion",
        headers=as_priya,
    )
    assert response.status_code == 404


async def test_a_deliverable_from_another_pipeline_is_rejected(
    client: AsyncClient, as_priya, session, data
):
    from app.models import PipelineTemplate

    other = PipelineTemplate(name="Partner")
    session.add(other)
    await session.flush()
    other_stage = Stage(
        pipeline_template_id=other.id, name="Onboard", short_name="Onboard",
        probability=20, color="#4a90e2", kind=StageKind.OPEN, position=1,
    )
    session.add(other_stage)
    await session.flush()
    foreign = StageDeliverable(stage_id=other_stage.id, text="Signed MSA", position=1)
    session.add(foreign)
    await session.commit()

    response = await client.put(
        f"{API}/deals/{data['priya_deal'].id}/deliverables/{foreign.id}/completion",
        headers=as_priya,
    )
    assert response.status_code == 422


async def test_admin_sees_a_reps_checklist(client: AsyncClient, as_admin, data):
    response = await client.get(
        f"{API}/deals/{data['priya_deal'].id}/checklist", headers=as_admin
    )
    assert response.status_code == 200
