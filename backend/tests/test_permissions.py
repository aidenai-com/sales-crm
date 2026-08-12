"""
Authorization.

Every test here is a rule someone could otherwise bypass by calling the API directly. The
UI hides these actions too, but that is convenience — this file is the boundary.
"""

import pytest
from httpx import AsyncClient

from app.core.config import settings
from tests.conftest import deal_payload, token_for

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


async def test_rep_sees_every_account(client: AsyncClient, as_priya):
    """
    Accounts are company-wide.

    Priya owns neither Shared Bank nor Marcus Only, and sees both. This inverts what this test used to
    assert — that she saw only accounts her own work hung off — and the reason for the change is
    duplicate prevention: a rep who cannot see another rep's Citibank is the rep who creates a second
    Citibank.
    """
    response = await client.get(f"{API}/accounts", headers=as_priya)
    names = {a["name"] for a in response.json()}

    assert "Shared Bank" in names
    assert "Marcus Only" in names


async def test_rep_sees_every_business_unit(client: AsyncClient, as_priya):
    """
    Business units follow their accounts, so they are company-wide too.

    Not an independent decision: they no longer carry an owner to scope by, and their accounts are
    visible to everyone. "Priya Unit" and "Marcus Unit" are names left over from when this mattered.
    """
    response = await client.get(f"{API}/leads", headers=as_priya)
    units = {lead["businessUnit"] for lead in response.json()}
    assert units == {"Priya Unit", "Marcus Unit"}


async def test_account_tree_shows_every_account_but_only_your_own_deals(
    client: AsyncClient, as_priya
):
    """
    The line that still holds: structure is shared, deals are not.

    Priya sees both accounts and both business units, and inside them only Priya Deal. This is the
    single most important assertion in the suite after the change — it is what stops "accounts are
    visible to everyone" from quietly becoming "everything is".
    """
    response = await client.get(f"{API}/accounts/tree", headers=as_priya)
    tree = response.json()

    assert [node["name"] for node in tree] == ["Marcus Only", "Shared Bank"]

    shared = next(node for node in tree if node["name"] == "Shared Bank")
    assert {lead["businessUnit"] for lead in shared["leads"]} == {"Priya Unit", "Marcus Unit"}

    every_deal = {
        deal["name"]
        for node in tree
        for lead in node["leads"]
        for deal in lead["deals"]
    } | {deal["name"] for node in tree for deal in node["directDeals"]}
    assert every_deal == {"Priya Deal"}


async def test_reading_another_reps_deal_is_404_not_403(client: AsyncClient, as_priya, data):
    # 403 would confirm the deal exists, which is itself information Priya lacks.
    response = await client.get(f"{API}/deals/{data['marcus_deal'].id}", headers=as_priya)
    assert response.status_code == 404


async def test_reading_someone_elses_account_succeeds(client: AsyncClient, as_priya, data):
    """
    Was a 404. Every account is readable now, so hiding one would be inventing a rule the list
    endpoint does not follow — and a record you can see in a list but not open is a bug, not a policy.
    """
    response = await client.get(f"{API}/accounts/{data['marcus_only'].id}", headers=as_priya)
    assert response.status_code == 200
    assert response.json()["name"] == "Marcus Only"


async def test_rep_still_cannot_edit_an_account_they_do_not_own(
    client: AsyncClient, as_priya, data
):
    """Reads opened up; writes did not. This is the pair that makes "see everything, change your own" true."""
    response = await client.patch(
        f"{API}/accounts/{data['marcus_only'].id}",
        headers=as_priya,
        json={"industry": "Rewritten"},
    )
    assert response.status_code == 403


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
        json=deal_payload(data, name="Sneaky", owner=data["marcus"]),
    )
    assert response.status_code == 403


async def test_the_api_accepts_a_deal_with_no_contacts(client: AsyncClient, as_priya, data):
    """
    Contacts are required by the create form, not by this endpoint.

    Two reasons the schema does not enforce it. A `min_length=1` would make Pydantic reject the payload
    *before* the ownership check ran, turning the 403 above into a 422 — a permission error reported as a
    validation error. And it would break every existing caller with no compatibility window.

    So this documents a deliberate gap rather than an oversight: the rule lives in `CreateDealForm`, which
    disables its submit button, and in `store.createDeal`, which refuses the call. A script or an
    integration can still create a contactless deal, and nothing here will stop it.
    """
    payload = deal_payload(data, name="Nobody") | {"contacts": []}
    response = await client.post(f"{API}/deals", headers=as_priya, json=payload)
    assert response.status_code == 201

    people = await client.get(f"{API}/deals/{response.json()['id']}/contacts", headers=as_priya)
    assert people.json() == []


