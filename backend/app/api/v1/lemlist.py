"""
Lemlist integration endpoints.

Everything except the webhook is scoped to the caller's own connection: a lemlist API key belongs to one
person, and so does everything imported with it. There is no admin view over somebody else's outreach here,
because there is no version of that which is not reading their mailbox over their shoulder.

The webhook is the exception and is unauthenticated by necessity — lemlist calls it, not a signed-in user.
It authenticates on the shared secret in the body, which is the only credential lemlist offers on a callback.
"""

import logging
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.core.secrets import SecretUnreadable
from app.models import (
    Account,
    Contact,
    ContactType,
    LemlistCampaign,
    LemlistConnection,
    LemlistContact,
    LemlistEngagement,
    LemlistSyncStatus,
    LemlistWebhook,
)
from app.schemas.common import Message
from app.schemas.lemlist import (
    LemlistCampaignRead,
    LemlistConnectRequest,
    LemlistContactRead,
    LemlistEngagementRead,
    LemlistPromoteRequest,
    LemlistStatus,
    LemlistSyncResult,
)
from app.services import lemlist_sync
from app.services.lemlist_client import LemlistAuthError, LemlistError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations/lemlist", tags=["lemlist"])


async def _require_connection(db: DbSession, user_id: uuid.UUID) -> LemlistConnection:
    connection = await lemlist_sync.get_connection(db, user_id)
    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No lemlist account is connected. Connect one first.",
        )
    return connection


@router.post("/connect", response_model=LemlistStatus, status_code=status.HTTP_201_CREATED)
async def connect(db: DbSession, user: CurrentUser, payload: LemlistConnectRequest) -> LemlistStatus:
    """
    Connects the caller's own lemlist account.

    The key is verified against lemlist before anything is stored, so a typo produces a 400 explaining what
    to check rather than a connection that fails silently on every later sync.

    Registering the webhook is attempted but not required. A development machine has no public URL for
    lemlist to call, and refusing the whole connection over that would make the integration untestable
    locally — imports and the nightly reconcile work without it.
    """
    try:
        connection = await lemlist_sync.connect(db, user.id, payload.api_key)
    except LemlistAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.detail) from exc
    except LemlistError as exc:
        # 502, not 400: the request was fine and lemlist is what did not cooperate.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.detail) from exc

    try:
        await lemlist_sync.register_webhook(db, connection)
    except (LemlistError, SecretUnreadable) as exc:
        logger.info("Connected lemlist for %s without a webhook: %s", user.id, exc)

    return await _status(db, connection)


@router.get("/status", response_model=LemlistStatus)
async def read_status(db: DbSession, user: CurrentUser) -> LemlistStatus:
    """
    Whether lemlist is connected, and what the last import did.

    Deliberately does not call lemlist. The Contacts page asks for this on every load, and putting a remote
    call in that path would make our page's speed depend on lemlist's — and spend the workspace's shared
    rate limit on a question our own database can answer.
    """
    connection = await lemlist_sync.get_connection(db, user.id)
    if connection is None:
        return LemlistStatus(connected=False, webhook_target_url=lemlist_sync.webhook_target_url())
    return await _status(db, connection)


@router.delete("/connect", response_model=Message)
async def disconnect(db: DbSession, user: CurrentUser) -> Message:
    """
    Unlinks the workspace and deletes everything imported through it.

    A full delete rather than an archive, and that is the honest reading of "disconnect": somebody
    withdrawing access to their outreach account does not mean "keep the copy you already took". Promoted
    contacts survive — they are CRM records now, filed against an account by a person — and their
    `lemlist_contacts` row going away only removes the outreach history behind them.
    """
    connection = await _require_connection(db, user.id)
    await lemlist_sync.disconnect(db, connection)
    return Message(detail="lemlist disconnected and imported data removed")


@router.post("/campaigns/refresh", response_model=list[LemlistCampaignRead])
async def refresh_campaigns(db: DbSession, user: CurrentUser) -> list[LemlistCampaignRead]:
    """
    Re-reads the campaign list from lemlist. Leads and activity are not touched.

    The cheap half of what used to be one whole-workspace sync: a paged campaign list is one or two requests
    and finishes in under a second, whatever the size of the workspace. Importing a campaign's leads is the
    expensive half, and it is now a separate, explicit act — so nothing spends a workspace's rate-limit
    budget on data the user never asked for.
    """
    connection = await _require_connection(db, user.id)
    try:
        campaigns = await lemlist_sync.list_campaigns(db, connection)
    except LemlistAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.detail) from exc
    except SecretUnreadable as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LemlistError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.detail) from exc

    return [_campaign_read(campaign) for campaign in campaigns]


