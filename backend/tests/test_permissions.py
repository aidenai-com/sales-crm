"""
Authorization.

Every test here is a rule someone could otherwise bypass by calling the API directly. The
UI hides these actions too, but that is convenience — this file is the boundary.
"""

import pytest
from httpx import AsyncClient

from app.core.config import settings
from tests.conftest import token_for

API = settings.api_v1_prefix
pytestmark = pytest.mark.asyncio


# --- Visibility --------------------------------------------------------------


async def test_rep_sees_only_their_own_deals(client: AsyncClient, as_priya, data):
    response = await client.get(f"{API}/deals", headers=as_priya)
    assert response.status_code == 200

    names = {d["name"] for d in response.json()}
    assert names == {"Priya Deal"}


async def test_admin_sees_every_deal(client: AsyncClient, as_admin):
    response = await client.get(f"{API}/deals", headers=as_admin)
    names = {d["name"] for d in response.json()}
    assert names == {"Priya Deal", "Marcus Deal", "Marcus Other"}


async def test_rep_sees_the_parent_account_of_a_deal_they_own(client: AsyncClient, as_priya):
    """
    Priya does not own Shared Bank — Marcus does — but she owns a deal under it. Without
    this the deal would have a parent she cannot resolve and the tree breaks.
    """
    response = await client.get(f"{API}/accounts", headers=as_priya)
    names = {a["name"] for a in response.json()}

    assert "Shared Bank" in names
    assert "Marcus Only" not in names


async def test_rep_sees_only_their_own_leads_even_inside_a_shared_account(
    client: AsyncClient, as_priya
):
    response = await client.get(f"{API}/leads", headers=as_priya)
    units = {lead["businessUnit"] for lead in response.json()}
    assert units == {"Priya Unit"}


async def test_account_tree_is_scoped(client: AsyncClient, as_priya):
    response = await client.get(f"{API}/accounts/tree", headers=as_priya)
    tree = response.json()

    assert [node["name"] for node in tree] == ["Shared Bank"]
    assert [lead["businessUnit"] for lead in tree[0]["leads"]] == ["Priya Unit"]
    assert {d["name"] for lead in tree[0]["leads"] for d in lead["deals"]} == {"Priya Deal"}


async def test_reading_another_reps_deal_is_404_not_403(client: AsyncClient, as_priya, data):
    # 403 would confirm the deal exists, which is itself information Priya lacks.
    response = await client.get(f"{API}/deals/{data['marcus_deal'].id}", headers=as_priya)
    assert response.status_code == 404


async def test_reading_an_invisible_account_is_404(client: AsyncClient, as_priya, data):
    response = await client.get(f"{API}/accounts/{data['marcus_only'].id}", headers=as_priya)
    assert response.status_code == 404


async def test_dashboard_is_scoped_to_the_caller(client: AsyncClient, as_priya, as_admin):
    mine = (await client.get(f"{API}/dashboard/summary", headers=as_priya)).json()
    theirs = (await client.get(f"{API}/dashboard/summary", headers=as_admin)).json()

    assert float(mine["metrics"]["openPipelineValue"]) == 100_000
    # Two open deals company-wide; the won one does not count.
    assert float(theirs["metrics"]["openPipelineValue"]) == 200_000


# --- Moving deals ------------------------------------------------------------


async def test_rep_can_move_their_own_deal(client: AsyncClient, as_priya, data):
    response = await client.post(
        f"{API}/deals/{data['priya_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["won_stage"].id)},
    )
    assert response.status_code == 200
    assert response.json()["stageName"] == "Won"


async def test_rep_cannot_move_another_reps_deal(client: AsyncClient, as_priya, data):
    response = await client.post(
        f"{API}/deals/{data['marcus_deal'].id}/stage",
        headers=as_priya,
        json={"stageId": str(data["won_stage"].id)},
    )
    assert response.status_code == 404


