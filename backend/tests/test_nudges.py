"""
Administrator nudges.

The email itself is stubbed — `notifications.get_notifier` is the seam, and what matters here is
the API's own guarantees: that only an admin can nudge, that only an at-risk deal can be nudged,
that the owner ends up with a reminder as well as an email, and that a nudge does not clear the
staleness it was raised about.

That last one is the reason this file exists. Everything else would be caught by reading the
code; a nudge silently marking a deal healthy would not.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.models import Activity, Deal
from app.models.enums import ActivityKind
from app.services import notifications, nudges

API = settings.api_v1_prefix
pytestmark = pytest.mark.asyncio


class FakeMail:
    """Records what would have been sent."""

    def __init__(self, accept: bool = True) -> None:
        self.sent: list[notifications.Notification] = []
        self.accept = accept

    async def send(self, notification: notifications.Notification) -> bool:
        self.sent.append(notification)
        return self.accept


@pytest.fixture
def mail(monkeypatch) -> FakeMail:
    fake = FakeMail()
    monkeypatch.setattr(notifications, "get_notifier", lambda: fake)
    monkeypatch.setattr(nudges, "get_notifier", lambda: fake)
    return fake


async def _make_at_risk(session, deal: Deal) -> None:
    """Push the close date into the past, which is the `overdue` route to at-risk."""
    deal.expected_close_date = (datetime.now(timezone.utc) - timedelta(days=5)).date()
    session.add(deal)
    await session.commit()


def _url(deal) -> str:
    return f"{API}/deals/{deal.id}/nudge"


# --- Permission ---------------------------------------------------------------


async def test_a_rep_cannot_nudge(client: AsyncClient, as_priya, data, session, mail):
    """Nudging is a management action. A rep chasing a colleague is not a peer activity."""
    await _make_at_risk(session, data["marcus_deal"])

    response = await client.post(_url(data["marcus_deal"]), headers=as_priya)
    assert response.status_code == 403
    assert mail.sent == []


async def test_an_admin_can_nudge_a_deal_they_do_not_own(
    client: AsyncClient, as_admin, data, session, mail
):
    await _make_at_risk(session, data["priya_deal"])

    response = await client.post(_url(data["priya_deal"]), headers=as_admin)
    assert response.status_code == 201
    assert response.json()["ownerName"] == "Priya Rep"


async def test_nudging_a_missing_deal_is_a_404(client: AsyncClient, as_admin, data, mail):
    response = await client.post(f"{API}/deals/{uuid.uuid4()}/nudge", headers=as_admin)
    assert response.status_code == 404


# --- State --------------------------------------------------------------------


async def test_a_healthy_deal_cannot_be_nudged(client: AsyncClient, as_admin, data, mail):
    """
    409 rather than 403: the caller has permission, the deal simply is not in a state where
    chasing anyone makes sense.
    """
    response = await client.post(_url(data["priya_deal"]), headers=as_admin)
    assert response.status_code == 409
    assert mail.sent == []


async def test_the_same_deal_cannot_be_nudged_twice_inside_the_cooldown(
    client: AsyncClient, as_admin, data, session, mail
):
    await _make_at_risk(session, data["priya_deal"])

    first = await client.post(_url(data["priya_deal"]), headers=as_admin)
    assert first.status_code == 201

    second = await client.post(_url(data["priya_deal"]), headers=as_admin)
    assert second.status_code == 409
    assert "already nudged" in second.json()["detail"]
    # One email, not two — an escalation repeated is noise the owner learns to filter.
    assert len(mail.sent) == 1


# --- What a nudge produces ----------------------------------------------------


async def test_a_nudge_emails_the_owner_and_names_the_reason(
    client: AsyncClient, as_admin, data, session, mail
):
    await _make_at_risk(session, data["priya_deal"])

    await client.post(_url(data["priya_deal"]), headers=as_admin)

    assert len(mail.sent) == 1
    sent = mail.sent[0]
    assert sent.to == data["priya"].email
    assert data["priya_deal"].name in sent.subject
    # The cause, not just "at risk" — an overdue deal needs a date, a stalled one needs a call.
    assert "close date passed" in sent.body


async def test_a_nudge_lands_in_the_owners_reminder_inbox(
    client: AsyncClient, as_admin, as_priya, data, session, mail
):
    """An email is read once. A reminder is owed until it is done."""
    await _make_at_risk(session, data["priya_deal"])

    await client.post(_url(data["priya_deal"]), headers=as_admin)

    inbox = await client.get(f"{API}/reminders/inbox", headers=as_priya)
    assert inbox.status_code == 200
    titles = [r["title"] for r in inbox.json()["overdue"] + inbox.json()["upcoming"]]
    assert any("act on" in title for title in titles), titles


async def test_the_owners_nudge_reminder_is_not_emailed_a_second_time(
    client: AsyncClient, as_admin, data, session, mail
):
    """
    The nudge already delivered the email. Leaving `notified_at` unset would have the background
    sweep send a near-identical second one minutes later.
    """
    await _make_at_risk(session, data["priya_deal"])
    await client.post(_url(data["priya_deal"]), headers=as_admin)

    from app.services import reminders as reminders_service

    due = await reminders_service.due_for_notification(session)
    assert due == []


async def test_a_nudge_is_recorded_on_the_deals_timeline(
    client: AsyncClient, as_admin, data, session, mail
):
    await _make_at_risk(session, data["priya_deal"])
    await client.post(_url(data["priya_deal"]), headers=as_admin)

    result = await session.execute(
        select(Activity).where(
            Activity.deal_id == data["priya_deal"].id, Activity.kind == ActivityKind.NUDGE
        )
    )
    activity = result.scalar_one()
    assert "Priya Rep" in activity.summary


# --- The one that matters -----------------------------------------------------


async def test_a_nudge_does_not_clear_the_staleness_it_was_raised_about(
    client: AsyncClient, as_admin, data, session, mail
):
    """
    The circular failure this guards against: an admin nudges a deal *because* nobody has
    touched it for three weeks. If the nudge counted as a touch, the at-risk flag would clear
    the instant it was raised, the deal would look healthy, and nothing would ask anyone to act
    on it again. The chase would erase its own cause.
    """
    deal = data["priya_deal"]
    # Stale rather than overdue, so the assertion is about touch and not the close date.
    deal.created_at = datetime.now(timezone.utc) - timedelta(days=60)
    deal.expected_close_date = (datetime.now(timezone.utc) + timedelta(days=30)).date()
    session.add(deal)
    await session.commit()

    before = await client.get(f"{API}/deals/{deal.id}", headers=as_admin)
    assert before.json()["health"] == "at-risk"

    nudged = await client.post(_url(deal), headers=as_admin)
    assert nudged.status_code == 201

    after = await client.get(f"{API}/deals/{deal.id}", headers=as_admin)
    assert after.json()["health"] == "at-risk", "the nudge cleared its own reason"
    assert after.json()["lastActivityAt"] == before.json()["lastActivityAt"]