@router.post("/campaigns/{campaign_id}/import", response_model=LemlistSyncResult)
async def import_campaign(
    db: DbSession,
    user: CurrentUser,
    campaign_id: uuid.UUID,
    full: bool = Query(
        default=True,
        description="False re-reads only the recent activity window, which is what a refresh wants.",
    ),
) -> LemlistSyncResult:
    """
    Imports one campaign's leads and engagement, and waits for it.

    One campaign is the unit because it is the largest amount of work that reliably finishes inside a
    request. Re-importing an already-imported campaign is allowed on purpose: leads change state and
    activity keeps arriving, so refusing would freeze the mirror at whatever it first caught. Every write is
    an upsert or an ignored conflict, so a refresh costs requests and never duplicates a row.

    A second import of the *same* campaign is refused. A different campaign is not — the two would only be
    sharing the workspace's rate-limit budget, and spending it on two campaigns at once is the user's call.
    """
    connection = await _require_connection(db, user.id)
    campaign = await db.get(LemlistCampaign, campaign_id)
    # Ownership is checked through the connection, not the campaign: campaign ids are ours, but a stolen one
    # must not read another user's workspace.
    if campaign is None or campaign.connection_id != connection.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such campaign")

    if lemlist_sync.import_in_progress(campaign):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{campaign.name or 'That campaign'} is already importing.",
        )

    try:
        report = await lemlist_sync.import_campaign(db, connection, campaign, full=full)
    except LemlistAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.detail) from exc
    except SecretUnreadable as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LemlistError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.detail) from exc

    return LemlistSyncResult(
        campaigns=report.campaigns,
        contacts_created=report.contacts_created,
        contacts_updated=report.contacts_updated,
        engagements=report.engagements,
        failures=report.failures,
    )


@router.post("/webhook/register", response_model=Message)
async def register_webhook(db: DbSession, user: CurrentUser) -> Message:
    """
    Registers the callback with lemlist, or reports why it cannot be.

    Separate from connect so it can be retried once a tunnel is running, without asking somebody to paste
    their key again — which, since lemlist shows a key only once, they may not be able to do.
    """
    connection = await _require_connection(db, user.id)
    try:
        hook = await lemlist_sync.register_webhook(db, connection)
    except LemlistError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.detail) from exc
    return Message(detail=f"Webhook registered with lemlist ({hook.lemlist_hook_id or 'no id returned'})")


@router.get("/campaigns", response_model=list[LemlistCampaignRead])
async def list_campaigns(db: DbSession, user: CurrentUser) -> list[LemlistCampaignRead]:
    """
    The mirrored campaign list, read without touching lemlist.

    Free and instant, so the Integrations page can open on it. `POST /campaigns/refresh` is what goes and
    asks lemlist whether the list has changed.
    """
    connection = await _require_connection(db, user.id)
    campaigns = await lemlist_sync.campaigns_for(db, connection)
    return [_campaign_read(campaign) for campaign in campaigns]


