"""
The champion gate: a stage that will not accept a deal without an identified, reachable champion.

The only place in this application where a stage move is refused for a reason other than permissions,
so these tests care as much about *which* refusal is reported as about whether one is. "Identify a
champion" and "your champion has no phone number" send somebody to two different places, and a gate
that cannot tell them apart is a gate people learn to route around.

`requires_champion` is switched on inside each test rather than in the fixture, because the shared
`second_stage` is what the auto-advance tests move deals into — gating it there would make those tests
fail for a reason that has nothing to do with what they assert.
"""

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.models import Contact, ContactRole, DealContact
from tests.conftest import deal_payload

API = settings.api_v1_prefix

pytestmark = pytest.mark.asyncio


async def _gate(session, stage, *, on: bool = True) -> None:
    stage.requires_champion = on
    session.add(stage)
    await session.commit()


async def _assign(session, deal, contact, role) -> DealContact:
    link = DealContact(deal_id=deal.id, contact_id=contact.id, role_id=role.id)
    session.add(link)
    await session.commit()
    return link


# --- The gate itself ---------------------------------------------------------


async def test_an_ungated_stage_accepts_a_deal_with_no_champion(
    client: AsyncClient, as_priya, data
):
    """The default. Most stages do not gate, and the check must cost nothing when it does not apply."""
    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )
    assert response.status_code == 200


async def test_a_gated_stage_refuses_a_deal_with_no_champion(
    client: AsyncClient, as_priya, session, data
):
    # Read before gating. `_gate` commits, which expires every loaded instance, and touching an
    # expired attribute afterwards triggers a lazy refresh from sync context — a greenlet error, not an
    # assertion failure, which is a confusing way for a test to break.
    stage_name = data["second_stage"].name
    await _gate(session, data["second_stage"])

    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )

    # 409, not 403: the caller has permission, the deal is not ready.
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert "champion" in detail.lower()
    assert stage_name in detail


async def test_the_refusal_says_what_is_missing_when_a_champion_exists(
    client: AsyncClient, as_priya, session, data
):
    """
    A champion who cannot be reached is a different problem from no champion, and the message has to
    say which. Naming the missing fields is the whole value: "add a champion" to somebody who already
    added one reads as a bug.
    """
    await _assign(session, data["priya_deal"], data["incomplete_contact"], data["champion_role"])
    await _gate(session, data["second_stage"])

    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert "Reachless Rita" in detail
    # She has an email but no phone and no LinkedIn.
    assert "phone" in detail
    assert "LinkedIn" in detail
    assert "email" not in detail


async def test_a_complete_champion_passes_the_gate(client: AsyncClient, as_priya, session, data):
    await _assign(session, data["priya_deal"], data["complete_contact"], data["champion_role"])
    await _gate(session, data["second_stage"])

    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )
    assert response.status_code == 200
    assert response.json()["stageId"] == str(data["second_stage"].id)


async def test_one_complete_champion_is_enough(client: AsyncClient, as_priya, session, data):
    """
    The requirement is that somebody on the inside is identified and reachable, not that every named
    champion is. A deal with two champions, one of them half-filled-in, is not blocked by the half.
    """
    await _assign(session, data["priya_deal"], data["incomplete_contact"], data["champion_role"])
    await _assign(session, data["priya_deal"], data["complete_contact"], data["champion_role"])
    await _gate(session, data["second_stage"])

    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )
    assert response.status_code == 200


async def test_a_non_champion_role_does_not_satisfy_the_gate(
    client: AsyncClient, as_priya, session, data
):
    """The fixture already puts a complete contact on this deal as Executive Sponsor. That is not a champion."""
    await _gate(session, data["second_stage"])

    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )
    assert response.status_code == 409


