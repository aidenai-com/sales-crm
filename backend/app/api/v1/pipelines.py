import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.models import PipelineTemplate, Stage
from app.repositories import deals as deals_repo
from app.schemas.common import Message
from app.schemas.pipeline import (
    PipelineTemplateCreate,
    PipelineTemplateDuplicate,
    PipelineTemplateRead,
    PipelineTemplateUpdate,
    ReassignResult,
    StageCreate,
    StageReassign,
    StageReorder,
    StageUpdate,
)
from app.services import pipelines as service

router = APIRouter(prefix="/pipelines", tags=["pipelines"])

NAME_TAKEN = HTTPException(
    status_code=status.HTTP_409_CONFLICT, detail="A pipeline with that name already exists"
)


async def _require_template(db: DbSession, pipeline_id: uuid.UUID) -> PipelineTemplate:
    template = await service.get_template(db, pipeline_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline not found")
    return template


async def _reload_template(db: DbSession, pipeline_id: uuid.UUID) -> PipelineTemplate:
    """
    Re-reads a template after a write, for the response.

    Necessary because `expire_on_commit` is False: a reorder rewrites `position` values
    correctly, but the already-loaded `stages` collection keeps its previous order, so the
    response would list them out of sequence. Detaching forces a fresh, ordered load.
    """
    db.expunge_all()
    return await _require_template(db, pipeline_id)


def _require_stage(template: PipelineTemplate, stage_id: uuid.UUID) -> Stage:
    stage = next((s for s in template.stages if s.id == stage_id), None)
    if stage is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="That stage is not in this pipeline"
        )
    return stage


# --- Read: available to every signed-in user ---------------------------------
# Reps need the stage list to render boards; only editing is admin-only (spec 6.3).


@router.get("", response_model=list[PipelineTemplateRead])
async def list_pipelines(db: DbSession, _: CurrentUser) -> list[PipelineTemplate]:
    return await service.list_templates(db)


@router.get("/{pipeline_id}", response_model=PipelineTemplateRead)
async def read_pipeline(db: DbSession, _: CurrentUser, pipeline_id: uuid.UUID) -> PipelineTemplate:
    return await _require_template(db, pipeline_id)


# --- Write: admin only (spec 6.3) -------------------------------------------


@router.post("", response_model=PipelineTemplateRead, status_code=status.HTTP_201_CREATED)
async def create_pipeline(
    db: DbSession, _: AdminUser, payload: PipelineTemplateCreate
) -> PipelineTemplate:
    try:
        if payload.copy_stages_from is not None:
            # Starting from an existing pipeline's stages is the common case: most new
            # pipelines are a variation on one that already works.
            source = await _require_template(db, payload.copy_stages_from)
            template = await service.duplicate_template(db, source, payload.name)
            template.tracks_partner = payload.tracks_partner
        else:
            template = await service.create_template(db, payload.name, payload.tracks_partner)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise NAME_TAKEN from exc
    return await _reload_template(db, template.id)


@router.patch("/{pipeline_id}", response_model=PipelineTemplateRead)
async def update_pipeline(
    db: DbSession, _: AdminUser, pipeline_id: uuid.UUID, payload: PipelineTemplateUpdate
) -> PipelineTemplate:
    template = await _require_template(db, pipeline_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, field, value)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise NAME_TAKEN from exc
    return await _reload_template(db, pipeline_id)


@router.post("/{pipeline_id}/duplicate", response_model=PipelineTemplateRead, status_code=201)
async def duplicate_pipeline(
    db: DbSession, _: AdminUser, pipeline_id: uuid.UUID, payload: PipelineTemplateDuplicate
) -> PipelineTemplate:
    """Duplicating is the supported way to add a new pipeline type (spec 6.3)."""
    source = await _require_template(db, pipeline_id)
    try:
        copy = await service.duplicate_template(db, source, payload.name)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise NAME_TAKEN from exc
    return await _reload_template(db, copy.id)


@router.delete("/{pipeline_id}", response_model=Message)
async def delete_pipeline(db: DbSession, _: AdminUser, pipeline_id: uuid.UUID) -> Message:
    template = await _require_template(db, pipeline_id)

    stage_ids = [stage.id for stage in template.stages]
    in_use = sum([await deals_repo.count_in_stage(db, stage_id) for stage_id in stage_ids])
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{in_use} deals are still on this pipeline. Move them first.",
        )

    name = template.name
    await db.delete(template)
    await db.commit()
    return Message(detail=f"Deleted {name}")


# --- Stages ------------------------------------------------------------------


@router.post("/{pipeline_id}/stages", response_model=PipelineTemplateRead, status_code=201)
async def add_stage(
    db: DbSession, _: AdminUser, pipeline_id: uuid.UUID, payload: StageCreate
) -> PipelineTemplate:
    template = await _require_template(db, pipeline_id)
    await service.add_stage(db, template, payload)
    await db.commit()
    return await _reload_template(db, pipeline_id)


@router.patch("/{pipeline_id}/stages/{stage_id}", response_model=PipelineTemplateRead)
async def update_stage(
    db: DbSession,
    _: AdminUser,
    pipeline_id: uuid.UUID,
    stage_id: uuid.UUID,
    payload: StageUpdate,
) -> PipelineTemplate:
    template = await _require_template(db, pipeline_id)
    await service.update_stage(db, _require_stage(template, stage_id), payload)
    await db.commit()
    return await _reload_template(db, pipeline_id)


@router.post("/{pipeline_id}/stages/{stage_id}/reorder", response_model=PipelineTemplateRead)
async def reorder_stage(
    db: DbSession,
    _: AdminUser,
    pipeline_id: uuid.UUID,
    stage_id: uuid.UUID,
    payload: StageReorder,
) -> PipelineTemplate:
    template = await _require_template(db, pipeline_id)
    _require_stage(template, stage_id)
    await service.reorder_stage(db, template, stage_id, payload.to_index)
    await db.commit()
    return await _reload_template(db, pipeline_id)


@router.delete("/{pipeline_id}/stages/{stage_id}", response_model=PipelineTemplateRead)
async def delete_stage(
    db: DbSession, _: AdminUser, pipeline_id: uuid.UUID, stage_id: uuid.UUID
) -> PipelineTemplate:
    """
    Refuses while deals occupy the stage, reporting the count so the client can offer to
    reassign first (spec 6.3). Deals are never silently orphaned.
    """
    template = await _require_template(db, pipeline_id)
    stage = _require_stage(template, stage_id)

    try:
        await service.delete_stage(db, template, stage)
    except service.StageInUse as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{exc.deal_count} deals are still in this stage. "
                "Reassign them to another stage first."
            ),
        ) from exc
    except service.LastStage as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pipeline must keep at least one stage",
        ) from exc

    await db.commit()
    return await _reload_template(db, pipeline_id)


@router.post("/{pipeline_id}/stages/{stage_id}/reassign", response_model=ReassignResult)
async def reassign_stage_deals(
    db: DbSession,
    admin: AdminUser,
    pipeline_id: uuid.UUID,
    stage_id: uuid.UUID,
    payload: StageReassign,
) -> ReassignResult:
    """Bulk-moves every deal out of a stage, so the stage can then be deleted."""
    template = await _require_template(db, pipeline_id)
    from_stage = _require_stage(template, stage_id)
    to_stage = _require_stage(template, payload.to_stage_id)

    try:
        moved = await service.reassign_deals(db, from_stage, to_stage, admin.id)
    except service.CrossPipelineMove as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Deals can only be reassigned within the same pipeline",
        ) from exc

    await db.commit()
    return ReassignResult(reassigned=moved)