@router.get("/contacts", response_model=list[LemlistContactRead])
async def list_lemlist_contacts(
    db: DbSession,
    user: CurrentUser,
    campaign_id: uuid.UUID | None = Query(default=None),
    state: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
) -> list[LemlistContactRead]:
    """
    The imported prospects. **Never queries lemlist** — this reads the CRM's own tables, by design.

    The engagement count and score come from one grouped query rather than a lookup per row: this list is
    the Contacts page, and an N+1 across a few thousand prospects to render a score column would be the
    slowest thing in the application.
    """
    connection = await _require_connection(db, user.id)

    stmt = (
        select(LemlistContact, LemlistCampaign.name)
        .join(LemlistCampaign, LemlistCampaign.id == LemlistContact.campaign_id)
        .where(LemlistContact.connection_id == connection.id)
        .order_by(LemlistContact.last_activity_at.desc().nulls_last(), LemlistContact.email)
        .limit(limit)
    )
    if campaign_id is not None:
        stmt = stmt.where(LemlistContact.campaign_id == campaign_id)
    if state:
        stmt = stmt.where(LemlistContact.state == state)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            LemlistContact.email.ilike(pattern)
            | LemlistContact.first_name.ilike(pattern)
            | LemlistContact.last_name.ilike(pattern)
            | LemlistContact.company_name.ilike(pattern)
        )

    rows = (await db.execute(stmt)).unique().all()
    if not rows:
        return []

    ids = [contact.id for contact, _ in rows]

    kinds_stmt = select(LemlistEngagement.lemlist_contact_id, LemlistEngagement.kind).where(
        LemlistEngagement.lemlist_contact_id.in_(ids)
    )
    kinds: dict[uuid.UUID, list[str]] = {}
    for contact_id, kind in (await db.execute(kinds_stmt)).all():
        kinds.setdefault(contact_id, []).append(kind)

    return [
        LemlistContactRead(
            id=contact.id,
            email=contact.email,
            full_name=contact.full_name,
            first_name=contact.first_name,
            last_name=contact.last_name,
            company_name=contact.company_name,
            job_title=contact.job_title,
            phone=contact.phone,
            linkedin_url=contact.linkedin_url,
            state=contact.state,
            campaign_id=contact.campaign_id,
            campaign_name=campaign_name,
            last_activity_at=contact.last_activity_at,
            engagement_count=len(kinds.get(contact.id, [])),
            engagement_score=lemlist_sync.engagement_score(contact, kinds.get(contact.id, [])),
            funnel_step=lemlist_sync.funnel_step(contact.state, kinds.get(contact.id, [])),
            dead_end=lemlist_sync.is_dead_end(contact.state),
            variables=contact.variables,
            contact_id=contact.contact_id,
        )
        for contact, campaign_name in rows
    ]


@router.get("/contacts/{lemlist_contact_id}/timeline", response_model=list[LemlistEngagementRead])
async def read_timeline(
    db: DbSession, user: CurrentUser, lemlist_contact_id: uuid.UUID
) -> list[LemlistEngagement]:
    """Everything that has happened to one prospect, newest first."""
    connection = await _require_connection(db, user.id)

    contact = await db.get(LemlistContact, lemlist_contact_id)
    if contact is None or contact.connection_id != connection.id:
        # Reported as missing rather than forbidden: a 403 would confirm somebody else's prospect exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such prospect")

    stmt = (
        select(LemlistEngagement)
        .where(LemlistEngagement.lemlist_contact_id == contact.id)
        .order_by(LemlistEngagement.occurred_at.desc())
    )
    return list((await db.execute(stmt)).scalars())


