import uuid
from decimal import Decimal

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.models import Deal, Health, StageKind
from app.repositories import activities as activities_repo
from app.repositories import deals as deals_repo
from app.schemas.crm import (
    DashboardMetrics,
    DashboardSummary,
    DealDetail,
    PipelineHealth,
    StageBucket,
)
from app.services import health as health_service
from app.services import pipelines as pipeline_service
from app.services.serializers import activity_detail, deal_detail

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    db: DbSession,
    user: CurrentUser,
    high_priority_limit: int = Query(default=6, ge=1, le=50),
    activity_limit: int = Query(default=8, ge=1, le=100),
) -> DashboardSummary:
    """
    Everything the dashboard needs in one round trip.

    An action surface, not a reporting one (spec 4.1): the numbers here are the ones a rep
    can act on today, and the high-priority list is ordered by what needs attention first.
    """
    # Scoped: a rep's dashboard shows their own pipeline, not the company's.
    all_deals = await deals_repo.list_all(db, user)
    last_activity = await deals_repo.last_activity_map(db)
    templates = await pipeline_service.list_templates(db)

    details = [deal_detail(deal, last_activity) for deal in all_deals]
    open_details = [detail for detail in details if detail.is_open]

    metrics = DashboardMetrics(
        open_pipeline_value=sum((d.value for d in open_details), Decimal("0")),
        weighted_pipeline_value=sum((d.weighted_value for d in open_details), Decimal("0")),
        advanced_stage_count=sum(
            1 for d in open_details if d.stage_probability >= health_service.ADVANCED_STAGE_THRESHOLD
        ),
        closing_this_week_count=sum(1 for d in open_details if d.health is Health.CLOSING_SOON),
        needs_attention_count=sum(1 for d in open_details if d.health is Health.AT_RISK),
    )

    recent = await activities_repo.list_all(db, user, limit=activity_limit)

    return DashboardSummary(
        metrics=metrics,
        high_priority=_high_priority(open_details, high_priority_limit),
        pipeline_health=_pipeline_health(templates, all_deals),
        recent_activity=[activity_detail(activity) for activity in recent],
    )


@router.get("/metrics", response_model=DashboardMetrics)
async def dashboard_metrics(db: DbSession, user: CurrentUser) -> DashboardMetrics:
    summary = await dashboard_summary(db, user, high_priority_limit=1, activity_limit=1)
    return summary.metrics


def _high_priority(open_details: list[DealDetail], limit: int) -> list[DealDetail]:
    """At-risk before closing-soon, largest value first inside each band."""
    rank = {Health.AT_RISK: 0, Health.CLOSING_SOON: 1, Health.HEALTHY: 2}
    needing = [detail for detail in open_details if detail.health is not Health.HEALTHY]
    needing.sort(key=lambda d: (rank[d.health], -d.value))
    return needing[:limit]


def _pipeline_health(templates, all_deals: list[Deal]) -> list[PipelineHealth]:
    """
    Deal counts and value per stage, for every stage including the empty ones (R5) — an
    empty stage is information, so it must not be omitted.
    """
    by_stage: dict[uuid.UUID, list[Deal]] = {}
    for deal in all_deals:
        by_stage.setdefault(deal.stage_id, []).append(deal)

    result: list[PipelineHealth] = []
    for template in templates:
        buckets: list[StageBucket] = []
        for stage in sorted(template.stages, key=lambda s: s.position):
            in_stage = by_stage.get(stage.id, [])
            buckets.append(
                StageBucket(
                    stage_id=stage.id,
                    stage_name=stage.name,
                    stage_short_name=stage.short_name,
                    probability=stage.probability,
                    color=stage.color,
                    count=len(in_stage),
                    value=sum((deal.value for deal in in_stage), Decimal("0")),
                )
            )

        result.append(
            PipelineHealth(pipeline_id=template.id, pipeline_name=template.name, buckets=buckets)
        )

    return result


@router.get("/stage-kinds", response_model=dict[str, str])
async def stage_kind_reference(_: CurrentUser) -> dict[str, str]:
    """
    What each stage kind means for reporting. Exposed so the pipeline builder can explain
    the choice rather than hardcoding the copy on the client.
    """
    return {
        StageKind.OPEN.value: "Counts toward open pipeline value",
        StageKind.WON.value: "Closed successfully; leaves open pipeline",
        StageKind.LOST.value: "Closed unsuccessfully; leaves open pipeline",
    }
