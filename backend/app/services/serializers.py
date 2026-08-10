import uuid
from datetime import datetime

from app.models import Activity, Deal, Health
from app.schemas.crm import ActivityDetail, DealDetail
from app.services import health as health_service


def deal_detail(
    deal: Deal,
    last_activity: dict[uuid.UUID, datetime | None],
    today=None,
    now=None,
) -> DealDetail:
    """
    Flattens a deal and its relations into the single shape every screen consumes, with
    health derived here rather than stored.
    """
    touched = last_activity.get(deal.id)
    computed: Health = health_service.deal_health(deal, touched, today=today, now=now)

    return DealDetail(
        id=deal.id,
        name=deal.name,
        created_at=deal.created_at,
        account_id=deal.account_id,
        lead_id=deal.lead_id,
        partner_id=deal.partner_id,
        pipeline_template_id=deal.pipeline_template_id,
        stage_id=deal.stage_id,
        value=deal.value,
        currency=deal.currency,
        expected_close_date=deal.expected_close_date,
        owner_id=deal.owner_id,
        health=computed,
        account_name=deal.account.name,
        partner_name=deal.partner.name if deal.partner else None,
        lead_business_unit=deal.lead.business_unit if deal.lead else None,
        stage_name=deal.stage.name,
        stage_short_name=deal.stage.short_name,
        stage_probability=deal.stage.probability,
        stage_color=deal.stage.color,
        pipeline_name=deal.pipeline.name,
        owner_name=deal.owner.full_name,
        is_open=health_service.is_open(deal),
        last_activity_at=touched,
    )


def activity_detail(activity: Activity) -> ActivityDetail:
    """Adds the author's name and a human label for whatever the activity is attached to."""
    if activity.deal is not None:
        label = activity.deal.name
    elif activity.lead is not None:
        label = activity.lead.business_unit
    elif activity.account is not None:
        label = activity.account.name
    else:  # pragma: no cover - the exactly_one_subject constraint prevents this
        label = "Unknown"

    return ActivityDetail(
        id=activity.id,
        kind=activity.kind,
        summary=activity.summary,
        author_id=activity.author_id,
        occurred_at=activity.occurred_at,
        subject_type=activity.subject_type,
        subject_id=activity.subject_id,
        author_name=activity.author.full_name,
        subject_label=label,
    )
