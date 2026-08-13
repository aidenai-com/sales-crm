"""
Per-deal deliverable checklists, and the automatic stage advance they trigger.

This reverses `spec.md` §6.4, which cut exit-criteria gating from v1, and §6.5, which
deferred rep-facing deliverable checklists. Both were reversed deliberately by stakeholder
feedback; see `docs/superpowers/specs/2026-08-07-feedback-round-1-design.md` §1.2.

What §6.4 said that still holds: a manual move is always available. The checklist adds an
automatic path to the next stage, it does not remove or gate the manual one. Drag-and-drop
on the board works exactly as before, on a stage with a half-finished checklist.
"""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import (
    Activity,
    ActivityKind,
    Attachment,
    Deal,
    DealDeliverableCompletion,
    PipelineTemplate,
    Stage,
    StageDeliverable,
    StageKind,
)
from app.schemas.deliverable import (
    AttachmentRead,
    DealChecklist,
    DeliverableStatus,
    StageChecklist,
)

logger = logging.getLogger("app.checklist")


class NotOnCurrentStage(Exception):
    """
    A deliverable was ticked on a stage the deal is not in.

    Refused rather than allowed. Ticking a box on a stage the deal has already left has no
    defensible meaning, and it would make the advance rule ambiguous: does completing a past
    stage's checklist move the deal forward from where it is now?
    """


class DeliverableNotOnDeal(Exception):
    """The deliverable belongs to a stage in some other pipeline than the deal's."""


# --- Reading -----------------------------------------------------------------


async def load_pipeline(db: AsyncSession, pipeline_id: uuid.UUID) -> PipelineTemplate | None:
    """The deal's pipeline with every stage and every stage's deliverables."""
    result = await db.execute(
        select(PipelineTemplate)
        .options(selectinload(PipelineTemplate.stages).selectinload(Stage.deliverables))
        .where(PipelineTemplate.id == pipeline_id)
    )
    return result.unique().scalar_one_or_none()


async def build_checklist(db: AsyncSession, deal: Deal) -> DealChecklist:
    """
    Every stage of the deal's pipeline with its deliverables, completions and attachments.

    All stages, not just the current one: the requirement is to click across the statuses
    and see the documents filed against each. Returning one stage at a time would make
    browsing the history N requests, on a page that already knows it wants all of them.
    """
    pipeline = await load_pipeline(db, deal.pipeline_template_id)
    if pipeline is None:  # pragma: no cover - a deal cannot exist without its pipeline
        raise DeliverableNotOnDeal

    completions = await _completions_for_deal(db, deal.id)
    attachments = await _attachments_for_deal(db, deal.id)

    stages: list[StageChecklist] = []
    for stage in sorted(pipeline.stages, key=lambda item: item.position):
        statuses = [
            _deliverable_status(deliverable, completions, attachments)
            for deliverable in sorted(stage.deliverables, key=lambda item: item.position)
        ]
        stages.append(
            StageChecklist(
                stage_id=stage.id,
                stage_name=stage.name,
                stage_short_name=stage.short_name,
                stage_color=stage.color,
                stage_position=stage.position,
                is_current_stage=stage.id == deal.stage_id,
                deliverables=statuses,
                complete_count=sum(1 for status in statuses if status.complete),
                total_count=len(statuses),
            )
        )

    return DealChecklist(deal_id=deal.id, current_stage_id=deal.stage_id, stages=stages)


def _deliverable_status(
    deliverable: StageDeliverable,
    completions: dict[uuid.UUID, DealDeliverableCompletion],
    attachments: dict[uuid.UUID, list[Attachment]],
) -> DeliverableStatus:
    completion = completions.get(deliverable.id)
    return DeliverableStatus(
        id=deliverable.id,
        text=deliverable.text,
        position=deliverable.position,
        complete=completion is not None,
        completed_at=completion.completed_at if completion else None,
        completed_by_id=completion.completed_by_id if completion else None,
        completed_by_name=completion.completed_by.full_name if completion else None,
        attachments=[
            AttachmentRead(
                id=attachment.id,
                deal_id=attachment.deal_id,
                stage_deliverable_id=attachment.stage_deliverable_id,
                filename=attachment.filename,
                content_type=attachment.content_type,
                size_bytes=attachment.size_bytes,
                uploaded_by_id=attachment.uploaded_by_id,
                uploaded_by_name=attachment.uploaded_by.full_name,
                created_at=attachment.created_at,
            )
            for attachment in attachments.get(deliverable.id, [])
        ],
    )