async def test_admin_can_move_any_deal(client: AsyncClient, as_admin, data):
    response = await client.post(
        f"{API}/deals/{data['marcus_deal'].id}/stage",
        headers=as_admin,
        json={"stageId": str(data["won_stage"].id)},
    )
    assert response.status_code == 200


# --- Reassignment: the hole that would undo the model ------------------------


async def test_rep_cannot_take_ownership_of_a_deal_they_own(client: AsyncClient, as_priya, data):
    """Even on their own deal, a rep cannot hand it to someone else."""
    response = await client.patch(
        f"{API}/deals/{data['priya_deal'].id}",
        headers=as_priya,
        json={"ownerId": str(data["marcus"].id)},
    )
    assert response.status_code == 403
    assert "administrator" in response.json()["detail"].lower()


async def test_rep_cannot_create_a_deal_owned_by_someone_else(client: AsyncClient, as_priya, data):
    # Otherwise "reps cannot reassign" is bypassed at creation time.
    response = await client.post(
        f"{API}/deals",
        headers=as_priya,
        json={
            "name": "Sneaky", "accountId": str(data["shared"].id), "leadId": None,
            "partnerId": None, "pipelineTemplateId": str(data["pipeline"].id),
            "stageId": str(data["open_stage"].id), "value": "1000",
            "expectedCloseDate": "2027-01-01", "ownerId": str(data["marcus"].id),
        },
    )
    assert response.status_code == 403


async def test_admin_can_reassign(client: AsyncClient, as_admin, data):
    response = await client.patch(
        f"{API}/deals/{data['priya_deal'].id}",
        headers=as_admin,
        json={"ownerId": str(data["marcus"].id)},
    )
    assert response.status_code == 200
    assert response.json()["ownerId"] == str(data["marcus"].id)


# --- Creation rights ---------------------------------------------------------


async def test_rep_cannot_create_an_account(client: AsyncClient, as_priya, data):
    response = await client.post(
        f"{API}/accounts",
        headers=as_priya,
        json={"name": "New Co", "industry": "Tech", "isPartner": False,
              "ownerId": str(data["priya"].id)},
    )
    assert response.status_code == 403


async def test_admin_can_create_an_account(client: AsyncClient, as_admin, data):
    response = await client.post(
        f"{API}/accounts",
        headers=as_admin,
        json={"name": "New Co", "industry": "Tech", "isPartner": False,
              "ownerId": str(data["priya"].id)},
    )
    assert response.status_code == 201


async def test_rep_can_create_a_lead_and_a_deal_they_own(client: AsyncClient, as_priya, data):
    lead = await client.post(
        f"{API}/leads",
        headers=as_priya,
        json={"accountId": str(data["shared"].id), "businessUnit": "New Unit",
              "ownerId": str(data["priya"].id)},
    )
    assert lead.status_code == 201

    deal = await client.post(
        f"{API}/deals",
        headers=as_priya,
        json={
            "name": "My Deal", "accountId": str(data["shared"].id),
            "leadId": lead.json()["id"], "partnerId": None,
            "pipelineTemplateId": str(data["pipeline"].id),
            "stageId": str(data["open_stage"].id), "value": "5000",
            "expectedCloseDate": "2027-01-01", "ownerId": str(data["priya"].id),
        },
    )
    assert deal.status_code == 201


# --- Pipelines are admin-only ------------------------------------------------


async def test_rep_can_read_pipelines_but_not_change_them(client: AsyncClient, as_priya, data):
    # Reps need the stage list to render a board, so reading stays open.
    assert (await client.get(f"{API}/pipelines", headers=as_priya)).status_code == 200

    assert (
        await client.post(
            f"{API}/pipelines", headers=as_priya, json={"name": "Mine", "tracksPartner": False}
        )
    ).status_code == 403

    assert (
        await client.post(
            f"{API}/pipelines/{data['pipeline'].id}/stages",
            headers=as_priya,
            json={"name": "Sneaky stage"},
        )
    ).status_code == 403


