"""
The assistant's two endpoints: ask a question, and (for administrators) read what it cost.

Streaming is server-sent events over a POST rather than a WebSocket or an `EventSource`. A
question carries a body — the prompt and the recent turns — which `EventSource` cannot send, and
a socket would need connection state this feature has no use for. One POST that streams back is
the smallest thing that works.
"""

import json
import logging
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, DbSession
from app.core import permissions
from app.core.config import settings
from app.schemas.assistant import AssistantAsk, AssistantInfo, AssistantUsageSummary
from app.services.assistant import service as assistant_service
from app.services.assistant import usage as usage_service

logger = logging.getLogger("app.assistant")

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("", response_model=AssistantInfo)
async def read_info(user: CurrentUser) -> AssistantInfo:
    """What the drawer needs to render before anyone types."""
    return AssistantInfo(
        enabled=settings.assistant_enabled,
        provider_configured=settings.assistant_configured,
        model=settings.openai_model,
        quick_prompts=assistant_service.QUICK_PROMPTS,
    )


@router.post("/ask")
async def ask(db: DbSession, user: CurrentUser, payload: AssistantAsk) -> StreamingResponse:
    """
    Stream an answer as server-sent events.

    Every event is one JSON object on a `data:` line: `start`, `token`, `tool`, `error`, `done`.

    Errors mid-stream arrive as an `error` event with a 200 status, because the response headers
    are long gone by the time anything can fail. The client treats an `error` event as the failure
    — there is no status code left to carry it.
    """
    if not settings.assistant_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The assistant is turned off",
        )

    async def events() -> AsyncIterator[bytes]:
        try:
            async for event in assistant_service.answer(
                db,
                user,
                payload.question,
                history=[turn.model_dump() for turn in payload.history],
                conversation_id=payload.conversation_id,
                context=payload.context.model_dump() if payload.context else None,
            ):
                yield f"data: {json.dumps(event)}\n\n".encode()
        except Exception:  # noqa: BLE001
            # The generator itself failing is the one case the service cannot report on its own.
            logger.exception("Assistant stream failed")
            payload_json = json.dumps(
                {"type": "error", "message": "The assistant stopped unexpectedly."}
            )
            yield f"data: {payload_json}\n\n".encode()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Nginx buffers proxied responses by default, which holds a streamed answer until it
            # is complete and turns this into a slow non-streaming endpoint.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/usage", response_model=AssistantUsageSummary)
async def read_usage(
    db: DbSession,
    user: CurrentUser,
    days: int = Query(default=30, ge=1, le=365),
) -> AssistantUsageSummary:
    """
    Token and cost usage across everyone. Administrators only.

    Admin-only because it is inherently cross-user: it names who asked what, and the question
    previews quote deal names. A rep has no reason to read their colleagues' questions.
    """
    permissions.require_admin(user, "view assistant usage")
    return await usage_service.summary(db, days=days)
