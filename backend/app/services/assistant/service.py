"""
The conversation loop: ask the model, run any tools it asks for, ask again, stream the answer.

Yields events for the HTTP layer to forward as server-sent events. The shapes are deliberately
small — `{"type": "token"}`, `{"type": "tool"}`, `{"type": "done"}` — because the client renders
them as they arrive and a fat event format would just be parsed and thrown away.
"""

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core import permissions
from app.core.config import settings
from app.models import Account, AssistantUsage, Deal, Lead, User
from app.services.assistant import tools as tool_registry
from app.services.assistant.pricing import cost_for
from app.services.assistant.provider import ProviderError, get_provider

logger = logging.getLogger("app.assistant")

#: Kept short and specific. A long persona costs input tokens on every single call and mostly
#: teaches the model to be chatty; what it actually needs is the shape of the data and the two
#: house rules it would otherwise get wrong.
SYSTEM_PROMPT = """You are the assistant inside a B2B sales CRM. You answer questions about \
pipeline, deals, accounts, contacts and activity.

The data model has three levels: an Account is a company, a Lead is a business unit within that \
company, and a Deal sits under one of them. Deals move through pipeline stages, each with a win \
probability. Weighted value means open value multiplied by that probability.

Rules:
- Use the tools for every factual claim. Never estimate a number you were not given.
- You only ever see what the person asking is allowed to see. If a tool returns nothing, say so \
plainly rather than suggesting the data might exist elsewhere.
- All money is USD.
- A deal is "at risk" for one of two reasons, and they need opposite responses: 'overdue' means \
the close date has passed and it needs a new date; 'stalled' means nothing has been logged for \
over three weeks and it needs contact. Always say which.
- Be brief. Lead with the number or the answer, then at most a few supporting lines. No preamble.

Formatting. The client renders a deliberately small subset of markdown, so use only these:
- **bold** for figures and record names
- `-` bullets for findings, and `1.` numbered lists only when the order is the point
- pipe tables when reporting three or more records with the same fields — they render as real \
tables, and are much easier to read than the same rows written out as prose
- `backticks` for field or setting names

Do not use headings, links, images, blockquotes or nested lists. Never wrap a whole answer in a \
code fence. Write record names exactly as the tools return them — the client turns an exact name \
into a link to that record, and an abbreviated one into plain text.
"""

#: Offered in the drawer before anyone types. Chosen to match the tools that exist, so the first
#: thing a new user clicks cannot fail.
QUICK_PROMPTS = [
    "How big is my open pipeline right now?",
    "Which deals need attention this week?",
    "Which deals are missing a champion?",
    "What's happened in the last two weeks?",
]


def _truncate(text: str, limit: int = 200) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


async def context_brief(
    db: AsyncSession, viewer: User, context: dict[str, Any] | None
) -> str | None:
    """
    One line naming the record the user is looking at, for "why is *this* at risk?" to resolve.

    The record is re-read through the caller's own scope. A client naming a deal the viewer cannot
    see gets no context rather than a leak — and gets it silently, because "you are not allowed to
    see the thing you have open" is not a sentence that can be true, so saying it would only tell
    an attacker their guess existed.

    Names the id as well as the label, so the model has something to hand to `deal_detail` instead
    of searching by name and matching the wrong record.
    """
    if not context:
        return None

    kind = context.get("type")
    identifier = context.get("id")
    if not kind or not identifier:
        return None

    if kind == "deal":
        stmt = (
            select(Deal)
            .where(Deal.id == identifier)
            .options(joinedload(Deal.account), joinedload(Deal.stage))
        )
        deal = (await db.execute(permissions.scope_deals(stmt, viewer))).unique().scalar_one_or_none()
        if deal is None:
            return None
        return (
            f'The user is currently viewing the deal "{deal.name}" '
            f"(id {deal.id}) for the account {deal.account.name}, in the {deal.stage.name} stage. "
            "Treat 'this deal' as that one, and call deal_detail with that id for its specifics."
        )

    if kind == "lead":
        stmt = (
            select(Lead).where(Lead.id == identifier).options(joinedload(Lead.account))
        )
        lead = (await db.execute(permissions.scope_leads(stmt, viewer))).unique().scalar_one_or_none()
        if lead is None:
            return None
        return (
            f'The user is currently viewing the business unit "{lead.business_unit}" '
            f"under the account {lead.account.name}. Treat 'this lead' or 'this business unit' as "
            "that one, and use find_deals with the account name to reach its deals."
        )

    stmt = select(Account).where(Account.id == identifier)
    account = (await db.execute(permissions.scope_accounts(stmt, viewer))).unique().scalar_one_or_none()
    if account is None:
        return None
    return (
        f'The user is currently viewing the account "{account.name}". Treat "this account" or '
        '"this company" as that one, and use find_deals with its name to reach its deals.'
    )


