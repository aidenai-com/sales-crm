"""
Reminders: explicit rows, derived stale-lead nudges, and the notification sweep.
"""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.models import Activity, ActivityKind, Reminder
from app.services import notifications, reminders as reminders_service

API = settings.api_v1_prefix
pytestmark = pytest.mark.asyncio


class RecordingNotifier:
    """Captures what would have been sent, so delivery is assertable without a mail server."""

    def __init__(self, succeed: bool = True) -> None:
        self.sent: list[notifications.Notification] = []
        self.succeed = succeed

    async def send(self, notification: notifications.Notification) -> bool:
        self.sent.append(notification)
        return self.succeed


class ExplodingNotifier:
    def __init__(self) -> None:
        self.attempts = 0

    async def send(self, notification: notifications.Notification) -> bool:
        self.attempts += 1
        raise RuntimeError("mail server on fire")


# --- Explicit reminders -------------------------------------------------------


async def test_create_and_list_a_reminder(client: AsyncClient, as_priya, data):
    due = datetime.now(timezone.utc) + timedelta(days=2)
    response = await client.post(
        f"{API}/reminders",
        headers=as_priya,
        json={
            "subjectType": "deal",
            "subjectId": str(data["priya_deal"].id),
            "title": "Chase the signed order form",
            "dueAt": due.isoformat(),
        },
    )
    assert response.status_code == 201

    body = response.json()
    assert body["subjectLabel"] == "Priya Deal"
    assert body["assigneeName"] == "Priya Rep"
    assert body["overdue"] is False

    listed = await client.get(f"{API}/reminders", headers=as_priya)
    assert [item["id"] for item in listed.json()] == [body["id"]]