async def test_renaming_the_champion_role_does_not_disable_the_gate(
    client: AsyncClient, as_admin, as_priya, session, data
):
    """
    The reason `ContactRole` has a `key` at all.

    An admin renaming "Champion" to "Advocate" is a labelling choice. If the gate matched on the display
    name it would silently stop enforcing, and nobody would find out until a deal reached a stage it
    should not have.
    """
    await _gate(session, data["second_stage"])

    renamed = await client.patch(
        f"{API}/contacts/roles/{data['champion_role'].id}",
        headers=as_admin,
        json={"name": "Advocate"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["key"] == ContactRole.CHAMPION

    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )
    assert response.status_code == 409


# --- Both routes to a stage change ------------------------------------------


async def test_the_gate_also_covers_a_stage_change_through_patch(
    client: AsyncClient, as_priya, session, data
):
    """
    A gate on `POST /stage` alone would be no gate: `PATCH /deals/{id}` accepts `stageId` too, and the
    board is not the only way a deal moves.
    """
    await _gate(session, data["second_stage"])

    response = await client.patch(
        f"{API}/deals/{data['priya_deal'].id}",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )
    assert response.status_code == 409


async def test_a_refused_patch_does_not_apply_its_other_fields(
    client: AsyncClient, as_priya, session, data
):
    """
    The rollback that is easy to get wrong.

    `PATCH` assigns the non-stage fields before it attempts the move, so a refused move must not leave a
    renamed deal behind — a request that reports failure and half-succeeded is worse than either outcome.
    """
    # The id and name are both captured up front, and every later reference uses the local copies.
    #
    # Not fussiness. The test session and the request session are the same object, so the
    # `await db.rollback()` this test exists to verify *also expires the test's own instances* — after
    # which even reading `data["priya_deal"].id` triggers a lazy refresh from sync context and dies with
    # MissingGreenlet. The failure was evidence the rollback had run, disguised as a broken test.
    deal_id = data["priya_deal"].id
    before = await client.get(f"{API}/deals/{deal_id}", headers=as_priya)
    original = before.json()["name"]
    gated_stage_id = data["second_stage"].id

    await _gate(session, data["second_stage"])

    response = await client.patch(
        f"{API}/deals/{deal_id}",
        headers=as_priya,
        json={"name": "Renamed Behind Your Back", "stageId": str(gated_stage_id)},
    )
    assert response.status_code == 409

    after = await client.get(f"{API}/deals/{deal_id}", headers=as_priya)
    assert after.json()["name"] == original


async def test_moving_backwards_is_never_gated(client: AsyncClient, as_priya, session, data):
    """
    Only entering a gated stage is checked, so a deal can always retreat.

    A deal whose champion has left the company needs to be able to go back and be re-qualified. Gating
    the exit as well would trap it where it is.
    """
    await _assign(session, data["priya_deal"], data["complete_contact"], data["champion_role"])
    await _gate(session, data["second_stage"])

    forward = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )
    assert forward.status_code == 200

    # The champion is removed while the deal sits in the gated stage.
    await session.execute(
        DealContact.__table__.delete().where(DealContact.deal_id == data["priya_deal"].id)
    )
    await session.commit()

    back = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["open_stage"].id)},
    )
    assert back.status_code == 200


async def test_a_closed_stage_is_not_gated_by_default(client: AsyncClient, as_priya, data):
    """
    Marking a deal lost must never require a champion.

    A gate there would trap dead deals in the pipeline and inflate every open-value figure on the
    dashboard — the gate would corrupt the reporting it exists to protect. The migration seeds closed
    stages ungated; this is the assertion that keeps it that way.
    """
    assert data["won_stage"].requires_champion is False

    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["won_stage"].id)},
    )
    assert response.status_code == 200


# --- Deal creation -----------------------------------------------------------


async def test_creating_a_deal_attaches_its_contacts(client: AsyncClient, as_priya, data):
    created = await client.post(
        f"{API}/deals",
        headers=as_priya,
        json=deal_payload(data, name="With People"),
    )
    assert created.status_code == 201

    people = await client.get(f"{API}/deals/{created.json()['id']}/contacts", headers=as_priya)
    assert [entry["fullName"] for entry in people.json()] == ["Priya Contact"]
    assert people.json()[0]["roleKey"] == "executive-sponsor"


async def test_a_contact_from_an_unrelated_company_is_refused(
    client: AsyncClient, as_priya, session, data
):
    """
    A contact at a company that is neither the customer nor the partner is either a mistake or a leak of
    who else we are talking to. Neither is worth storing.
    """
    outsider = Contact(
        account_id=data["marcus_only"].id,
        full_name="Outside Olive",
        email="olive@marcusonly.example",
        contact_type="customer",
    )
    session.add(outsider)
    await session.commit()

    payload = deal_payload(data, name="Wrong Company") | {
        "contacts": [
            {"contactId": str(outsider.id), "roleId": str(data["sponsor_role"].id)}
        ]
    }
    response = await client.post(f"{API}/deals", headers=as_priya, json=payload)

    assert response.status_code == 422
    assert "Marcus Only" in response.json()["detail"]