async def test_admin_can_reassign(client: AsyncClient, as_admin, data):
    response = await client.patch(
        f"{API}/deals/{data['priya_deal'].id}",
        headers=as_admin,
        json={"ownerId": str(data["marcus"].id)},
    )
    assert response.status_code == 200
    assert response.json()["ownerId"] == str(data["marcus"].id)


# --- Creation rights ---------------------------------------------------------


async def test_rep_can_create_an_account_they_own(client: AsyncClient, as_priya, data):
    """Any authorized user may file a company. Was admin-only."""
    response = await client.post(
        f"{API}/accounts",
        headers=as_priya,
        json={"name": "New Co", "industry": "Tech", "ownerId": str(data["priya"].id)},
    )
    assert response.status_code == 201


async def test_the_creator_becomes_the_owner(client: AsyncClient, as_priya, data):
    """
    `ownerId` may be omitted, and then it is the caller.

    Filing a company is almost always done by the person who will work it, so the form no longer asks.
    An administrator can hand it over afterwards.
    """
    response = await client.post(
        f"{API}/accounts", headers=as_priya, json={"name": "Mine By Default", "industry": "Tech"}
    )
    assert response.status_code == 201
    assert response.json()["ownerId"] == str(data["priya"].id)


async def test_the_removed_partner_flag_is_rejected_not_ignored(
    client: AsyncClient, as_priya
):
    """
    `PayloadModel` sets `extra="forbid"`, so a client still sending `isPartner` gets a 422 rather than
    having it silently dropped. Recorded because it is a breaking change for any caller outside this
    app — and because loud is the behaviour worth keeping.
    """
    response = await client.post(
        f"{API}/accounts",
        headers=as_priya,
        json={"name": "Old Client", "industry": "Tech", "isPartner": True},
    )
    assert response.status_code == 422


async def test_rep_cannot_create_an_account_owned_by_someone_else(
    client: AsyncClient, as_priya, data
):
    """The guard that replaced admin-only: create freely, but assigned to yourself."""
    response = await client.post(
        f"{API}/accounts",
        headers=as_priya,
        json={"name": "Not Mine", "industry": "Tech", "ownerId": str(data["marcus"].id)},
    )
    assert response.status_code == 403


async def test_admin_can_create_an_account(client: AsyncClient, as_admin, data):
    response = await client.post(
        f"{API}/accounts",
        headers=as_admin,
        json={"name": "New Co", "industry": "Tech", "ownerId": str(data["priya"].id)},
    )
    assert response.status_code == 201


async def test_rep_can_create_a_lead_and_a_deal_they_own(client: AsyncClient, as_priya, data):
    lead = await client.post(
        f"{API}/leads",
        headers=as_priya,
        # No `ownerId`: a business unit has no owner. Sent, it would be ignored rather than rejected,
        # so its absence here is the assertion.
        json={"accountId": str(data["shared"].id), "businessUnit": "New Unit"},
    )
    assert lead.status_code == 201

    deal = await client.post(
        f"{API}/deals",
        headers=as_priya,
        json=deal_payload(data, name="My Deal") | {"leadId": lead.json()["id"]},
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


async def test_a_new_rep_starts_with_no_deals_but_the_whole_account_book(
    client: AsyncClient, as_admin
):
    """
    A rep who owns nothing sees no deals and every account.

    This test previously asserted an empty scope for both, and the split is the point of the change:
    somebody joining on their first morning can see who the company already sells to — which is what
    stops them filing a second Citibank — while the pipeline stays owned.
    """
    await client.post(f"{API}/auth/users", headers=as_admin, json=_new_user())
    token = await token_for(client, "new.rep@example.com", "startpw12345")
    headers = {"Authorization": f"Bearer {token}"}

    assert (await client.get(f"{API}/deals", headers=headers)).json() == []

    accounts = (await client.get(f"{API}/accounts", headers=headers)).json()
    assert {a["name"] for a in accounts} == {"Shared Bank", "Marcus Only"}


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