async def _record(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: uuid.UUID,
    prompt_tokens: int,
    completion_tokens: int,
    tool_calls: int,
    started: float,
    question: str,
    error: str | None = None,
) -> None:
    """
    Write one usage row.

    Committed on its own, separately from anything else, and never allowed to fail the answer: a
    dashboard that loses a row is a smaller problem than a question that fails because its
    bookkeeping did.
    """
    try:
        db.add(
            AssistantUsage(
                user_id=user.id,
                conversation_id=conversation_id,
                model=settings.openai_model if settings.assistant_configured else "unconfigured",
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_usd=cost_for(prompt_tokens, completion_tokens),
                tool_calls=tool_calls,
                latency_ms=int((time.monotonic() - started) * 1000),
                question_preview=_truncate(question),
                error=error,
            )
        )
        await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Could not record assistant usage")
        await db.rollback()


async def answer(
    db: AsyncSession,
    user: User,
    question: str,
    history: list[dict[str, str]] | None = None,
    conversation_id: uuid.UUID | None = None,
    context: dict[str, Any] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """
    Stream an answer to one question.

    The loop is bounded by `assistant_max_tool_rounds`. A model that keeps asking for tools would
    otherwise bill indefinitely for a single question, and the cap turns that from an invoice into
    a slightly worse answer.
    """
    conversation_id = conversation_id or uuid.uuid4()
    provider = get_provider()
    started = time.monotonic()

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]

    # A second system message rather than appended to the first: the prompt above is constant and
    # cacheable, this changes with every screen.
    if brief := await context_brief(db, user, context):
        messages.append({"role": "system", "content": brief})
    # Trimmed to the recent turns. The whole point of a small model is that it is cheap, and
    # replaying an hour of conversation on every question undoes that.
    for turn in (history or [])[-6:]:
        if turn.get("role") in {"user", "assistant"} and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": question})

    yield {"type": "start", "conversationId": str(conversation_id)}

    prompt_tokens = completion_tokens = tool_call_count = 0

    try:
        for _round in range(settings.assistant_max_tool_rounds):
            requested: list[Any] = []
            assistant_text = ""

            async for chunk in provider.stream(messages, tool_registry.TOOL_SCHEMAS):
                if chunk.text:
                    assistant_text += chunk.text
                    yield {"type": "token", "text": chunk.text}
                if chunk.tool_calls:
                    requested.extend(chunk.tool_calls)
                if chunk.finished:
                    prompt_tokens += chunk.prompt_tokens
                    completion_tokens += chunk.completion_tokens

            if not requested:
                await _record(
                    db,
                    user=user,
                    conversation_id=conversation_id,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    tool_calls=tool_call_count,
                    started=started,
                    question=question,
                )
                yield {"type": "done", "conversationId": str(conversation_id)}
                return

            # The model's own turn has to go back verbatim, tool calls included, or the follow-up
            # request is missing the message the tool results are replying to.
            messages.append(
                {
                    "role": "assistant",
                    "content": assistant_text or None,
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {"name": call.name, "arguments": call.arguments or "{}"},
                        }
                        for call in requested
                    ],
                }
            )

            for call in requested:
                tool_call_count += 1
                # Announced to the client so the drawer can say what it is doing. A silent pause
                # while three queries run reads as a hang.
                yield {"type": "tool", "name": call.name}

                result = await tool_registry.dispatch(db, user, call.name, call.parsed())
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(result, default=str),
                    }
                )

        # Fell out of the loop with tools still being requested.
        await _record(
            db,
            user=user,
            conversation_id=conversation_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            tool_calls=tool_call_count,
            started=started,
            question=question,
            error="tool round limit reached",
        )
        yield {
            "type": "error",
            "message": "I needed too many lookups for that one. Try asking something narrower.",
        }

    except ProviderError as exc:
        logger.warning("Assistant provider error: %s", exc)
        await _record(
            db,
            user=user,
            conversation_id=conversation_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            tool_calls=tool_call_count,
            started=started,
            question=question,
            error=str(exc),
        )
        yield {"type": "error", "message": "The assistant could not reach the model. Try again."}

    except Exception as exc:  # noqa: BLE001
        logger.exception("Assistant failed")
        await _record(
            db,
            user=user,
            conversation_id=conversation_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            tool_calls=tool_call_count,
            started=started,
            question=question,
            error=repr(exc)[:400],
        )
        yield {"type": "error", "message": "Something went wrong answering that."}
