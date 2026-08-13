"""
Importing a lemlist workspace into the CRM, and keeping it current.

The shape of the whole integration in one paragraph: connect once with the user's key, import campaigns and
their leads into our own tables, register a webhook so changes arrive as they happen, and reconcile nightly
because webhooks are best-effort and a missed open is invisible by definition. Everything the application
reads comes from our tables. Nothing renders a screen from a live lemlist call.

Every write here is idempotent. The unique constraints in `app/models/lemlist.py` are what make that true,
and they are load-bearing rather than defensive: a webhook may arrive twice, and the nightly reconcile
deliberately re-reads a window that webhooks have already covered, so "the same event twice" is the normal
case and not an error to be handled.
"""

import asyncio
import logging
import secrets as pysecrets
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.secrets import decrypt_secret, encrypt_secret, fingerprint
from app.models import (
    LemlistCampaign,
    LemlistConnection,
    LemlistContact,
    LemlistEngagement,
    LemlistWebhook,
)
from app.services.lemlist_client import LemlistClient, LemlistError

logger = logging.getLogger(__name__)

#: How far back the nightly reconcile re-reads activities. Wider than a day on purpose: a sync that failed
#: last night must be repaired by tonight's run, and re-reading an event already stored costs one refused
#: insert. A window exactly one day wide would turn a single failure into a permanent hole.
RECONCILE_WINDOW_DAYS = 3

#: Lead states that mean the person answered rather than merely received. Used for the engagement score, and
#: kept here rather than in the database because it is a judgement about what matters, not a fact about
#: lemlist.
REPLIED_STATES = frozenset({"emailsReplied", "linkedinReplied", "whatsappReplied", "smsReplied"})
POSITIVE_STATES = frozenset({"interested", "meetingBooked", "emailsInterested", "linkedinInterested"})
NEGATIVE_STATES = frozenset(
    {"emailsBounced", "emailsUnsubscribed", "notInterested", "emailsNotInterested", "emailsFailed"}
)


@dataclass
class SyncReport:
    """What a sync did, in numbers a user can check against lemlist's own screens."""

    campaigns: int = 0
    contacts_created: int = 0
    contacts_updated: int = 0
    engagements: int = 0
    #: Campaigns that failed, by name, with why. A partial import is reported as partial rather than as
    #: either a success or a failure — one campaign whose export times out should not discard nine good ones.
    failures: list[str] = field(default_factory=list)


# --- Connecting --------------------------------------------------------------


async def connect(db: AsyncSession, user_id: uuid.UUID, api_key: str) -> LemlistConnection:
    """
    Verifies a key against lemlist and stores the connection.

    Verified *before* anything is written, so an invalid key never creates a half-connection somebody then
    has to disconnect. Reconnecting replaces the existing row rather than adding one — one workspace per
    user, and no question of which key is live.

    The webhook secret is generated here rather than at registration time because it has to survive
    re-registration: lemlist will not return a hook's secret and will not let it be changed, so if we forget
    ours the only repair is to delete the hook and make a new one.
    """
    async with LemlistClient(api_key) as client:
        team = await client.verify()

    existing = await get_connection(db, user_id)
    connection = existing or LemlistConnection(user_id=user_id, connected_at=datetime.now(UTC))

    connection.api_key_encrypted = encrypt_secret(api_key.strip())
    connection.api_key_fingerprint = fingerprint(api_key.strip())
    connection.team_id = str(team.get("_id") or team.get("teamId") or "")
    connection.team_name = str(team.get("name") or "")
    connection.connected_at = datetime.now(UTC)
    connection.last_sync_error = ""
    if not connection.webhook_secret_encrypted:
        connection.webhook_secret_encrypted = encrypt_secret(pysecrets.token_urlsafe(32))

    if existing is None:
        db.add(connection)
    await db.commit()
    await db.refresh(connection)
    return connection


