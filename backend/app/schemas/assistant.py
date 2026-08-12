import uuid
from datetime import date, datetime

from pydantic import Field

from app.schemas.common import ORMModel, PayloadModel


class AssistantTurn(PayloadModel):
    """One prior turn, replayed so a follow-up question has context."""

    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=8000)


class AssistantContext(PayloadModel):
    """
    What the user is looking at when they ask.

    Sent so "why is this at risk?" resolves to a record rather than to nothing. The id is
    re-checked against the caller's own scope on the server: a client naming a deal it cannot see
    gets an assistant with no context, not an assistant that reads it out.
    """

    type: str = Field(pattern="^(deal|lead|account)$")
    id: uuid.UUID


class AssistantAsk(PayloadModel):
    question: str = Field(min_length=1, max_length=2000)
    context: AssistantContext | None = None
    #: Trimmed server-side as well; a client is not trusted to keep this small.
    history: list[AssistantTurn] = Field(default_factory=list, max_length=20)
    #: Carried from the previous reply, so the usage rows for one conversation group together.
    conversation_id: uuid.UUID | None = None


class AssistantInfo(ORMModel):
    """What the drawer needs before the first question."""

    enabled: bool
    #: False when no API key is set. The drawer still opens and still answers — with one sentence
    #: explaining what is missing — so the surface is not a dead end during setup.
    provider_configured: bool
    model: str
    quick_prompts: list[str]


class UsageTotals(ORMModel):
    calls: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    #: Null when no per-token rate is configured. Not zero — zero is a claim, null is a fact.
    cost_usd: float | None
    errors: int
    window_days: int


class UsageByUser(ORMModel):
    user_id: uuid.UUID
    user_name: str
    calls: int
    total_tokens: int
    cost_usd: float | None


class UsageDay(ORMModel):
    day: date
    calls: int
    total_tokens: int
    cost_usd: float | None


class UsageRecent(ORMModel):
    id: uuid.UUID
    user_name: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float | None
    tool_calls: int
    latency_ms: int
    question_preview: str
    error: str | None
    created_at: datetime


class AssistantUsageSummary(ORMModel):
    totals: UsageTotals
    model: str
    provider_configured: bool
    pricing_configured: bool
    input_cost_per_1m: float
    output_cost_per_1m: float
    by_user: list[UsageByUser]
    daily: list[UsageDay]
    recent: list[UsageRecent]
