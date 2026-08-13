"""
The lemlist HTTP client.

Everything specific to lemlist's wire protocol lives here, so the sync service reads as "fetch campaigns,
fetch leads" and nothing above this module knows about Basic auth, cursors, or 429s.

Verified against lemlist's developer documentation (August 2026):

  base URL      https://api.lemlist.com/api
  auth          HTTP Basic with an *empty username* and the API key as the password, i.e. the header is
                `Authorization: Basic base64(":" + apiKey)`. The leading colon is not optional and is the
                single most common way to get a 401 here.
  rate limit    20 requests per 2 seconds, per workspace.

Endpoint shapes are as documented, but two details are **assumed rather than confirmed** and are marked at
their call sites: the exact pagination parameters for large collections, and whether the export endpoint
returns JSON or CSV for a given `format`. Both are handled defensively — pagination stops when a page comes
back short or repeats, and the export parser accepts either shape — so a wrong assumption degrades to
fetching less rather than to importing corrupted data.
"""

import asyncio
import base64
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.lemlist.com/api"

#: lemlist allows 20 requests per 2 seconds. The floor below is deliberately more conservative than the
#: ceiling: the limit is per *workspace*, so the user's own browser session and any other tool they have
#: connected are spending from the same budget, and a sync that consumes all of it would make lemlist
#: unusable for them while it ran.
MIN_INTERVAL_SECONDS = 0.15

#: A page size lemlist accepts on collection endpoints. Larger pages mean fewer requests against the rate
#: limit, which for a full import is the dominant cost.
PAGE_SIZE = 100

#: Stop after this many pages of one collection. A guard against a pagination parameter that is silently
#: ignored — which would otherwise return page one forever and loop until the process was killed.
MAX_PAGES = 200