async def test_the_same_person_can_hold_two_roles(client: AsyncClient, as_priya, data):
    """
    A champion who is also the executive sponsor is a real arrangement, and the unique constraint is on
    (deal, contact, role) rather than (deal, contact) so that it can be recorded.
    """
    payload = deal_payload(data, name="Two Hats") | {
        "contacts": [
            {"contactId": str(data["complete_contact"].id), "roleId": str(data["sponsor_role"].id)},
            {"contactId": str(data["complete_contact"].id), "roleId": str(data["champion_role"].id)},
        ]
    }
    created = await client.post(f"{API}/deals", headers=as_priya, json=payload)
    assert created.status_code == 201

    people = await client.get(f"{API}/deals/{created.json()['id']}/contacts", headers=as_priya)
    assert {entry["roleKey"] for entry in people.json()} == {"champion", "executive-sponsor"}


async def test_duplicate_assignments_in_one_payload_are_collapsed(
    client: AsyncClient, as_priya, data
):
    """
    Sent twice, stored once. A form that lets somebody pick the same pairing twice has a UI problem, and
    a 422 in the middle of creating a deal is a poor way to report it.
    """
    entry = {
        "contactId": str(data["complete_contact"].id),
        "roleId": str(data["sponsor_role"].id),
    }
    created = await client.post(
        f"{API}/deals", headers=as_priya, json=deal_payload(data) | {"contacts": [entry, entry]}
    )
    assert created.status_code == 201

    people = await client.get(f"{API}/deals/{created.json()['id']}/contacts", headers=as_priya)
    assert len(people.json()) == 1


# --- Managing contacts on an existing deal ----------------------------------


async def test_adding_and_removing_a_contact_returns_the_whole_list(
    client: AsyncClient, as_priya, data
):
    added = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/contacts",
        headers=as_priya,
        json={
            "contactId": str(data["incomplete_contact"].id),
            "roleId": str(data["champion_role"].id),
        },
    )
    assert added.status_code == 201
    assert len(added.json()) == 2

    # Champion first: the list is ordered by role position, not by when the row was written.
    assert added.json()[0]["roleKey"] == "champion"

    link_id = next(e["id"] for e in added.json() if e["roleKey"] == "champion")
    removed = await client.delete(
        f"{API}/deals/{data['priya_deal'].id}/contacts/{link_id}", headers=as_priya
    )
    assert removed.status_code == 200
    assert [e["roleKey"] for e in removed.json()] == ["executive-sponsor"]


async def test_the_same_role_twice_is_refused(client: AsyncClient, as_priya, data):
    body = {
        "contactId": str(data["complete_contact"].id),
        "roleId": str(data["sponsor_role"].id),
    }
    # The fixture already assigned exactly this pairing.
    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/contacts", headers=as_priya, json=body
    )
    assert response.status_code == 409


async def test_a_rep_cannot_change_who_is_on_another_reps_deal(
    client: AsyncClient, as_priya, data
):
    response = await client.post(
        f"{API}/deals/{data['marcus_deal'].id}/contacts",
        headers=as_priya,
        json={
            "contactId": str(data["complete_contact"].id),
            "roleId": str(data["champion_role"].id),
        },
    )
    # 404, not 403: deals stay owner-scoped, and a 403 would confirm the deal exists.
    assert response.status_code == 404


async def test_removing_the_champion_from_a_gated_stage_is_allowed(
    client: AsyncClient, as_priya, session, data
):
    """
    The gate is on entering a stage, not on staying in one.

    A champion who has left the company has to be removable, or the CRM would be forced to keep saying
    something untrue in order to satisfy a rule about a move that already happened.
    """
    link = await _assign(
        session, data["priya_deal"], data["complete_contact"], data["champion_role"]
    )
    await _gate(session, data["second_stage"])

    moved = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["second_stage"].id)},
    )
    assert moved.status_code == 200

    removed = await client.delete(
        f"{API}/deals/{data['priya_deal'].id}/contacts/{link.id}", headers=as_priya
    )
    assert removed.status_code == 200