async def _completions_for_deal(
    db: AsyncSession, deal_id: uuid.UUID
) -> dict[uuid.UUID, DealDeliverableCompletion]:
    result = await db.execute(
        select(DealDeliverableCompletion)
        .options(joinedload(DealDeliverableCompletion.completed_by))
        .where(DealDeliverableCompletion.deal_id == deal_id)
    )
    return {row.stage_deliverable_id: row for row in result.unique().scalars()}


async def _attachments_for_deal(
    db: AsyncSession, deal_id: uuid.UUID
) -> dict[uuid.UUID, list[Attachment]]:
    result = await db.execute(
        select(Attachment)
        .options(joinedload(Attachment.uploaded_by))
        .where(Attachment.deal_id == deal_id)
        .order_by(Attachment.created_at)
    )
    grouped: dict[uuid.UUID, list[Attachment]] = {}
    for attachment in result.unique().scalars():
        grouped.setdefault(attachment.stage_deliverable_id, []).append(attachment)
    return grouped


async def get_deliverable(db: AsyncSession, deliverable_id: uuid.UUID) -> StageDeliverable | None:
    result = await db.execute(
        select(StageDeliverable)
        .options(joinedload(StageDeliverable.stage))
        .where(StageDeliverable.id == deliverable_id)
    )
    return result.unique().scalar_one_or_none()


def require_current_stage(deal: Deal, deliverable: StageDeliverable) -> None:
    """
    Guards every write against a deliverable.

    Two failure modes, distinguished because they mean different things to a caller: a
    deliverable from another pipeline entirely is a bad request, while one from the right
    pipeline but the wrong stage is a rule about when work can be recorded.
    """
    if deliverable.stage.pipeline_template_id != deal.pipeline_template_id:
        raise DeliverableNotOnDeal
    if deliverable.stage_id != deal.stage_id:
        raise NotOnCurrentStage


# --- Writing -----------------------------------------------------------------