# --- Team overview -----------------------------------------------------------


async def test_team_overview_is_admin_only(client: AsyncClient, as_priya):
    assert (await client.get(f"{API}/team/overview", headers=as_priya)).status_code == 403


async def test_team_overview_covers_every_rep_including_empty_ones(
    client: AsyncClient, as_admin
):
    response = await client.get(f"{API}/team/overview", headers=as_admin)
    assert response.status_code == 200

    body = response.json()
    names = {r["name"] for r in body["reps"]}
    # Ada owns nothing; an empty pipeline is the most important thing this table shows,
    # so the row must still be present.
    assert names == {"Ada Admin", "Priya Rep", "Marcus Rep"}

    marcus = next(r for r in body["reps"] if r["name"] == "Marcus Rep")
    assert marcus["openCount"] == 1
    assert marcus["wonCount"] == 1


# --- User administration -----------------------------------------------------


def _new_user(email: str = "new.rep@example.com", role: str = "rep") -> dict:
    return {
        "email": email,
        "fullName": "New Rep",
        "initials": "NR",
        "jobTitle": "Enterprise AE",
        "role": role,
        "password": "startpw12345",
    }


async def test_rep_cannot_create_a_user(client: AsyncClient, as_priya):
    assert (await client.post(f"{API}/auth/users", headers=as_priya, json=_new_user())).status_code == 403


async def test_rep_cannot_promote_anyone_by_creating_an_admin(client: AsyncClient, as_priya):
    # The obvious escalation: if reps could create users, they could create an admin.
    response = await client.post(f"{API}/auth/users", headers=as_priya, json=_new_user(role="admin"))
    assert response.status_code == 403


async def test_admin_creates_a_user_who_can_then_sign_in(client: AsyncClient, as_admin):
    created = await client.post(f"{API}/auth/users", headers=as_admin, json=_new_user())
    assert created.status_code == 201

    body = created.json()
    assert body["role"] == "rep"
    assert body["isActive"] is True
    # The hash must never be serialised, whatever else changes on the schema.
    assert "password" not in body and "passwordHash" not in body

    signin = await client.post(
        f"{API}/auth/login",
        data={"username": "new.rep@example.com", "password": "startpw12345"},
    )
    assert signin.status_code == 200


async def test_a_new_rep_starts_with_an_empty_scope(client: AsyncClient, as_admin):
    await client.post(f"{API}/auth/users", headers=as_admin, json=_new_user())
    token = await token_for(client, "new.rep@example.com", "startpw12345")
    headers = {"Authorization": f"Bearer {token}"}

    # Owning nothing means seeing nothing — the scoping rule with no special-casing.
    assert (await client.get(f"{API}/deals", headers=headers)).json() == []
    assert (await client.get(f"{API}/accounts", headers=headers)).json() == []


async def test_duplicate_email_is_rejected(client: AsyncClient, as_admin):
    assert (
        await client.post(f"{API}/auth/users", headers=as_admin, json=_new_user("priya@example.com"))
    ).status_code == 409


async def test_short_passwords_are_rejected(client: AsyncClient, as_admin):
    payload = _new_user() | {"password": "short"}
    assert (await client.post(f"{API}/auth/users", headers=as_admin, json=payload)).status_code == 422


async def test_everyone_can_read_the_user_list(client: AsyncClient, as_priya):
    # Owner dropdowns on deals and leads need it; only *creating* users is restricted.
    response = await client.get(f"{API}/auth/users", headers=as_priya)
    assert response.status_code == 200
    assert len(response.json()) == 3


# --- Unauthenticated ---------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    ["/deals", "/accounts", "/leads", "/activities", "/pipelines",
     "/dashboard/summary", "/team/overview", "/accounts/tree"],
)
async def test_every_endpoint_requires_a_token(client: AsyncClient, path: str):
    assert (await client.get(f"{API}{path}")).status_code == 401
