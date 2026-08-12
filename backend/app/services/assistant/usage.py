"""
Reading back what was spent. Administrators only — enforced at the endpoint.

Every figure is aggregated in Postgres rather than in Python. The dashboard's questions are all
"sum over a window grouped by something", and pulling every row back to add it up would get slower
in exactly the way that matters: with success.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AssistantUsage, User
from app.schemas.assistant import (
    AssistantUsageSummary,
    UsageByUser,
    UsageDay,
    UsageRecent,
    UsageTotals,
)


def _totals_row_to_schema(row, days: int) -> UsageTotals:
    return UsageTotals(
        calls=row.calls or 0,
        prompt_tokens=row.prompt_tokens or 0,
        completion_tokens=row.completion_tokens or 0,
        total_tokens=(row.prompt_tokens or 0) + (row.completion_tokens or 0),
        cost_usd=float(row.cost) if row.cost is not None else None,
        errors=row.errors or 0,
        window_days=days,
    )


async def summary(db: AsyncSession, days: int = 30, recent_limit: int = 25) -> AssistantUsageSummary:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    window = AssistantUsage.created_at >= since

    totals = (
        await db.execute(
            select(
                func.count(AssistantUsage.id).label("calls"),
                func.coalesce(func.sum(AssistantUsage.prompt_tokens), 0).label("prompt_tokens"),
                func.coalesce(func.sum(AssistantUsage.completion_tokens), 0).label("completion_tokens"),
                func.sum(AssistantUsage.cost_usd).label("cost"),
                func.count(AssistantUsage.error).label("errors"),
            ).where(window)
        )
    ).one()

    per_user = (
        await db.execute(
            select(
                User.id,
                User.full_name,
                func.count(AssistantUsage.id).label("calls"),
                func.coalesce(
                    func.sum(AssistantUsage.prompt_tokens + AssistantUsage.completion_tokens), 0
                ).label("tokens"),
                func.sum(AssistantUsage.cost_usd).label("cost"),
            )
            .join(AssistantUsage, AssistantUsage.user_id == User.id)
            .where(window)
            .group_by(User.id, User.full_name)
            .order_by(func.count(AssistantUsage.id).desc())
        )
    ).all()

    # Grouped in the database by day so a sparse period returns few rows rather than a bucket per
    # day; the client fills the gaps, which it has to do anyway for a chart's x-axis.
    #
    # A cast to `date`, not `date_trunc('day', ...)`. SQLAlchemy binds that string as a parameter,
    # so Postgres sees `date_trunc($1, created_at)` in the SELECT and `date_trunc($4, created_at)`
    # in the GROUP BY, decides they are different expressions, and rejects the whole query with
    # "created_at must appear in the GROUP BY clause". The cast takes no argument, so there is
    # nothing to bind and the two sides match.
    #
    # Days are UTC, because `created_at` is a timestamptz and the cast uses the session's zone.
    # Worth knowing before reading a late-evening call as belonging to the next day.
    day = cast(AssistantUsage.created_at, Date).label("day")
    daily = (
        await db.execute(
            select(
                day,
                func.count(AssistantUsage.id).label("calls"),
                func.coalesce(
                    func.sum(AssistantUsage.prompt_tokens + AssistantUsage.completion_tokens), 0
                ).label("tokens"),
                func.sum(AssistantUsage.cost_usd).label("cost"),
            )
            .where(window)
            .group_by(day)
            .order_by(day)
        )
    ).all()

    recent = (
        await db.execute(
            select(AssistantUsage)
            .where(window)
            .order_by(AssistantUsage.created_at.desc())
            .limit(recent_limit)
        )
    ).unique().scalars()

    return AssistantUsageSummary(
        totals=_totals_row_to_schema(totals, days),
        model=settings.openai_model,
        provider_configured=settings.assistant_configured,
        pricing_configured=settings.assistant_pricing_configured,
        input_cost_per_1m=settings.openai_input_cost_per_1m,
        output_cost_per_1m=settings.openai_output_cost_per_1m,
        by_user=[
            UsageByUser(
                user_id=row.id,
                user_name=row.full_name,
                calls=row.calls,
                total_tokens=row.tokens,
                cost_usd=float(row.cost) if row.cost is not None else None,
            )
            for row in per_user
        ],
        daily=[
            UsageDay(
                day=row.day,
                calls=row.calls,
                total_tokens=row.tokens,
                cost_usd=float(row.cost) if row.cost is not None else None,
            )
            for row in daily
        ],
        recent=[
            UsageRecent(
                id=row.id,
                user_name=row.user.full_name,
                model=row.model,
                prompt_tokens=row.prompt_tokens,
                completion_tokens=row.completion_tokens,
                cost_usd=float(row.cost_usd) if row.cost_usd is not None else None,
                tool_calls=row.tool_calls,
                latency_ms=row.latency_ms,
                question_preview=row.question_preview,
                error=row.error,
                created_at=row.created_at,
            )
            for row in recent
        ],
    )
