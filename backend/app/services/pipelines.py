import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Activity,
    ActivityKind,
    Deal,
    PipelineTemplate,
    Stage,
    StageDeliverable,
    StageKind,
)
from app.schemas.pipeline import StageCreate, StageUpdate


class StageInUse(Exception):
    """A stage still holds deals, so it cannot be deleted (spec 6.3)."""

    def __init__(self, deal_count: int) -> None:
        self.deal_count = deal_count
        super().__init__(f"{deal_count} deals are still in this stage")


class LastStage(Exception):
    """A pipeline must always keep at least one stage for deals to sit in."""


class CrossPipelineMove(Exception):
    """A deal belongs to exactly one template, so it cannot move to another's stage."""


async def get_template(db: AsyncSession, pipeline_id: uuid.UUID) -> PipelineTemplate | None:
    result = await db.execute(
        select(PipelineTemplate)
        .options(selectinload(PipelineTemplate.stages))
        .where(PipelineTemplate.id == pipeline_id)
    )
    return result.unique().scalar_one_or_none()


async def list_templates(db: AsyncSession) -> list[PipelineTemplate]:
    result = await db.execute(
        select(PipelineTemplate)
        .options(selectinload(PipelineTemplate.stages))
        .order_by(PipelineTemplate.name)
    )
    return list(result.unique().scalars())


def _ordered(template: PipelineTemplate) -> list[Stage]:
    return sorted(template.stages, key=lambda stage: stage.position)


def _renumber(stages: list[Stage]) -> None:
    """Rewrites positions to 1..n so ordering never develops gaps or ties."""
    for index, stage in enumerate(stages, start=1):
        stage.position = index


async def add_stage(db: AsyncSession, template: PipelineTemplate, payload: StageCreate) -> Stage:
    """
    Inserts before the terminal stages, which is nearly always what is meant — a new step
    belongs in the working part of the pipeline, not after Closed Won.
    """
    ordered = _ordered(template)
    open_count = sum(1 for stage in ordered if stage.kind is StageKind.OPEN)

    stage = Stage(
        pipeline_template_id=template.id,
        name=payload.name,
        short_name=payload.short_name or payload.name,
        probability=payload.probability,
        color=payload.color,
        kind=payload.kind,
        wip_limit=payload.wip_limit,
        requires_champion=payload.requires_champion,
        entry_criteria=payload.entry_criteria,
        exit_criteria=payload.exit_criteria,
        key_activities=payload.key_activities,
        position=open_count + 1,
    )

    for position, text in enumerate(payload.deliverables or [], start=1):
        stage.deliverables.append(StageDeliverable(text=text, position=position))

    insert_at = open_count if payload.kind is StageKind.OPEN else len(ordered)
    reordered = ordered[:insert_at] + [stage] + ordered[insert_at:]

    db.add(stage)
    _renumber(reordered)
    await db.flush()
    return stage


async def update_stage(db: AsyncSession, stage: Stage, payload: StageUpdate) -> Stage:
    fields = payload.model_dump(exclude_unset=True)
    deliverables = fields.pop("deliverables", None)

    for field, value in fields.items():
        setattr(stage, field, value)

    # `exclude_unset` distinguishes "deliverables omitted, leave them alone" from
    # "deliverables sent as an empty list, remove them all". Reading a missing key as an
    # empty list would silently wipe a stage's checklist on any unrelated edit.
    if "deliverables" in payload.model_fields_set and deliverables is not None:
        await _sync_deliverables(db, stage, deliverables)

    return stage


async def _sync_deliverables(
    db: AsyncSession, stage: Stage, desired: list[dict[str, object]]
) -> None:
    """
    Reconciles a stage's deliverables against the desired list, preserving row identity.

    Entries carrying an `id` update that row in place; entries without one are new; rows
    whose id is absent from the list are deleted, taking their completions and attachments
    with them by cascade.

    Updating in place rather than replacing is the entire reason deliverables are rows.
    Delete-all-then-insert would issue fresh ids on every save, so an admin fixing a typo
    would erase every rep's checkmarks and uploaded documents across every deal.
    """
    existing = {deliverable.id: deliverable for deliverable in stage.deliverables}
    keep: set[uuid.UUID] = set()

    for position, entry in enumerate(desired, start=1):
        entry_id = entry.get("id")
        text = str(entry["text"]).strip()

        current = existing.get(entry_id) if entry_id is not None else None
        if current is not None:
            current.text = text
            current.position = position
            keep.add(current.id)
        else:
            # An unknown id is treated as a new row rather than an error. The alternative is
            # failing a whole save because one client sent a stale id, and the outcome the
            # admin asked for — this text, at this position — is achievable either way.
            stage.deliverables.append(StageDeliverable(text=text, position=position))

    for deliverable in list(stage.deliverables):
        if deliverable.id is not None and deliverable.id not in keep:
            stage.deliverables.remove(deliverable)

    await db.flush()


async def reorder_stage(
    db: AsyncSession, template: PipelineTemplate, stage_id: uuid.UUID, to_index: int
) -> list[Stage]:
    ordered = _ordered(template)
    current = next((i for i, stage in enumerate(ordered) if stage.id == stage_id), None)
    if current is None:
        return ordered

    target = max(0, min(to_index, len(ordered) - 1))
    moved = ordered.pop(current)
    ordered.insert(target, moved)

    # The unique (template, position) constraint is DEFERRABLE INITIALLY DEFERRED, so the
    # intermediate states inside this flush do not trip it.
    _renumber(ordered)
    await db.flush()
    return ordered