@router.post("/contacts/{lemlist_contact_id}/promote", response_model=Message)
async def promote_contact(
    db: DbSession, user: CurrentUser, lemlist_contact_id: uuid.UUID, payload: LemlistPromoteRequest
) -> Message:
    """
    Files an imported prospect as a real CRM contact, at an account the caller names.

    This is the bridge between the two halves of the design. Imported leads deliberately do not live in
    `contacts` — that table requires a filed account, and a cold list is mostly companies nobody has decided
    to work. Promotion is the moment somebody makes that decision, and it is a human decision because
    matching "Acme" in an export to "Acme Corporation" in the accounts table is exactly the guess the
    duplicate-account search exists to stop being made carelessly.

    Idempotent: promoting twice returns the same contact rather than filing a second one.
    """
    connection = await _require_connection(db, user.id)

    prospect = await db.get(LemlistContact, lemlist_contact_id)
    if prospect is None or prospect.connection_id != connection.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such prospect")

    if prospect.contact_id is not None:
        return Message(detail="This prospect is already filed as a contact")

    account = await db.get(Account, payload.account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # An existing contact at that account with the same email is the one to link to, not a second row: the
    # partial unique index on (account_id, email) would refuse the insert anyway, and linking is what the
    # caller meant.
    existing = (await db.execute(
        select(Contact).where(
            Contact.account_id == payload.account_id,
            func.lower(Contact.email) == prospect.email.lower(),
        )
    )).scalars().first()

    if existing is None:
        existing = Contact(
            account_id=payload.account_id,
            full_name=prospect.full_name,
            email=prospect.email,
            phone=prospect.phone,
            linkedin_url=prospect.linkedin_url,
            designation=prospect.job_title,
            # `contact_type` has no default and is NOT NULL, so it has to be stated. Customer, because
            # outreach is aimed at people being sold *to* — a partner relationship is something somebody
            # sets up deliberately, not something a cold campaign discovers. Editable afterwards like any
            # other contact.
            contact_type=ContactType.CUSTOMER,
        )
        db.add(existing)
        await db.flush()

    prospect.contact_id = existing.id
    await db.commit()
    return Message(detail=f"{prospect.full_name} filed at {account.name}")


# --- The callback ------------------------------------------------------------

webhook_router = APIRouter(prefix="/integrations/lemlist", tags=["lemlist"])


@webhook_router.post("/webhook", response_model=Message)
async def receive_webhook(db: DbSession, request: Request) -> Message:
    """
    Receives one event from lemlist. Unauthenticated by necessity, authorised by the shared secret.

    Returns 200 for anything it understood, **including an event it chose to ignore** — an event for a lead
    that has not been imported yet is not a failure, and answering with a 5xx would have lemlist retry it on
    a schedule we do not control until it gave up. Only a bad secret is refused, and only a genuinely broken
    body is a 400.
    """
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Webhook body was not JSON"
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Webhook body was not an object")

    try:
        outcome = await lemlist_sync.handle_webhook_event(db, payload)
    except PermissionError as exc:
        # 401 with no detail about which part failed: this endpoint is public, and a precise message would
        # help somebody probe for a valid secret.
        logger.warning("Rejected lemlist webhook: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unrecognised webhook"
        ) from exc

    logger.info("lemlist webhook: %s", outcome)
    return Message(detail=outcome)


def _campaign_read(campaign: LemlistCampaign) -> LemlistCampaignRead:
    """
    A campaign on the wire, with `importing` derived rather than stored.

    Derived because a stored flag is what broke: the process that sets it is the only one that clears it, so
    anything that kills that process leaves a campaign claiming to import forever. Asking whether the start
    stamp is recent enough to believe has no such state to go stale.
    """
    return LemlistCampaignRead(
        id=campaign.id,
        lemlist_id=campaign.lemlist_id,
        name=campaign.name,
        status=campaign.status,
        lead_count=campaign.lead_count,
        remote_created_at=campaign.remote_created_at,
        imported_at=campaign.imported_at,
        importing=lemlist_sync.import_in_progress(campaign),
        import_error=campaign.import_error,
    )


async def _status(db: DbSession, connection: LemlistConnection) -> LemlistStatus:
    campaign_rows = list((await db.execute(
        select(LemlistCampaign).where(LemlistCampaign.connection_id == connection.id)
    )).scalars())
    campaigns = len(campaign_rows)
    imported = sum(1 for c in campaign_rows if c.imported_at is not None)
    contacts = (await db.execute(
        select(func.count(LemlistContact.id)).where(LemlistContact.connection_id == connection.id)
    )).scalar_one()
    hooks = (await db.execute(
        select(func.count(LemlistWebhook.id)).where(LemlistWebhook.connection_id == connection.id)
    )).scalar_one()
    engagements = (await db.execute(
        select(func.count(LemlistEngagement.id)).where(LemlistEngagement.connection_id == connection.id)
    )).scalar_one()
    live = (await db.execute(
        select(func.count(LemlistEngagement.id)).where(
            LemlistEngagement.connection_id == connection.id,
            LemlistEngagement.from_webhook.is_(True),
        )
    )).scalar_one()

    return LemlistStatus(
        connected=True,
        team_id=connection.team_id,
        team_name=connection.team_name,
        key_fingerprint=connection.api_key_fingerprint,
        connected_at=connection.connected_at,
        last_sync_at=connection.last_sync_at,
        last_sync_error=connection.last_sync_error,
        # Derived from the campaigns, never stored. There is no workspace-level status flag left to go
        # stale: `syncing` means a campaign is genuinely importing right now, and `error` means one of them
        # failed and is saying so on its own row.
        sync_status=(
            LemlistSyncStatus.SYNCING
            if any(lemlist_sync.import_in_progress(c) for c in campaign_rows)
            else LemlistSyncStatus.ERROR
            if any(c.import_error for c in campaign_rows)
            else LemlistSyncStatus.IDLE
        ),
        campaigns=campaigns,
        imported_campaigns=imported,
        contacts=contacts,
        engagements=engagements,
        live_engagements=live,
        webhook_registered=bool(hooks),
        webhook_target_url=lemlist_sync.webhook_target_url(),
    )