async def test_a_rep_cannot_schedule_against_another_reps_deal(client: AsyncClient, as_priya, data):
    response = await client.post(
        f"{API}/reminders",
        headers=as_priya,
        json={
            "subjectType": "deal",
            "subjectId": str(data["marcus_deal"].id),
            "title": "Snoop",
            "dueAt": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert response.status_code == 404


async def test_a_rep_cannot_assign_a_reminder_to_someone_else(client: AsyncClient, as_priya, data):
    response = await client.post(
        f"{API}/reminders",
        headers=as_priya,
        json={
            "subjectType": "deal",
            "subjectId": str(data["priya_deal"].id),
            "title": "Your problem now",
            "dueAt": datetime.now(timezone.utc).isoformat(),
            "assigneeId": str(data["marcus"].id),
        },
    )
    assert response.status_code == 403


async def test_a_rep_does_not_see_another_reps_reminders(
    client: AsyncClient, as_priya, as_marcus, data
):
    await client.post(
        f"{API}/reminders",
        headers=as_marcus,
        json={
            "subjectType": "deal",
            "subjectId": str(data["marcus_deal"].id),
            "title": "Marcus only",
            "dueAt": datetime.now(timezone.utc).isoformat(),
        },
    )
    listed = await client.get(f"{API}/reminders", headers=as_priya)
    assert listed.json() == []


async def test_completing_hides_it_and_is_idempotent(client: AsyncClient, as_priya, data):
    created = await client.post(
        f"{API}/reminders",
        headers=as_priya,
        json={
            "subjectType": "deal",
            "subjectId": str(data["priya_deal"].id),
            "title": "Done thing",
            "dueAt": datetime.now(timezone.utc).isoformat(),
        },
    )
    reminder_id = created.json()["id"]

    first = await client.post(f"{API}/reminders/{reminder_id}/complete", headers=as_priya)
    second = await client.post(f"{API}/reminders/{reminder_id}/complete", headers=as_priya)
    assert first.status_code == 200
    # The original completion timestamp survives; completing twice does not move it.
    assert first.json()["completedAt"] == second.json()["completedAt"]

    open_only = await client.get(f"{API}/reminders", headers=as_priya)
    assert open_only.json() == []


async def test_rescheduling_clears_the_notified_stamp(client: AsyncClient, as_priya, session, data):
    """
    Otherwise pushing a reminder out by a week would silently never fire again — it would
    still carry the stamp from the time that has already passed.
    """
    reminder = Reminder(
        deal_id=data["priya_deal"].id,
        title="Already notified",
        due_at=datetime.now(timezone.utc) - timedelta(hours=1),
        assignee_id=data["priya"].id,
        created_by_id=data["priya"].id,
        notified_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    session.add(reminder)
    await session.commit()

    new_due = datetime.now(timezone.utc) + timedelta(days=7)
    response = await client.patch(
        f"{API}/reminders/{reminder.id}", headers=as_priya, json={"dueAt": new_due.isoformat()}
    )
    assert response.status_code == 200

    await session.refresh(reminder)
    assert reminder.notified_at is None


# --- The inbox ----------------------------------------------------------------


async def test_inbox_separates_overdue_from_upcoming(client: AsyncClient, as_priya, session, data):
    now = datetime.now(timezone.utc)
    session.add_all(
        [
            Reminder(
                deal_id=data["priya_deal"].id, title="Late", due_at=now - timedelta(days=1),
                assignee_id=data["priya"].id, created_by_id=data["priya"].id,
            ),
            Reminder(
                deal_id=data["priya_deal"].id, title="Soon", due_at=now + timedelta(days=1),
                assignee_id=data["priya"].id, created_by_id=data["priya"].id,
            ),
            # Beyond the horizon, so it belongs in neither bucket yet.
            Reminder(
                deal_id=data["priya_deal"].id, title="Later", due_at=now + timedelta(days=90),
                assignee_id=data["priya"].id, created_by_id=data["priya"].id,
            ),
        ]
    )
    await session.commit()

    response = await client.get(f"{API}/reminders/inbox", headers=as_priya)
    body = response.json()

    assert [item["title"] for item in body["overdue"]] == ["Late"]
    assert [item["title"] for item in body["upcoming"]] == ["Soon"]


# --- Derived stale-lead nudges ------------------------------------------------


async def _age_lead(session, lead, days: int) -> None:
    """Backdates creation so the lead is old enough to be considered neglected."""
    lead.created_at = datetime.now(timezone.utc) - timedelta(days=days)
    await session.commit()


async def test_a_lead_quiet_for_a_week_is_nudged(client: AsyncClient, as_priya, session, data):
    await _age_lead(session, data["priya_lead"], days=30)

    response = await client.get(f"{API}/reminders/inbox", headers=as_priya)
    nudges = response.json()["staleLeads"]

    assert [item["businessUnit"] for item in nudges] == ["Priya Unit"]
    assert nudges[0]["accountName"] == "Shared Bank"
    assert nudges[0]["lastActivityAt"] is None
    assert nudges[0]["daysQuiet"] >= 7
    assert nudges[0]["openDealCount"] == 1


async def test_a_freshly_created_lead_is_not_nudged(client: AsyncClient, as_priya, data):
    """Creation counts as a touch, exactly as it does in health derivation."""
    response = await client.get(f"{API}/reminders/inbox", headers=as_priya)
    assert response.json()["staleLeads"] == []


async def test_activity_on_a_leads_deal_counts_as_touching_the_lead(
    client: AsyncClient, as_priya, session, data
):
    """
    Counting only activity logged directly against the lead would nag an owner who is
    actively closing business under it — the fastest way to make people ignore the surface.
    """
    await _age_lead(session, data["priya_lead"], days=30)

    before = await client.get(f"{API}/reminders/inbox", headers=as_priya)
    assert len(before.json()["staleLeads"]) == 1

    session.add(
        Activity(
            deal_id=data["priya_deal"].id,
            kind=ActivityKind.CALL,
            summary="Spoke to the sponsor",
            author_id=data["priya"].id,
            occurred_at=datetime.now(timezone.utc),
        )
    )
    await session.commit()

    after = await client.get(f"{API}/reminders/inbox", headers=as_priya)
    assert after.json()["staleLeads"] == []


async def test_a_lead_with_no_open_deals_is_not_nudged(
    client: AsyncClient, as_priya, session, data
):
    """There is nothing to follow up on, and listing it would only add noise."""
    await _age_lead(session, data["priya_lead"], days=30)
    data["priya_deal"].stage_id = data["won_stage"].id
    await session.commit()

    response = await client.get(f"{API}/reminders/inbox", headers=as_priya)
    assert response.json()["staleLeads"] == []


async def test_a_quiet_business_unit_is_nudged_to_the_account_owner(
    client: AsyncClient, as_priya, session, data
):
    """
    Business units no longer have an owner, so a quiet one is chased through the account.

    This test previously asserted that Priya saw nothing about Marcus Unit. She now sees it — every
    business unit is visible to every rep — but the nudge names **Marcus**, because he owns Shared Bank.
    The visibility widened; the accountability did not move to whoever happened to be looking.
    """
    await _age_lead(session, data["marcus_lead"], days=30)

    response = await client.get(f"{API}/reminders/inbox", headers=as_priya)
    stale = {item["businessUnit"]: item for item in response.json()["staleLeads"]}

    assert "Marcus Unit" in stale
    assert stale["Marcus Unit"]["ownerName"] == data["marcus"].full_name


# --- The sweep ----------------------------------------------------------------


async def test_sweep_notifies_once_and_stamps(session, data, monkeypatch):
    notifier = RecordingNotifier()
    monkeypatch.setattr(notifications, "get_notifier", lambda: notifier)
    monkeypatch.setattr(reminders_service, "get_notifier", lambda: notifier)

    reminder = Reminder(
        deal_id=data["priya_deal"].id,
        title="Send the deck",
        due_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        assignee_id=data["priya"].id,
        created_by_id=data["priya"].id,
    )
    session.add(reminder)
    await session.commit()

    assert await reminders_service.run_sweep(session) == 1
    assert len(notifier.sent) == 1
    assert notifier.sent[0].to == "priya@example.com"
    assert "Send the deck" in notifier.sent[0].subject

    # Second pass sends nothing: `notified_at` is the guard against a nudge arriving on
    # every interval until somebody filters the sender.
    assert await reminders_service.run_sweep(session) == 0
    assert len(notifier.sent) == 1


async def test_sweep_ignores_future_and_completed_reminders(session, data, monkeypatch):
    notifier = RecordingNotifier()
    monkeypatch.setattr(reminders_service, "get_notifier", lambda: notifier)

    now = datetime.now(timezone.utc)
    session.add_all(
        [
            Reminder(
                deal_id=data["priya_deal"].id, title="Not yet", due_at=now + timedelta(days=1),
                assignee_id=data["priya"].id, created_by_id=data["priya"].id,
            ),
            Reminder(
                deal_id=data["priya_deal"].id, title="Handled", due_at=now - timedelta(days=1),
                assignee_id=data["priya"].id, created_by_id=data["priya"].id,
                completed_at=now,
            ),
        ]
    )
    await session.commit()

    assert await reminders_service.run_sweep(session) == 0
    assert notifier.sent == []


async def test_one_failing_send_does_not_abort_the_pass(session, data, monkeypatch):
    """
    A sweep that dies takes every future reminder with it, silently and permanently. One
    dropped email is the cheaper failure.
    """
    monkeypatch.setattr(reminders_service, "get_notifier", lambda: ExplodingNotifier())

    now = datetime.now(timezone.utc)
    session.add_all(
        [
            Reminder(
                deal_id=data["priya_deal"].id, title="One", due_at=now - timedelta(days=2),
                assignee_id=data["priya"].id, created_by_id=data["priya"].id,
            ),
            Reminder(
                deal_id=data["priya_deal"].id, title="Two", due_at=now - timedelta(days=1),
                assignee_id=data["priya"].id, created_by_id=data["priya"].id,
            ),
        ]
    )
    await session.commit()

    # Does not raise, and stamps nothing — both are retried on the next pass.
    assert await reminders_service.run_sweep(session) == 0
    remaining = await reminders_service.due_for_notification(session)
    assert len(remaining) == 2


async def test_a_failed_send_is_retried_next_pass(session, data, monkeypatch):
    """Stamping on failure would swallow a transient outage."""
    failing = RecordingNotifier(succeed=False)
    monkeypatch.setattr(reminders_service, "get_notifier", lambda: failing)

    reminder = Reminder(
        deal_id=data["priya_deal"].id,
        title="Retry me",
        due_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        assignee_id=data["priya"].id,
        created_by_id=data["priya"].id,
    )
    session.add(reminder)
    await session.commit()

    assert await reminders_service.run_sweep(session) == 0
    await session.refresh(reminder)
    assert reminder.notified_at is None

    working = RecordingNotifier()
    monkeypatch.setattr(reminders_service, "get_notifier", lambda: working)
    assert await reminders_service.run_sweep(session) == 1


async def test_the_default_notifier_logs_when_smtp_is_unset(monkeypatch):
    """
    A fresh checkout has no credentials and must still work. This is the contract that lets
    real ones be dropped into `.env` later without a code change.

    `smtp_host` is patched to blank rather than read from the environment. This test used to assert
    against the developer's own `.env`, so it passed on a machine with no mail configured and failed
    the moment Mailpit was added — reporting a broken contract when the only thing that had changed
    was local config. The selection rule is what is under test; where the host comes from is not.
    """
    monkeypatch.setattr(notifications.settings, "smtp_host", "")
    notifications.get_notifier.cache_clear()
    try:
        assert isinstance(notifications.get_notifier(), notifications.LoggingNotifier)
    finally:
        # Cleared on the way out as well as in: the cache would otherwise hand the blank-host
        # notifier to every later test in the session.
        notifications.get_notifier.cache_clear()