async def delete_stage(db: AsyncSession, template: PipelineTemplate, stage: Stage) -> None:
    """
    Refuses while deals occupy the stage rather than silently orphaning them (spec 6.3).
    The caller reports the count so the UI can offer to reassign first.
    """
    if len(template.stages) <= 1:
        raise LastStage

    count = await _count_deals_in_stage(db, stage.id)
    if count > 0:
        raise StageInUse(count)

    remaining = [existing for existing in _ordered(template) if existing.id != stage.id]
    await db.delete(stage)
    await db.flush()
    _renumber(remaining)
    await db.flush()


async def _count_deals_in_stage(db: AsyncSession, stage_id: uuid.UUID) -> int:
    from sqlalchemy import func

    result = await db.execute(select(func.count()).select_from(Deal).where(Deal.stage_id == stage_id))
    return int(result.scalar_one())


async def reassign_deals(
    db: AsyncSession, from_stage: Stage, to_stage: Stage, actor_id: uuid.UUID
) -> int:
    """
    Bulk-moves every deal out of one stage so the stage can then be deleted, logging the
    change against each deal. Refuses a target in a different pipeline.

    Deliberately does not apply the champion gate, unlike `move_deal_to_stage`. This is an
    administrator emptying a stage in order to remove it, not a rep advancing a deal: a gate here
    would make a stage undeletable because some deal in it lacks a champion, and would leave the
    admin no way out except editing every deal first.
    """
    if from_stage.pipeline_template_id != to_stage.pipeline_template_id:
        raise CrossPipelineMove
    if from_stage.id == to_stage.id:
        return 0

    result = await db.execute(select(Deal).where(Deal.stage_id == from_stage.id))
    affected = list(result.scalars())

    for deal in affected:
        deal.stage_id = to_stage.id
        db.add(
            Activity(
                deal_id=deal.id,
                kind=ActivityKind.STAGE_CHANGE,
                summary=f"Reassigned to {to_stage.name} during pipeline changes.",
                author_id=actor_id,
            )
        )

    await db.flush()
    return len(affected)


async def duplicate_template(db: AsyncSession, source: PipelineTemplate, name: str) -> PipelineTemplate:
    """Stages are copied with fresh ids so the two templates never share stage records."""
    copy = PipelineTemplate(name=name)
    db.add(copy)
    await db.flush()

    for stage in _ordered(source):
        clone = Stage(
            pipeline_template_id=copy.id,
            name=stage.name,
            short_name=stage.short_name,
            probability=stage.probability,
            color=stage.color,
            kind=stage.kind,
            position=stage.position,
            wip_limit=stage.wip_limit,
            requires_champion=stage.requires_champion,
            entry_criteria=stage.entry_criteria,
            exit_criteria=stage.exit_criteria,
            key_activities=stage.key_activities,
        )
        # Fresh deliverable rows, not the source's. Sharing them would mean a deal on the
        # duplicated pipeline ticking a box on the original's checklist.
        for deliverable in stage.deliverables:
            clone.deliverables.append(
                StageDeliverable(text=deliverable.text, position=deliverable.position)
            )
        db.add(clone)

    await db.flush()
    await db.refresh(copy)
    return copy


DEFAULT_STAGES: tuple[tuple[str, int, str, StageKind], ...] = (
    ("New stage", 10, "#a6bbd1", StageKind.OPEN),
    ("Closed Won", 100, "#004eba", StageKind.WON),
    ("Closed Lost", 0, "#c8324f", StageKind.LOST),
)


async def create_template(db: AsyncSession, name: str) -> PipelineTemplate:
    """A new pipeline still needs somewhere for deals to land and to finish."""
    template = PipelineTemplate(name=name)
    db.add(template)
    await db.flush()

    for position, (stage_name, probability, color, kind) in enumerate(DEFAULT_STAGES, start=1):
        db.add(
            Stage(
                pipeline_template_id=template.id,
                name=stage_name,
                short_name=stage_name,
                probability=probability,
                color=color,
                kind=kind,
                position=position,
            )
        )

    await db.flush()
    await db.refresh(template)
    return template


async def move_deal_to_stage(db: AsyncSession, deal: Deal, stage: Stage, actor_id: uuid.UUID) -> bool:
    """
    Advancement is a plain manual move — no exit-criteria gating (spec 6.4), even though every stage
    carries its criteria — with one exception: a stage marked `requires_champion` will not accept a
    deal that has not identified one.

    That check lives here rather than in the endpoint so both routes to a stage change are covered:
    `POST /deals/{id}/stage` from the board, and the `stage_id` inside `PATCH /deals/{id}`. A gate on
    one of the two would be a gate on neither.

    Raises `contact_service.ChampionRequired`, which the API turns into a 409 — the caller has
    permission, the deal is simply not ready. Imported inside the function because
    `services.contacts` imports the repositories, and importing it at module scope closes a cycle.
    """
    if stage.pipeline_template_id != deal.pipeline_template_id:
        raise CrossPipelineMove
    if deal.stage_id == stage.id:
        return False

    from app.services import contacts as contact_service

    await contact_service.assert_champion_ready(db, deal.id, stage)

    deal.stage_id = stage.id
    db.add(
        Activity(
            deal_id=deal.id,
            kind=ActivityKind.STAGE_CHANGE,
            summary=f"Moved to {stage.name}.",
            author_id=actor_id,
        )
    )
    await db.flush()
    return True
