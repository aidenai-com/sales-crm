"""
The tools the assistant may call, and the only route from a question to the database.

**Every query here goes through `permissions.scope_*`.** That is the whole security model of
this feature, and it is worth being blunt about why: the assistant is a natural-language
interface to a database, and a rep who cannot see Marcus's deals in the UI must not be able to
ask for them in prose. Without scoping, "what are the biggest deals this quarter?" becomes a
permission bypass with a friendly tone.

So no tool takes an owner filter as a free parameter, no tool accepts raw SQL, and no tool reads
a table the viewer could not already list through the API. The model chooses *which* question to
ask; it never chooses whose data answers it.

Tools return plain dicts of already-aggregated numbers rather than rows. A model handed 400 deal
records will summarise them badly and bill for the privilege; handed a total and a breakdown, it
reports them correctly.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Awaitable, Callable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core import permissions
from app.models import Account, Activity, Deal, Lead, Stage, StageKind, User
from app.repositories import deals as deals_repo
from app.services import health

#: The tool schemas sent to the model. Descriptions are written for the model, not for us: each
#: says what the tool answers and, where it matters, what it deliberately does not.
TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "pipeline_summary",
            "description": (
                "Totals for the open pipeline the current user can see: open value, deal count, "
                "and a per-stage breakdown in pipeline order. Use this for any question about "
                "pipeline size or stage distribution. There is no weighted or expected value."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "deals_needing_attention",
            "description": (
                "Deals that are at risk, newest first, with the reason: 'overdue' when the close "
                "date has passed, or 'stalled' when nothing has been logged for over 21 days. "
                "Use this for questions about risk, neglected deals, or what to work on."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "minimum": 1, "maximum": 25, "default": 10}
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_deals",
            "description": (
                "Search deals by name or account name. Returns stage, value, owner, close date "
                "and health for each match. Use this when the user names a specific deal, "
                "company, or account."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Part of a deal or account name."},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 25, "default": 10},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recent_activity",
            "description": (
                "The most recent activity the user can see, newest first, with kind, summary and "
                "which record it is against. Use this for questions about what has been "
                "happening lately."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "minimum": 1, "maximum": 90, "default": 14},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 30, "default": 15},
                },
                "additionalProperties": False,
            },
        },
    },
]


def _money(value: Decimal | int | float | None) -> float:
    """Decimal is not JSON-serialisable, and the model reads numbers, not strings."""
    return round(float(value or 0), 2)


async def _visible_open_deals(db: AsyncSession, viewer: User) -> list[Deal]:
    stmt = (
        select(Deal)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Stage.kind == StageKind.OPEN.value)
        .options(joinedload(Deal.stage), joinedload(Deal.account), joinedload(Deal.owner))
    )
    result = await db.execute(permissions.scope_deals(stmt, viewer))
    return list(result.unique().scalars())


async def pipeline_summary(db: AsyncSession, viewer: User) -> dict[str, Any]:
    deals = await _visible_open_deals(db, viewer)

    by_stage: dict[uuid.UUID, dict[str, Any]] = {}
    total_open = Decimal("0")

    for deal in deals:
        total_open += deal.value

        slot = by_stage.setdefault(
            deal.stage_id,
            {
                "stage": deal.stage.name,
                "probability": deal.stage.probability,
                "position": deal.stage.position,
                "deals": 0,
                "open_value": Decimal("0"),
            },
        )
        slot["deals"] += 1
        slot["open_value"] += deal.value

    stages = sorted(by_stage.values(), key=lambda row: row["position"])
    for row in stages:
        row.pop("position")
        row["open_value"] = _money(row["open_value"])

    return {
        "currency": "USD",
        "open_deals": len(deals),
        "open_value": _money(total_open),
        # Stated explicitly because the model will otherwise reach for the arithmetic itself: a stage's
        # percentage is how far along the deal is, not a likelihood, so multiplying money by it produces
        # nothing meaningful. The assistant must not offer a weighted or expected figure.
        "note": (
            "`probability` is the stage's progression marker, not a win likelihood. Do not multiply value "
            "by it and do not report a weighted or expected value — no such figure exists in this CRM."
        ),
        "by_stage": stages,
    }


async def deals_needing_attention(
    db: AsyncSession, viewer: User, limit: int = 10
) -> dict[str, Any]:
    deals = await _visible_open_deals(db, viewer)
    touched = await deals_repo.last_activity_map(db)
    now = datetime.now(timezone.utc)
    today = now.date()

    rows: list[dict[str, Any]] = []
    for deal in deals:
        state = health.deal_health(deal, touched.get(deal.id), today=today, now=now)  # type: ignore[arg-type]
        if state is not health.Health.AT_RISK:
            continue

        days_overdue = (today - deal.expected_close_date).days
        last = touched.get(deal.id) or deal.created_at
        if isinstance(last, datetime) and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        quiet_days = (now - last).days if isinstance(last, datetime) else None

        rows.append(
            {
                "deal": deal.name,
                "account": deal.account.name,
                "owner": deal.owner.full_name,
                "stage": deal.stage.name,
                "value": _money(deal.value),
                "expected_close": deal.expected_close_date.isoformat(),
                # The two causes need opposite responses, so the reason travels with the row.
                "reason": "overdue" if days_overdue > 0 else "stalled",
                "days_overdue": max(0, days_overdue),
                "days_since_activity": quiet_days,
            }
        )

    rows.sort(key=lambda row: (-row["days_overdue"], -(row["days_since_activity"] or 0)))
    return {"count": len(rows), "deals": rows[:limit]}


async def find_deals(
    db: AsyncSession, viewer: User, query: str, limit: int = 10
) -> dict[str, Any]:
    term = f"%{query.strip()}%"
    stmt = (
        select(Deal)
        .join(Account, Account.id == Deal.account_id)
        .where(Deal.name.ilike(term) | Account.name.ilike(term))
        .options(joinedload(Deal.stage), joinedload(Deal.account), joinedload(Deal.owner))
        .limit(limit)
    )
    result = await db.execute(permissions.scope_deals(stmt, viewer))
    deals = list(result.unique().scalars())

    touched = await deals_repo.last_activity_map(db)
    now = datetime.now(timezone.utc)

    return {
        "matches": [
            {
                "deal": deal.name,
                "account": deal.account.name,
                "owner": deal.owner.full_name,
                "stage": deal.stage.name,
                "probability": deal.stage.probability,
                "value": _money(deal.value),
                "expected_close": deal.expected_close_date.isoformat(),
                "health": health.deal_health(deal, touched.get(deal.id), now=now).value,  # type: ignore[arg-type]
            }
            for deal in deals
        ]
    }


async def recent_activity(
    db: AsyncSession, viewer: User, days: int = 14, limit: int = 15
) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        select(Activity)
        .where(Activity.occurred_at >= since)
        .order_by(Activity.occurred_at.desc())
        .limit(limit)
        .options(joinedload(Activity.author), joinedload(Activity.deal), joinedload(Activity.lead), joinedload(Activity.account))
    )
    result = await db.execute(permissions.scope_activities(stmt, viewer))

    entries = []
    for activity in result.unique().scalars():
        subject = (
            activity.deal.name
            if activity.deal is not None
            else activity.lead.business_unit
            if activity.lead is not None
            else activity.account.name
            if activity.account is not None
            else "unknown"
        )
        entries.append(
            {
                "kind": activity.kind.value,
                "summary": activity.summary,
                "about": subject,
                "by": activity.author.full_name,
                "when": activity.occurred_at.isoformat(),
            }
        )

    return {"window_days": days, "activity": entries}


#: Name to implementation. The dispatcher below is the only thing that reads this, and a name the
#: model invents simply is not here — an unknown tool is reported back to it as an error rather
#: than crashing the turn.
HANDLERS: dict[str, Callable[..., Awaitable[dict[str, Any]]]] = {
    "pipeline_summary": pipeline_summary,
    "deals_needing_attention": deals_needing_attention,
    "find_deals": find_deals,
    "recent_activity": recent_activity,
}


async def dispatch(
    db: AsyncSession, viewer: User, name: str, arguments: dict[str, Any]
) -> dict[str, Any]:
    """
    Run one tool call.

    Failures are returned as data, not raised. A tool that raises kills the whole answer; a tool
    that reports "that did not work" lets the model say so, or try a different one. Arguments are
    filtered against the handler's signature because a model will occasionally invent a keyword,
    and an unexpected-keyword TypeError should not end the conversation.
    """
    handler = HANDLERS.get(name)
    if handler is None:
        return {"error": f"There is no tool called {name!r}."}

    allowed = handler.__code__.co_varnames[: handler.__code__.co_argcount]
    kwargs = {key: value for key, value in (arguments or {}).items() if key in allowed}

    try:
        return await handler(db, viewer, **kwargs)
    except Exception as exc:  # noqa: BLE001 — surfaced to the model, logged by the caller
        return {"error": f"{name} failed: {exc}"}


async def deal_detail(db: AsyncSession, viewer: User, deal_id: str) -> dict[str, Any]:
    """
    Everything about one deal, for context-scoped questions.

    Not exposed as a schema the model can call with an arbitrary id it invented — it is reachable,
    but every read still passes through `scope_deals`, so an id the viewer cannot see returns
    "not found" rather than data. That is the same answer they would get from the REST API.
    """
    try:
        identifier = uuid.UUID(str(deal_id))
    except (ValueError, AttributeError):
        return {"error": "That is not a valid deal id."}

    stmt = (
        select(Deal)
        .where(Deal.id == identifier)
        .options(
            joinedload(Deal.stage),
            joinedload(Deal.account),
            joinedload(Deal.owner),
            joinedload(Deal.lead),
        )
    )
    result = await db.execute(permissions.scope_deals(stmt, viewer))
    deal = result.unique().scalar_one_or_none()
    if deal is None:
        return {"error": "No deal with that id is visible to you."}

    touched = (await deals_repo.last_activity_map(db)).get(deal.id)
    now = datetime.now(timezone.utc)
    state = health.deal_health(deal, touched, now=now)  # type: ignore[arg-type]

    recent = await db.execute(
        select(Activity)
        .where(Activity.deal_id == deal.id)
        .order_by(Activity.occurred_at.desc())
        .limit(8)
        .options(joinedload(Activity.author))
    )

    return {
        "deal": deal.name,
        "account": deal.account.name,
        "business_unit": deal.lead.business_unit if deal.lead is not None else None,
        "owner": deal.owner.full_name,
        "stage": deal.stage.name,
        "probability": deal.stage.probability,
        "value": _money(deal.value),
        "expected_close": deal.expected_close_date.isoformat(),
        "health": state.value,
        "days_since_activity": (now - (touched or deal.created_at).replace(tzinfo=timezone.utc)).days
        if (touched or deal.created_at)
        else None,
        "recent_activity": [
            {
                "kind": activity.kind.value,
                "summary": activity.summary,
                "by": activity.author.full_name,
                "when": activity.occurred_at.isoformat(),
            }
            for activity in recent.unique().scalars()
        ],
    }


TOOL_SCHEMAS.append(
    {
        "type": "function",
        "function": {
            "name": "deal_detail",
            "description": (
                "Full detail for one deal by id: stage, value, owner, close date, health, "
                "and its recent activity. Use this whenever the user says "
                "'this deal' or asks about the deal named in the context note."
            ),
            "parameters": {
                "type": "object",
                "properties": {"deal_id": {"type": "string", "description": "The deal's UUID."}},
                "required": ["deal_id"],
                "additionalProperties": False,
            },
        },
    }
)
HANDLERS["deal_detail"] = deal_detail
