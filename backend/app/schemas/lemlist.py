"""
Wire shapes for the lemlist integration.

One rule governs all of them: **the API key never appears in a response.** Not masked, not truncated, not
in a debug field. What the UI needs in order to be useful is "are we connected, to which workspace, with
which key" — and `key_fingerprint` answers the third without revealing any part of the key.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.models.enums import LemlistSyncStatus
from app.schemas.common import ORMModel, PayloadModel


class LemlistConnectRequest(PayloadModel):
    #: lemlist keys are opaque; no length or charset is validated beyond non-empty, because guessing their
    #: format would reject a valid key the day lemlist changes it. The key is verified against lemlist
    #: before anything is stored, which is a far better check than a regular expression.
    api_key: str = Field(min_length=8, max_length=500)


class LemlistStatus(ORMModel):
    """Whether this user has connected lemlist, and how the last import went."""

    connected: bool
    team_id: str = ""
    team_name: str = ""
    #: Eight hex characters derived from the key's hash. Enough to tell two keys apart, useless as a key.
    key_fingerprint: str = ""
    connected_at: datetime | None = None
    last_sync_at: datetime | None = None
    last_sync_error: str = ""
    #: Derived from the campaigns rather than stored on the connection. `syncing` means one is importing now.
    sync_status: LemlistSyncStatus = LemlistSyncStatus.IDLE
    #: How many campaigns lemlist lists for this workspace, and how many of those have been mirrored. The
    #: gap between them is the honest picture of a workspace: listing is free, importing is a choice.
    campaigns: int = 0
    imported_campaigns: int = 0
    contacts: int = 0
    engagements: int = 0
    #: How many of those arrived by webhook rather than by import. The ratio is the only honest answer to
    #: "is this integration actually live", which is a different question from "is it connected" — a hook can
    #: be registered and still never fire, and nothing else on this screen would reveal that.
    live_engagements: int = 0
    #: False when no public callback URL is configured, so the UI can explain why events are not arriving
    #: instead of leaving somebody to conclude the integration is broken.
    webhook_registered: bool = False
    webhook_target_url: str = ""


class LemlistSyncResult(ORMModel):
    """What a sync did. Numbers a user can check against lemlist's own screens."""

    campaigns: int
    contacts_created: int
    contacts_updated: int
    engagements: int
    #: Campaigns that failed, named, with the reason. A partial import reports as partial.
    failures: list[str] = Field(default_factory=list)


class LemlistCampaignRead(ORMModel):
    """
    A campaign as the Integrations page reads it.

    Listing a campaign and importing it are separate acts, and these three fields are what make the
    difference visible: `imported_at` null means listed but never mirrored, a value means mirrored and
    refreshable, and `importing` means one is running now.
    """

    id: uuid.UUID
    lemlist_id: str
    name: str
    status: str
    lead_count: int
    remote_created_at: datetime | None = None
    #: When this campaign's leads and activity were last mirrored. Null means never.
    imported_at: datetime | None = None
    #: True while an import is genuinely in flight. Derived from the start stamp against a TTL rather than
    #: read from a stored flag, so an import killed mid-flight stops claiming to be running.
    importing: bool = False
    #: Why this campaign's last import failed, empty when it did not.
    import_error: str = ""


class LemlistContactRead(ORMModel):
    """
    An imported prospect, as the Contacts page reads them.

    `contact_id` is the promotion link: null means this is still only a lemlist prospect, and a value means
    somebody has filed them as a real contact against a real account. The page needs the distinction because
    the two support different actions — you can add a filed contact to a deal, and you cannot add a cold lead
    to one until somebody decides which company it is.
    """

    id: uuid.UUID
    email: str
    full_name: str
    first_name: str
    last_name: str
    company_name: str
    job_title: str
    phone: str
    linkedin_url: str
    state: str
    campaign_id: uuid.UUID
    campaign_name: str
    last_activity_at: datetime | None = None
    engagement_count: int = 0
    #: Derived on read from the engagement history — see `lemlist_sync.engagement_score`.
    engagement_score: int = 0
    #: How far along the outreach sequence they got, 0–5. Derived; see `lemlist_sync.funnel_step`.
    funnel_step: int = 0
    #: Bounced or unsubscribed. A closed door rather than a low score, and drawn differently.
    dead_end: bool = False
    variables: dict[str, Any] = Field(default_factory=dict)
    contact_id: uuid.UUID | None = None


class LemlistEngagementRead(ORMModel):
    """One event in a prospect's timeline."""

    id: uuid.UUID
    kind: str
    occurred_at: datetime
    from_webhook: bool
    payload: dict[str, Any] = Field(default_factory=dict)


class LemlistPromoteRequest(PayloadModel):
    """
    Filing an imported prospect as a real CRM contact.

    The account is named by the caller rather than matched from `company_name`, deliberately. "Acme" in a
    lemlist export and "Acme Corporation" in the accounts table are a judgement call, and guessing it wrong
    attaches somebody to the wrong company — which is exactly the mistake the duplicate-account search
    exists to prevent a human making by accident.
    """

    account_id: uuid.UUID