async def get_connection(db: AsyncSession, user_id: uuid.UUID) -> LemlistConnection | None:
    stmt = select(LemlistConnection).where(LemlistConnection.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def disconnect(db: AsyncSession, connection: LemlistConnection) -> None:
    """
    Unlinks the workspace, and deregisters the webhooks first.

    The order matters and the failure handling is deliberate: a hook left registered on lemlist's side keeps
    posting somebody's outreach data to an endpoint that no longer knows their workspace. That is a slow
    leak, so it is attempted first — but a failure there does not block the disconnect, because refusing to
    unlink an account because a remote cleanup call failed would be holding their data hostage to our
    tidiness. The inbound handler rejects events for an unknown secret anyway, so the worst case is noise.
    """
    hooks = list((await db.execute(
        select(LemlistWebhook).where(LemlistWebhook.connection_id == connection.id)
    )).scalars())

    if hooks:
        try:
            async with LemlistClient(decrypt_secret(connection.api_key_encrypted)) as client:
                for hook in hooks:
                    await client.delete_hook(hook.lemlist_hook_id)
        except Exception as exc:  # noqa: BLE001 - see the docstring; this must not block the disconnect
            logger.warning("Could not deregister lemlist hooks for %s: %s", connection.id, exc)

    # Cascades take the campaigns, contacts, engagements and hook records with it.
    await db.delete(connection)
    await db.commit()


# --- Listing and importing ---------------------------------------------------

#: How long an `import_started_at` stamp is believed.
#:
#: A timestamp on a row is not a lock: nothing releases it if the process holding it dies. Treating a stale
#: one as expired is what keeps a single crash from making a campaign permanently un-importable, which is a
#: worse failure than the duplicated work an overlapping import would cause in the window where we are
#: wrong. Every write in an import is an upsert or an ignored conflict, so that duplicate costs requests and
#: nothing else.
IMPORT_LOCK_TTL = timedelta(minutes=15)


def import_in_progress(campaign: LemlistCampaign) -> bool:
    """Whether this campaign's in-progress stamp should still be believed."""
    started = campaign.import_started_at
    if started is None:
        return False
    return datetime.now(UTC) - started < IMPORT_LOCK_TTL


async def list_campaigns(db: AsyncSession, connection: LemlistConnection) -> list[LemlistCampaign]:
    """
    Reads the workspace's campaign list from lemlist and mirrors the campaign rows only.

    Deliberately the cheap half of the old whole-workspace sync: one or two paged requests, no leads and no
    activity, so it is safe to call whenever the Integrations page opens. Listing a campaign is what lets
    the user decide whether importing it is worth the requests — which is the decision the old flow made on
    their behalf, thirty-three times, in one request that outlived the browser.

    Campaigns that have disappeared from lemlist are left in place rather than deleted. Their mirrored leads
    and engagement are still true history, and a transient API hiccup that returned a short list must never
    be able to destroy an import.
    """
    async with LemlistClient(decrypt_secret(connection.api_key_encrypted)) as client:
        payloads = await client.campaigns()

    for payload in payloads:
        remote_id = str(payload.get("_id") or payload.get("id") or "")
        if not remote_id:
            continue
        await _upsert_campaign(db, connection, remote_id, payload)

    connection.last_sync_at = datetime.now(UTC)
    connection.last_sync_error = ""
    await db.commit()

    return await campaigns_for(db, connection)


async def campaigns_for(db: AsyncSession, connection: LemlistConnection) -> list[LemlistCampaign]:
    """The mirrored campaign list, newest first, read without touching lemlist."""
    stmt = (
        select(LemlistCampaign)
        .where(LemlistCampaign.connection_id == connection.id)
        .order_by(LemlistCampaign.remote_created_at.desc().nullslast(), LemlistCampaign.name)
    )
    return list((await db.execute(stmt)).scalars())


async def import_campaign(
    db: AsyncSession,
    connection: LemlistConnection,
    campaign: LemlistCampaign,
    *,
    full: bool = True,
) -> SyncReport:
    """
    Imports one campaign: its leads, then its engagement.

    One campaign is the unit because it is the largest amount of work that reliably finishes inside a
    request. The whole workspace was not: paced at 150ms a request to stay under lemlist's budget, thirty
    campaigns is minutes, and a request nobody is still waiting for is one whose result is thrown away.

    `full=False` limits the activity walk to the reconcile window. The leads are re-read either way, because
    a lead's state changes without an activity that says so.

    The in-progress stamp is committed before the work starts, which is what makes a second concurrent
    import of the *same* campaign refusable. A different campaign is unaffected — the two would only be
    competing for the same rate-limit budget, and that is the user's call to make, not ours to forbid.
    """
    campaign.import_started_at = datetime.now(UTC)
    campaign.import_error = ""
    await db.commit()

    report = SyncReport(campaigns=1)
    try:
        async with LemlistClient(decrypt_secret(connection.api_key_encrypted)) as client:
            await _import_campaign_leads(db, connection, campaign, client, report)
            await _import_campaign_activities(db, connection, campaign, client, report, full=full)

        campaign.imported_at = datetime.now(UTC)
        campaign.import_started_at = None
        campaign.import_error = ""
        connection.last_sync_at = datetime.now(UTC)
        await db.commit()
        return report

    except BaseException as exc:
        # `BaseException`, not `Exception`, and this is the point of it: the commonest way a long request
        # ends is the browser giving up, and the server cancelling it raises `asyncio.CancelledError` —
        # which does not inherit from `Exception`. An `except Exception` here would let the cancellation
        # past and leave the campaign stamped as importing forever, refusing every later attempt with a 409
        # about a run that no longer exists. That is exactly the bug this flow replaces.
        await db.rollback()
        campaign.import_started_at = None
        campaign.import_error = (
            "The import was interrupted before it finished."
            if isinstance(exc, asyncio.CancelledError)
            else str(exc)[:2000]
        )
        # Recorded on the row rather than only raised, so the campaign can explain itself later — including
        # when it failed inside the nightly job with nobody watching.
        connection.last_sync_error = f"{campaign.name or campaign.lemlist_id}: {campaign.import_error}"[:2000]
        await db.commit()
        raise


async def _upsert_campaign(
    db: AsyncSession, connection: LemlistConnection, remote_id: str, payload: dict[str, Any]
) -> LemlistCampaign:
    stmt = select(LemlistCampaign).where(
        LemlistCampaign.connection_id == connection.id, LemlistCampaign.lemlist_id == remote_id
    )
    campaign = (await db.execute(stmt)).scalar_one_or_none()
    if campaign is None:
        campaign = LemlistCampaign(connection_id=connection.id, lemlist_id=remote_id)
        db.add(campaign)

    campaign.name = str(payload.get("name") or "")
    campaign.status = str(payload.get("status") or "")
    campaign.remote_created_at = _parse_time(payload.get("createdAt"))
    campaign.remote_updated_at = _parse_time(payload.get("updatedAt"))
    campaign.raw = payload
    await db.flush()
    return campaign


async def _import_campaign_leads(
    db: AsyncSession,
    connection: LemlistConnection,
    campaign: LemlistCampaign,
    client: LemlistClient,
    report: SyncReport,
) -> None:
    """
    Imports one campaign's leads, from the export joined to the lead list.

    Two calls rather than one because they carry different halves of the truth: the export has the fields
    (name, company, title, phone, LinkedIn, custom variables) and the lead list has the authoritative
    `state` and lead id. Importing from the export alone would leave every lead stateless; importing from
    the lead list alone would leave every lead nameless.
    """
    exported = await client.export_leads(campaign.lemlist_id)
    listed = await client.campaign_leads(campaign.lemlist_id)

    # Keyed on email, which is the only field reliably present in both.
    states: dict[str, dict[str, Any]] = {}
    for lead in listed:
        email = str(lead.get("email") or "").strip().lower()
        if email:
            states[email] = lead

    # A lead present in the list but absent from the export still exists, so both sources are walked. The
    # union is keyed on email so the same person from both sides is one row.
    by_email: dict[str, dict[str, Any]] = {}
    for lead in exported:
        email = str(lead.get("email") or "").strip().lower()
        if email:
            by_email[email] = lead
    for email, lead in states.items():
        by_email.setdefault(email, lead)

    for email, lead in by_email.items():
        state_row = states.get(email, {})
        created = await _upsert_contact(db, connection, campaign, email, lead, state_row)
        if created:
            report.contacts_created += 1
        else:
            report.contacts_updated += 1

    campaign.lead_count = len(by_email)
    await db.commit()


async def _upsert_contact(
    db: AsyncSession,
    connection: LemlistConnection,
    campaign: LemlistCampaign,
    email: str,
    lead: dict[str, Any],
    state_row: dict[str, Any],
) -> bool:
    """Writes one lead. Returns True when it was new, so the report can distinguish import from refresh."""
    stmt = select(LemlistContact).where(
        LemlistContact.campaign_id == campaign.id, LemlistContact.email == email
    )
    contact = (await db.execute(stmt)).scalar_one_or_none()
    created = contact is None

    if contact is None:
        contact = LemlistContact(
            connection_id=connection.id, campaign_id=campaign.id, email=email
        )
        db.add(contact)

    # `or contact.x` on every field, so a later export that omits a field does not blank a value an earlier
    # one supplied. lemlist's export columns depend on the campaign's own variables, so a missing key means
    # "not in this export" far more often than it means "cleared".
    contact.lemlist_lead_id = str(state_row.get("_id") or lead.get("_id") or contact.lemlist_lead_id or "")
    contact.first_name = str(lead.get("firstName") or contact.first_name or "")
    contact.last_name = str(lead.get("lastName") or contact.last_name or "")
    contact.company_name = str(lead.get("companyName") or lead.get("company") or contact.company_name or "")
    contact.job_title = str(lead.get("jobTitle") or lead.get("title") or contact.job_title or "")
    contact.phone = str(lead.get("phone") or contact.phone or "")
    contact.linkedin_url = str(lead.get("linkedinUrl") or lead.get("linkedin") or contact.linkedin_url or "")
    contact.state = str(state_row.get("state") or lead.get("state") or contact.state or "")

    variables = lead.get("customVariables") or lead.get("variables")
    if isinstance(variables, dict) and variables:
        contact.variables = variables

    await db.flush()
    return created


async def _import_campaign_activities(
    db: AsyncSession,
    connection: LemlistConnection,
    campaign: LemlistCampaign,
    client: LemlistClient,
    report: SyncReport,
    *,
    full: bool,
) -> None:
    """
    Imports engagement for one campaign, stopping once it reaches events older than the window.

    The activity feed is newest-first, so a reconcile walks only as far back as it needs to. On a full
    import there is no cutoff and the whole history is taken, which is what makes the first sync produce a
    real timeline rather than one that starts today.
    """
    cutoff = None if full else datetime.now(UTC) - timedelta(days=RECONCILE_WINDOW_DAYS)

    # Loaded once per campaign rather than queried per activity: an import of ten thousand activities would
    # otherwise be ten thousand lookups to resolve a lead id to a row.
    contacts = list((await db.execute(
        select(LemlistContact).where(LemlistContact.campaign_id == campaign.id)
    )).scalars())
    by_lead_id = {c.lemlist_lead_id: c for c in contacts if c.lemlist_lead_id}
    by_email = {c.email: c for c in contacts}

    latest: dict[uuid.UUID, datetime] = {}
    written = 0

    async for activity in client.activities(campaign_id=campaign.lemlist_id):
        occurred = _parse_time(activity.get("createdAt"))
        if occurred is None:
            continue
        if cutoff is not None and occurred < cutoff:
            break

        contact = _match_contact(activity, by_lead_id, by_email)
        if contact is None:
            # An activity for a lead that is not in this campaign's import — deleted from lemlist since, or
            # a lead the export did not return. Skipped rather than inventing a contact from an activity
            # payload, which carries no name, company or title.
            continue

        if await _record_engagement(db, connection, contact, activity, occurred, from_webhook=False):
            written += 1

        if occurred > latest.get(contact.id, datetime.min.replace(tzinfo=UTC)):
            latest[contact.id] = occurred

    for contact in contacts:
        stamp = latest.get(contact.id)
        if stamp and (contact.last_activity_at is None or stamp > contact.last_activity_at):
            contact.last_activity_at = stamp

    report.engagements += written
    await db.commit()


def _match_contact(
    activity: dict[str, Any],
    by_lead_id: dict[str, LemlistContact],
    by_email: dict[str, LemlistContact],
) -> LemlistContact | None:
    """
    Lead id first, email second.

    Both are needed. The id is exact but is not always present in an activity payload; the email always is,
    but is only unique within a campaign — which is fine here, because this is called with one campaign's
    contacts.
    """
    lead_id = str(activity.get("leadId") or "")
    if lead_id and lead_id in by_lead_id:
        return by_lead_id[lead_id]

    email = str(activity.get("leadEmail") or activity.get("email") or "").strip().lower()
    return by_email.get(email)


async def _record_engagement(
    db: AsyncSession,
    connection: LemlistConnection,
    contact: LemlistContact,
    activity: dict[str, Any],
    occurred: datetime,
    *,
    from_webhook: bool,
) -> bool:
    """
    Stores one engagement, ignoring it if it is already there. Returns whether a row was written.

    `ON CONFLICT DO NOTHING` against the unique constraint rather than a select-then-insert, because the
    duplicate case is the common case and a read before every write would double the query count of an
    import to no benefit. It is also the only version that is correct when a webhook and a reconcile land
    the same event concurrently.
    """
    activity_id = str(activity.get("_id") or "")
    if not activity_id:
        # Webhooks do not always carry one. Built from the three facts that make two events the same event,
        # so a replayed webhook still collides with the row it already wrote.
        kind = str(activity.get("type") or "unknown")
        activity_id = f"synthetic:{kind}:{contact.id}:{occurred.isoformat()}"

    stmt = (
        insert(LemlistEngagement)
        .values(
            connection_id=connection.id,
            lemlist_contact_id=contact.id,
            lemlist_activity_id=activity_id[:200],
            kind=str(activity.get("type") or "unknown")[:80],
            occurred_at=occurred,
            payload=activity,
            from_webhook=from_webhook,
        )
        .on_conflict_do_nothing(constraint="uq_lemlist_engagements_remote")
    )
    result = await db.execute(stmt)
    return bool(result.rowcount)


# --- Webhooks ----------------------------------------------------------------


def webhook_target_url() -> str:
    """
    Where lemlist should POST. Configured, because lemlist has to be able to reach it.

    Localhost is useless to lemlist, so this has to be a public URL — a tunnel in development. Returning an
    empty string when it is unset lets the caller refuse registration with an explanation instead of
    registering a hook that can never fire.
    """
    base = settings.lemlist_webhook_base_url.rstrip("/")
    return f"{base}/api/v1/integrations/lemlist/webhook" if base else ""


async def register_webhook(db: AsyncSession, connection: LemlistConnection) -> LemlistWebhook:
    """
    Registers one catch-all webhook, or returns the one already registered.

    One hook with no `type` rather than one per event: lemlist has over fifty event types and adds more, so
    a subscription list written today would silently stop delivering whatever it invented tomorrow.

    Idempotent against lemlist's own state, not just ours — it reads `GET /hooks` first. Without that, a
    connection re-registered after our row was lost would leave two hooks posting the same events, which the
    engagement constraint would absorb but which doubles the traffic and the confusion.
    """
    target = webhook_target_url()
    if not target:
        raise LemlistError(
            "No public webhook URL is configured, so lemlist has nowhere to send events. "
            "Set LEMLIST_WEBHOOK_BASE_URL to a URL lemlist can reach."
        )

    existing = (await db.execute(
        select(LemlistWebhook).where(
            LemlistWebhook.connection_id == connection.id, LemlistWebhook.target_url == target
        )
    )).scalar_one_or_none()
    if existing is not None:
        return existing

    secret = decrypt_secret(connection.webhook_secret_encrypted)

    async with LemlistClient(decrypt_secret(connection.api_key_encrypted)) as client:
        for hook in await client.hooks():
            if str(hook.get("targetUrl") or "") == target:
                # Registered on lemlist's side but not recorded on ours. Adopt it rather than adding a
                # second — though note the secret cannot be read back, so if it was not ours, inbound
                # events from it will be rejected and the hook has to be deleted by hand.
                record = LemlistWebhook(
                    connection_id=connection.id,
                    lemlist_hook_id=str(hook.get("_id") or ""),
                    target_url=target,
                    event_type=str(hook.get("type") or ""),
                )
                db.add(record)
                await db.commit()
                await db.refresh(record)
                return record

        created = await client.create_hook(target_url=target, secret=secret)

    record = LemlistWebhook(
        connection_id=connection.id,
        lemlist_hook_id=str(created.get("_id") or ""),
        target_url=target,
        event_type=str(created.get("type") or ""),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def handle_webhook_event(db: AsyncSession, payload: dict[str, Any]) -> str:
    """
    Applies one inbound event: records the engagement, moves the lead's state, stamps its last activity.

    Authentication is the `secret` in the body, matched against every connection's stored secret. That is
    the only credential lemlist offers on a callback — there is no signature header — so the endpoint is
    otherwise unauthenticated by necessity and this check is the whole of its security. An event whose
    secret matches nothing is refused without saying which part was wrong.

    Returns a short description of what happened, for the log. Never raises on an unrecognised event type:
    lemlist adds them, and a 500 on an unknown type would make lemlist retry it forever.
    """
    secret = str(payload.get("secret") or "")
    if not secret:
        raise PermissionError("This webhook carried no secret.")

    connection = await _connection_for_secret(db, secret)
    if connection is None:
        raise PermissionError("This webhook's secret does not match any connected workspace.")

    kind = str(payload.get("type") or payload.get("event") or "")
    occurred = _parse_time(payload.get("createdAt")) or datetime.now(UTC)

    contact = await _find_contact_for_event(db, connection, payload)
    if contact is None:
        # Not an error. A webhook can arrive for a lead added in lemlist since the last sync; the next sync
        # imports the lead and the reconcile picks the event back up from the activity feed.
        return f"ignored {kind or 'event'}: lead not imported yet"

    await _record_engagement(db, connection, contact, payload, occurred, from_webhook=True)

    # The event *is* the new state: lemlist's event types and its lead states are the same vocabulary.
    if kind:
        contact.state = kind[:80]
    if contact.last_activity_at is None or occurred > contact.last_activity_at:
        contact.last_activity_at = occurred

    await db.commit()
    return f"applied {kind or 'event'} to {contact.email}"


async def _connection_for_secret(db: AsyncSession, secret: str) -> LemlistConnection | None:
    """
    Finds the connection whose webhook secret this is.

    A linear scan with a constant-time comparison per row, because the secrets are stored *encrypted* rather
    than hashed — Fernet ciphertext is non-deterministic, so the same secret encrypts differently every time
    and cannot be looked up by equality. At the scale this integration is for (one row per user) the scan is
    nothing; if it ever mattered, the fix is a deterministic keyed hash alongside the ciphertext.
    """
    rows = list((await db.execute(select(LemlistConnection))).scalars())
    for connection in rows:
        if not connection.webhook_secret_encrypted:
            continue
        try:
            stored = decrypt_secret(connection.webhook_secret_encrypted)
        except Exception:  # noqa: BLE001 - an unreadable secret must not stop the others being checked
            continue
        if pysecrets.compare_digest(stored, secret):
            return connection
    return None


async def _find_contact_for_event(
    db: AsyncSession, connection: LemlistConnection, payload: dict[str, Any]
) -> LemlistContact | None:
    """Lead id first, then campaign-scoped email, then email anywhere in the workspace."""
    lead_id = str(payload.get("leadId") or "")
    if lead_id:
        found = (await db.execute(
            select(LemlistContact).where(
                LemlistContact.connection_id == connection.id,
                LemlistContact.lemlist_lead_id == lead_id,
            )
        )).scalars().first()
        if found is not None:
            return found

    email = str(payload.get("leadEmail") or payload.get("email") or "").strip().lower()
    if not email:
        return None

    campaign_id = str(payload.get("campaignId") or "")
    if campaign_id:
        # Scoped to the campaign the event names, because the same person in two campaigns is two rows with
        # two independent states and applying an event to the wrong one would report the wrong story.
        stmt = (
            select(LemlistContact)
            .join(LemlistCampaign, LemlistCampaign.id == LemlistContact.campaign_id)
            .where(
                LemlistContact.connection_id == connection.id,
                LemlistContact.email == email,
                LemlistCampaign.lemlist_id == campaign_id,
            )
        )
        found = (await db.execute(stmt)).scalars().first()
        if found is not None:
            return found

    return (await db.execute(
        select(LemlistContact).where(
            LemlistContact.connection_id == connection.id, LemlistContact.email == email
        )
    )).scalars().first()


# --- Derived reporting -------------------------------------------------------


#: The outreach sequence, in order, as five reachable steps.
#:
#: Ordered because outreach genuinely *is* ordered — you cannot open an email nobody sent — which is what
#: makes a stepped display honest here rather than decorative. Each entry lists the lemlist event types that
#: prove the step was reached; lemlist has separate vocabularies per channel, so a step is reached by email,
#: LinkedIn, WhatsApp or SMS alike.
FUNNEL_STEPS: tuple[tuple[str, frozenset[str]], ...] = (
    ("sent", frozenset({"emailsSent", "linkedinSent", "smsSent", "whatsappMessageSent", "contacted"})),
    ("opened", frozenset({"emailsOpened", "linkedinOpened", "whatsappMessageOpened", "hooked"})),
    ("clicked", frozenset({"emailsClicked", "linkedinInviteAccepted", "attracted"})),
    (
        "replied",
        frozenset({"emailsReplied", "linkedinReplied", "whatsappReplied", "smsReplied", "warmed"}),
    ),
    ("won", frozenset({"meetingBooked", "interested", "emailsInterested", "linkedinInterested"})),
)


def funnel_step(state: str, engagement_kinds: Sequence[str]) -> int:
    """
    How far this prospect got: 0 for not yet contacted, up to 5 for a booked meeting.

    Derived from the events *and* the current state, because either alone is incomplete. A prospect
    imported before any activity was fetched has a state and no events; one whose state lemlist has not
    advanced yet may already have the event. Taking the furthest of the two is the only answer that does not
    understate progress.

    Never stored. It changes with every event, and a stored copy would be wrong between the event arriving
    and whatever job recomputed it.
    """
    reached = 0
    for index, (_label, kinds) in enumerate(FUNNEL_STEPS, start=1):
        if state in kinds or any(kind in kinds for kind in engagement_kinds):
            reached = index
    return reached


def is_dead_end(state: str) -> bool:
    """A bounce or an unsubscribe. Not a low score — a closed door, which the UI draws differently."""
    return state in NEGATIVE_STATES


def engagement_score(contact: LemlistContact, engagement_kinds: list[str]) -> int:
    """
    A 0–100 reading of how warm this prospect is. Derived on read, never stored.

    Weighted by what an action actually tells you: a reply is evidence of a human being interested, an open
    is evidence of a working inbox. A bounce or an unsubscribe is not a low score, it is a dead end, so it
    floors the result — a lead who opened four emails and then unsubscribed is not warmer than one who
    opened none.

    Not stored for the same reason deal health is not: it changes whenever an event arrives, and a stored
    copy would be wrong between the event and whatever job recomputed it.
    """
    if contact.state in NEGATIVE_STATES:
        return 0

    score = 0
    for kind in engagement_kinds:
        if kind in POSITIVE_STATES:
            score += 40
        elif kind in REPLIED_STATES:
            score += 30
        elif "Clicked" in kind or kind == "attracted":
            score += 15
        elif "Opened" in kind or kind == "hooked":
            score += 5
        elif "Sent" in kind or kind == "contacted":
            score += 1

    return min(score, 100)


def _parse_time(value: Any) -> datetime | None:
    """
    Reads one of lemlist's timestamps.

    Tolerant on purpose: the API returns ISO 8601, usually with a trailing `Z` that `fromisoformat` did not
    accept before Python 3.11. A timestamp that cannot be read returns None and the caller skips the record,
    which is better than defaulting to now and inventing a chronology.
    """
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


# --- The nightly reconcile ---------------------------------------------------


async def reconcile_all(session_factory) -> dict[str, Any]:
    """
    Re-reads the recent activity of every campaign a user has chosen to import.

    This exists because webhooks are best-effort. A missed delivery is invisible by definition — there is no
    gap to notice, just an open that never appeared — so the only way to know the CRM matches lemlist is to
    ask again. It re-reads a window wider than a day so that one failed night is repaired by the next rather
    than becoming a permanent hole.

    It also catches what webhooks cannot report at all: a lead's *fields* changing. Somebody correcting a job
    title in lemlist fires no event, so without this the CRM would hold the old one forever.

    **Only imported campaigns**, and that bound is the important part. Reconciling everything lemlist lists
    would quietly undo the whole point of letting the user pick: the nightly job would spend the workspace's
    rate-limit budget on thirty campaigns nobody asked for, and would import leads the user deliberately
    declined. A campaign the user never chose has no mirror to keep current.

    Off unless `lemlist_nightly_sync_enabled` is set, so an imported campaign refreshes only when asked —
    by the user, or by an operator who turned this on deliberately.

    Each connection gets its own session and its own error handling, and each campaign its own attempt. One
    user's revoked API key must not stop every other user's reconcile, and one campaign's failed export must
    not cost the rest of theirs.
    """
    summary: dict[str, Any] = {"connections": 0, "campaigns": 0, "engagements": 0, "failed": 0}

    async with session_factory() as db:
        connection_ids = [c.id for c in (await db.execute(select(LemlistConnection))).scalars()]

    for connection_id in connection_ids:
        async with session_factory() as db:
            connection = await db.get(LemlistConnection, connection_id)
            if connection is None:
                continue
            summary["connections"] += 1

            stmt = select(LemlistCampaign).where(
                LemlistCampaign.connection_id == connection.id,
                LemlistCampaign.imported_at.is_not(None),
            )
            campaigns = list((await db.execute(stmt)).scalars())

            for campaign in campaigns:
                if import_in_progress(campaign):
                    # Somebody is importing it by hand right now. Skipped rather than queued: the nightly
                    # run has all night, and the manual one is the one with a person waiting on it.
                    continue
                try:
                    report = await import_campaign(db, connection, campaign, full=False)
                    summary["campaigns"] += 1
                    summary["engagements"] += report.engagements
                except Exception:
                    # Logged with a traceback and counted, not raised: this runs unattended, and the point is
                    # that the other campaigns still get reconciled. The failure is also recorded on the
                    # campaign row by `import_campaign`, so the user can see which one and why.
                    logger.exception(
                        "Nightly lemlist reconcile failed for campaign %s", campaign.lemlist_id
                    )
                    summary["failed"] += 1

    return summary


async def reconcile_forever(session_factory) -> None:
    """
    The nightly loop, started from the FastAPI lifespan when `lemlist_nightly_sync_enabled` is set.

    A plain asyncio task, matching the reminder sweep: this stack has no scheduler, and a second interval
    loop does not justify adding one along with its broker and its deployment story.

    Sleeps first, so starting the application does not immediately spend a workspace's rate-limit budget on
    a full reconcile — a deploy loop would otherwise hammer lemlist once per restart.
    """
    interval = 24 * 60 * 60
    logger.info("lemlist nightly reconcile running every %ss", interval)

    while True:
        try:
            await asyncio.sleep(interval)
            summary = await reconcile_all(session_factory)
            logger.info("lemlist reconcile: %s", summary)
        except asyncio.CancelledError:
            logger.info("lemlist reconcile stopped")
            raise
        except Exception:
            logger.exception("lemlist reconcile failed; will retry in %ss", interval)