REQUEST_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class LemlistError(Exception):
    """Anything that went wrong talking to lemlist, carrying a sentence fit to show a user."""

    def __init__(self, detail: str, *, status_code: int | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class LemlistAuthError(LemlistError):
    """The API key was rejected. Distinct because it is the one failure the user can fix themselves."""


class LemlistRateLimited(LemlistError):
    """Still rate limited after retrying. Distinct so a sync can stop rather than hammer."""


class LemlistClient:
    """
    One client per API key. Not shared between users, and not long-lived.

    Rate limiting is per instance, which is correct precisely because the limit is per workspace and an
    instance belongs to one workspace. Two users syncing at once do not throttle each other, and one user
    cannot outrun their own budget.
    """

    def __init__(self, api_key: str) -> None:
        if not api_key.strip():
            raise LemlistAuthError("No API key was provided.")
        self._api_key = api_key.strip()
        # Built once. The colon is what makes the username empty.
        token = base64.b64encode(f":{self._api_key}".encode()).decode()
        self._headers = {"Authorization": f"Basic {token}", "Accept": "application/json"}
        self._client: httpx.AsyncClient | None = None
        self._next_allowed_at = 0.0
        self._lock = asyncio.Lock()

    async def __aenter__(self) -> "LemlistClient":
        self._client = httpx.AsyncClient(base_url=BASE_URL, headers=self._headers, timeout=REQUEST_TIMEOUT)
        return self

    async def __aexit__(self, *_exc: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _throttle(self) -> None:
        """
        Spaces requests out. Serialised by a lock so concurrent callers queue rather than all reading the
        same "next allowed" instant and firing together — which is how a naive sleep-based limiter
        produces exactly the burst it was written to prevent.
        """
        async with self._lock:
            loop = asyncio.get_running_loop()
            wait = self._next_allowed_at - loop.time()
            if wait > 0:
                await asyncio.sleep(wait)
            self._next_allowed_at = loop.time() + MIN_INTERVAL_SECONDS

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        if self._client is None:
            raise LemlistError("The lemlist client is being used outside its context manager.")

        # Two attempts, then give up. A 429 here means the workspace budget is genuinely exhausted, and
        # retrying indefinitely would keep it that way for whatever else the user has connected.
        for attempt in range(2):
            await self._throttle()
            try:
                response = await self._client.request(method, path, **kwargs)
            except httpx.TimeoutException as exc:
                raise LemlistError("lemlist did not respond in time. Try again shortly.") from exc
            except httpx.HTTPError as exc:
                raise LemlistError(f"Could not reach lemlist: {exc}") from exc

            if response.status_code == 429:
                if attempt == 0:
                    # Honour Retry-After when it is offered; otherwise back off by a full window.
                    delay = float(response.headers.get("Retry-After") or 2.0)
                    logger.warning("lemlist rate limited on %s; waiting %.1fs", path, delay)
                    await asyncio.sleep(delay)
                    continue
                raise LemlistRateLimited(
                    "lemlist is rate limiting this workspace. The sync stopped and can be resumed.",
                    status_code=429,
                )

            if response.status_code in (401, 403):
                raise LemlistAuthError(
                    "lemlist rejected the API key. Check it in lemlist under Settings → Integrations, "
                    "and note that a key can only be viewed once — if it was lost, generate a new one.",
                    status_code=response.status_code,
                )

            if response.status_code == 404:
                raise LemlistError("lemlist has no such record.", status_code=404)

            if response.status_code >= 400:
                # The body is included because lemlist's messages are specific and useful, but truncated
                # because an HTML error page from a proxy is not something to paste into a user's screen.
                raise LemlistError(
                    f"lemlist returned {response.status_code}: {response.text[:200]}",
                    status_code=response.status_code,
                )

            return response

        raise LemlistError("lemlist could not be reached after retrying.")

    async def _get_json(self, path: str, **params: Any) -> Any:
        response = await self._request("GET", path, params={k: v for k, v in params.items() if v is not None})
        if not response.content:
            return []
        try:
            return response.json()
        except ValueError as exc:
            raise LemlistError(f"lemlist returned a response that is not JSON, from {path}.") from exc

    # --- Endpoints ----------------------------------------------------------

    async def verify(self) -> dict[str, Any]:
        """
        `GET /team` — the credential check.

        Used rather than a campaign list because it is cheap, it exists on every account including one with
        no campaigns yet, and it returns the workspace identity that the connection record needs anyway.
        """
        data = await self._get_json("/team")
        # lemlist has returned both a bare object and a single-element list here across versions. Accepting
        # either costs two lines and turns a breaking change into a non-event.
        if isinstance(data, list):
            data = data[0] if data else {}
        if not isinstance(data, dict):
            raise LemlistError("lemlist returned an unexpected shape for the team.")
        return data

    async def campaigns(self) -> list[dict[str, Any]]:
        """
        `GET /campaigns` — every campaign in the workspace.

        Paginated with `page` and `limit`. **Assumed**, not confirmed from the docs: that `page` is
        honoured and one-based. If it is ignored, page two returns the same ids as page one, and the
        duplicate check below stops the walk rather than looping — which is why that check is here and not
        an optimisation.
        """
        found: list[dict[str, Any]] = []
        seen: set[str] = set()

        for page in range(1, MAX_PAGES + 1):
            batch = await self._get_json("/campaigns", page=page, limit=PAGE_SIZE)
            if not isinstance(batch, list) or not batch:
                break

            fresh = [c for c in batch if str(c.get("_id") or c.get("id") or "") not in seen]
            if not fresh:
                logger.info("lemlist /campaigns page %d repeated; stopping", page)
                break

            for campaign in fresh:
                seen.add(str(campaign.get("_id") or campaign.get("id") or ""))
            found.extend(fresh)

            if len(batch) < PAGE_SIZE:
                break

        return found

    async def campaign(self, campaign_id: str) -> dict[str, Any]:
        """`GET /campaigns/{id}` — the detail, for status, owner and mailbox."""
        data = await self._get_json(f"/campaigns/{campaign_id}")
        return data if isinstance(data, dict) else {}

    async def campaign_leads(self, campaign_id: str) -> list[dict[str, Any]]:
        """
        `GET /campaigns/{id}/leads` — the lead list with current state.

        Kept alongside the export because the two answer different questions: this one is the authority on
        `state`, and the export is the authority on the lead's *fields*. The import uses both.
        """
        found: list[dict[str, Any]] = []
        for page in range(1, MAX_PAGES + 1):
            batch = await self._get_json(
                f"/campaigns/{campaign_id}/leads", page=page, limit=PAGE_SIZE, state="all"
            )
            if not isinstance(batch, list) or not batch:
                break
            found.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
        return found

    async def export_leads(self, campaign_id: str) -> list[dict[str, Any]]:
        """
        `GET /campaigns/{id}/export/leads` — the primary import: full lead records.

        **Assumed**, not confirmed: that `format=json` is honoured. The documentation describes this
        endpoint as a CSV download, so the parser below accepts either — a JSON array, or CSV text it
        converts. Getting this wrong in the optimistic direction would mean importing a single lead whose
        every field was a column header, so it is worth the twenty lines.
        """
        response = await self._request(
            "GET",
            f"/campaigns/{campaign_id}/export/leads",
            params={"state": "all", "format": "json"},
        )
        if not response.content:
            return []

        content_type = response.headers.get("content-type", "")
        if "json" in content_type:
            data = response.json()
            return data if isinstance(data, list) else []

        return _parse_csv_leads(response.text)

    async def activities(
        self, *, campaign_id: str | None = None, limit: int = PAGE_SIZE
    ) -> AsyncIterator[dict[str, Any]]:
        """
        `GET /activities` — the engagement history, newest first.

        Yielded rather than returned as a list: a busy workspace has tens of thousands of activities, and
        the caller stops as soon as it reaches ones it has already stored. Materialising the whole history
        to import the last day of it would be the wrong shape.

        **Assumed**: `offset` for paging. Same defence as `campaigns` — a repeated page ends the walk.
        """
        seen: set[str] = set()

        for page in range(MAX_PAGES):
            batch = await self._get_json(
                "/activities", campaignId=campaign_id, limit=limit, offset=page * limit
            )
            if not isinstance(batch, list) or not batch:
                return

            progressed = False
            for activity in batch:
                key = str(activity.get("_id") or "")
                if key and key in seen:
                    continue
                if key:
                    seen.add(key)
                progressed = True
                yield activity

            if not progressed or len(batch) < limit:
                return

    async def create_hook(
        self, *, target_url: str, secret: str, event_type: str | None = None
    ) -> dict[str, Any]:
        """
        `POST /hooks` — register a webhook.

        `type` omitted means every event, which is what this integration wants: one hook rather than
        thirty, and unknown future event types arrive rather than being silently dropped by a subscription
        list written today.

        `secret` is echoed back in every callback and is how the inbound handler authenticates a POST.
        lemlist stores it encrypted, never returns it from `GET /hooks`, and it cannot be changed after
        creation — so losing our copy means deleting the hook and making a new one.
        """
        body: dict[str, Any] = {"targetUrl": target_url, "secret": secret}
        if event_type:
            body["type"] = event_type

        response = await self._request("POST", "/hooks", json=body)
        data = response.json() if response.content else {}
        return data if isinstance(data, dict) else {}

    async def hooks(self) -> list[dict[str, Any]]:
        """`GET /hooks` — what is already registered, so registration can be idempotent."""
        data = await self._get_json("/hooks")
        return data if isinstance(data, list) else []

    async def delete_hook(self, hook_id: str) -> None:
        """`DELETE /hooks/{id}` — used when disconnecting, so we stop being sent somebody's data."""
        await self._request("DELETE", f"/hooks/{hook_id}")


def _parse_csv_leads(text: str) -> list[dict[str, Any]]:
    """
    Turns lemlist's CSV export into the same dictionaries the JSON export would give.

    Here rather than in the caller so that "what the export returns" is one shape everywhere above this
    module, whichever content type lemlist chose to send.
    """
    import csv
    import io

    rows = list(csv.DictReader(io.StringIO(text)))
    # A header-only file is an empty campaign, not a failure.
    return [{k: v for k, v in row.items() if k} for row in rows]