async def complete(
    db: AsyncSession, deal: Deal, deliverable: StageDeliverable, actor_id: uuid.UUID
) -> bool:
    """
    Ticks a deliverable. Returns whether anything changed.

    Idempotent: ticking an already-ticked box returns False rather than raising, because the
    caller asked for a state that already holds. A double-click on a checkbox is not an error
    worth showing anybody.
    """
    existing = await db.execute(
        select(DealDeliverableCompletion).where(
            DealDeliverableCompletion.deal_id == deal.id,
            DealDeliverableCompletion.stage_deliverable_id == deliverable.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return False

    db.add(
        DealDeliverableCompletion(
            deal_id=deal.id,
            stage_deliverable_id=deliverable.id,
            completed_by_id=actor_id,
        )
    )
    await db.flush()
    return True


async def uncomplete(db: AsyncSession, deal: Deal, deliverable: StageDeliverable) -> bool:
    """
    Unticks a deliverable.

    Deliberately does *not* move the deal back if it had advanced. Reverting a stage on an
    untick would let one mis-click rewrite pipeline history, and the rep can always move the
    deal manually. See the design doc §3.
    """
    result = await db.execute(
        select(DealDeliverableCompletion).where(
            DealDeliverableCompletion.deal_id == deal.id,
            DealDeliverableCompletion.stage_deliverable_id == deliverable.id,
        )
    )
    completion = result.scalar_one_or_none()
    if completion is None:
        return False

    await db.delete(completion)
    await db.flush()
    return True


async def next_open_stage(db: AsyncSession, deal: Deal) -> Stage | None:
    """
    The stage after the deal's current one, among open stages only.

    Terminal stages are excluded on purpose. Closing a deal won or lost is a judgement about
    the outcome, not the next step in a sequence, and no checklist should make it for a rep.
    """
    pipeline = await load_pipeline(db, deal.pipeline_template_id)
    if pipeline is None:  # pragma: no cover
        return None

    open_stages = sorted(
        (stage for stage in pipeline.stages if stage.kind is StageKind.OPEN),
        key=lambda stage: stage.position,
    )
    current = next((i for i, stage in enumerate(open_stages) if stage.id == deal.stage_id), None)
    if current is None:
        # The deal is sitting in a terminal stage. There is no "next" from Closed Won.
        return None
    if current + 1 >= len(open_stages):
        # Last open stage. The remaining moves are Closed Won and Closed Lost, both manual.
        return None
    return open_stages[current + 1]


async def try_advance(
    db: AsyncSession, deal: Deal, actor_id: uuid.UUID
) -> tuple[Stage | None, uuid.UUID | None]:
    """
    Moves the deal on if its current stage's checklist is now complete.

    Returns `(new_stage, previous_stage_id)`, both None when nothing moved.

    Every guard here is a no-op rather than an error. This runs as a side effect of ticking a
    box, and the tick itself succeeded; failing the request because the deal happened to be
    on the last open stage would punish the rep for the shape of their pipeline.
    """
    current_stage = await db.get(Stage, deal.stage_id)
    if current_stage is None:  # pragma: no cover
        return None, None

    result = await db.execute(
        select(StageDeliverable.id).where(StageDeliverable.stage_id == current_stage.id)
    )
    deliverable_ids = set(result.scalars())

    # An empty checklist is not a satisfied one. Without this, every stage that defines no
    # deliverables would advance the instant anything was ticked anywhere.
    if not deliverable_ids:
        return None, None

    completed = await db.execute(
        select(DealDeliverableCompletion.stage_deliverable_id).where(
            DealDeliverableCompletion.deal_id == deal.id,
            DealDeliverableCompletion.stage_deliverable_id.in_(deliverable_ids),
        )
    )
    if set(completed.scalars()) != deliverable_ids:
        return None, None

    target = await next_open_stage(db, deal)
    if target is None:
        return None, None

    previous_id = deal.stage_id
    deal.stage_id = target.id
    db.add(
        Activity(
            deal_id=deal.id,
            kind=ActivityKind.STAGE_CHANGE,
            summary=(
                f"Advanced to {target.name} — all {len(deliverable_ids)} deliverables "
                f"for {current_stage.name} complete."
            ),
            author_id=actor_id,
        )
    )
    await db.flush()
    logger.info("Deal %s auto-advanced to %s", deal.id, target.name)
    return target, previous_id


@dataclass(frozen=True)
class StageActions:
    """
    The deliverables on a deal's *current* stage, and the first one still outstanding.

    This is what answers "what action is required" without inventing advice: the deliverables are the actions
    a rep has already been told the deal needs, so the next unticked one is the next action by definition.

    `total == 0` is a distinct and important state. It does not mean the deal is done — it means the stage
    defines no deliverables at all, which is an administrator's problem rather than a rep's, and the reports
    say so in those words instead of showing an empty cell.
    """

    total: int
    done: int
    next_text: str | None

    @property
    def outstanding(self) -> int:
        return self.total - self.done


async def actions_by_deal(db: AsyncSession) -> dict[uuid.UUID, StageActions]:
    """
    Every deal's current-stage checklist progress, in two queries rather than two per deal.

    Bulk because the risk report needs this for the whole book. The per-deal `deal_checklist` above walks
    every stage and loads attachments and authors, which is right for a deal page and far too much for a
    list of a hundred rows.

    Deals whose stage has no deliverables are returned with `total = 0` rather than omitted, so a caller can
    tell "nothing defined here" from "not loaded".
    """
    totals = await db.execute(
        select(StageDeliverable.stage_id, func.count(StageDeliverable.id)).group_by(
            StageDeliverable.stage_id
        )
    )
    per_stage = {stage_id: count for stage_id, count in totals.all()}

    # Outstanding deliverables per deal: the current stage's list, minus what this deal has ticked. Ordered
    # by position so the first row per deal is genuinely the next action rather than an arbitrary one.
    outstanding = await db.execute(
        select(Deal.id, StageDeliverable.text, StageDeliverable.position)
        .join(StageDeliverable, StageDeliverable.stage_id == Deal.stage_id)
        .outerjoin(
            DealDeliverableCompletion,
            (DealDeliverableCompletion.deal_id == Deal.id)
            & (DealDeliverableCompletion.stage_deliverable_id == StageDeliverable.id),
        )
        .where(DealDeliverableCompletion.id.is_(None))
        .order_by(Deal.id, StageDeliverable.position)
    )

    pending: dict[uuid.UUID, list[str]] = {}
    for deal_id, text, _position in outstanding.all():
        pending.setdefault(deal_id, []).append(text)

    stages = await db.execute(select(Deal.id, Deal.stage_id))
    result: dict[uuid.UUID, StageActions] = {}
    for deal_id, stage_id in stages.all():
        total = per_stage.get(stage_id, 0)
        waiting = pending.get(deal_id, [])
        result[deal_id] = StageActions(
            total=total,
            done=max(total - len(waiting), 0),
            next_text=waiting[0] if waiting else None,
        )
    return result
