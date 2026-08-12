"""
The model transport. Streaming, tool-call assembly, token accounting — nothing domain-specific.

Written against the OpenAI chat-completions wire format with `httpx` rather than the vendor SDK,
for the same reason there is no charting library on the frontend: what is needed here is one POST
that streams server-sent events, and the SDK would arrive with an async client, a retry policy
and a type hierarchy to solve problems this file does not have.

Which implementation runs is decided by configuration, exactly as `notifications` decides between
SMTP and a log line: no API key means `UnconfiguredProvider`, which explains itself instead of
answering. The drawer, the stream, the tool dispatch and the usage dashboard are therefore all
exercisable before any credentials exist — and the failure, when the key is missing, is a sentence
a user can act on rather than a 500.
"""

import json
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, AsyncIterator, Protocol

import httpx

from app.core.config import settings

logger = logging.getLogger("app.assistant")


@dataclass
class ToolCall:
    """One tool the model asked for, reassembled from the stream's fragments."""

    id: str = ""
    name: str = ""
    #: Accumulated JSON text. Arrives split across deltas, often mid-token.
    arguments: str = ""

    def parsed(self) -> dict[str, Any]:
        try:
            return json.loads(self.arguments or "{}")
        except json.JSONDecodeError:
            # A truncated argument blob is the model's problem to hear about, not a crash.
            logger.warning("Could not parse tool arguments for %s: %r", self.name, self.arguments)
            return {}


@dataclass
class Chunk:
    """One event from the provider: some text, some tool calls, or the end."""

    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    finished: bool = False
    prompt_tokens: int = 0
    completion_tokens: int = 0


class Provider(Protocol):
    def stream(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> AsyncIterator[Chunk]:
        """Yields chunks until the model stops. Must yield exactly one `finished` chunk last."""
        ...


class UnconfiguredProvider:
    """
    The default. Says why it cannot answer.

    Deliberately not an error: a developer opening the drawer on a fresh checkout should see the
    feature working and one clear sentence about what is missing, not a stack trace. The reply is
    streamed word by word like a real one, so the transport is genuinely exercised.
    """

    MESSAGE = (
        "The assistant is not connected to a model yet. Set OPENAI_API_KEY in backend/.env "
        "and restart the API, and I will be able to answer questions about your pipeline, "
        "contacts and deals."
    )

    async def stream(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> AsyncIterator[Chunk]:
        for word in self.MESSAGE.split(" "):
            yield Chunk(text=word + " ")
        yield Chunk(finished=True)


class OpenAIProvider:
    """Chat completions over SSE."""

    def __init__(self) -> None:
        self._url = f"{settings.openai_base_url.rstrip('/')}/chat/completions"
        self._headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }

    async def stream(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> AsyncIterator[Chunk]:
        payload: dict[str, Any] = {
            "model": settings.openai_model,
            "messages": messages,
            "stream": True,
            # Asking for usage on the final chunk is the only way to bill a streamed call
            # accurately. Without it the token counts have to be estimated, and an estimated
            # cost dashboard is a rumour.
            "stream_options": {"include_usage": True},
            "max_completion_tokens": settings.assistant_max_output_tokens,
        }

        # Only sent when configured. A reasoning model on this endpoint requires 'none' to accept
        # function tools at all; a model with no reasoning setting rejects the key as unknown. One
        # setting covers both because the correct value is a property of the model, not of us.
        if effort := settings.openai_reasoning_effort.strip():
            payload["reasoning_effort"] = effort

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        # Tool calls arrive as fragments indexed by position, so they are accumulated by index
        # and emitted once the model says it is done choosing them.
        pending: dict[int, ToolCall] = {}

        timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST", self._url, headers=self._headers, json=payload
            ) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode(errors="replace")[:400]
                    raise ProviderError(f"The model provider returned {response.status_code}: {body}")

                prompt_tokens = completion_tokens = 0

                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break

                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    # Usage arrives on its own final event, with an empty choices list.
                    if usage := event.get("usage"):
                        prompt_tokens = usage.get("prompt_tokens", 0)
                        completion_tokens = usage.get("completion_tokens", 0)

                    for choice in event.get("choices") or []:
                        delta = choice.get("delta") or {}

                        if text := delta.get("content"):
                            yield Chunk(text=text)

                        for fragment in delta.get("tool_calls") or []:
                            index = fragment.get("index", 0)
                            call = pending.setdefault(index, ToolCall())
                            if identifier := fragment.get("id"):
                                call.id = identifier
                            function = fragment.get("function") or {}
                            if name := function.get("name"):
                                call.name = name
                            if arguments := function.get("arguments"):
                                call.arguments += arguments

                        if choice.get("finish_reason") == "tool_calls" and pending:
                            yield Chunk(tool_calls=[pending[key] for key in sorted(pending)])
                            pending = {}

                yield Chunk(
                    finished=True,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )


class ProviderError(RuntimeError):
    """The provider refused or failed. Carries a message safe to show a user."""


@lru_cache(maxsize=1)
def get_provider() -> Provider:
    """
    Chosen once, from configuration.

    Cached, so a restart is required after changing the key — the same contract as every other
    setting in this application.
    """
    if not settings.assistant_configured:
        logger.info("Assistant provider: unconfigured (OPENAI_API_KEY is unset)")
        return UnconfiguredProvider()
    logger.info("Assistant provider: OpenAI, model %s", settings.openai_model)
    return OpenAIProvider()
