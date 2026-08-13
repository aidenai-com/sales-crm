import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.core import permissions
from app.models import Activity, ActivityKind, Deal, DealContact, DealRole, Stage
from app.repositories import accounts as accounts_repo
from app.repositories import contacts as contacts_repo
from app.repositories import deals as deals_repo
from app.schemas.common import Message
from app.schemas.contact import (
    ChampionGap,
    DealContactAssignment,
    DealContactCreate,
    DealContactUpdate,
    DealPeople,
    DealRoleCreate,
)
from app.schemas.crm import DealCreate, DealDetail, DealStageMove, DealUpdate, NudgeResult
from app.services import contacts as contact_service
from app.services import nudges as nudge_service
from app.services import pipelines as pipeline_service
from app.services.serializers import deal_detail

router = APIRouter(prefix="/deals", tags=["deals"])


async def _load_stage(db: DbSession, stage_id: uuid.UUID) -> Stage:
    stage = await db.get(Stage, stage_id)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    return stage


async def _detail(db: DbSession, deal: Deal) -> DealDetail:
    last_activity = await deals_repo.last_activity_map(db)
    stage_moves = await deals_repo.last_stage_change_map(db)
    # The deal's own pipeline stages, for the cumulative expected-days sum ageing needs. Loaded here rather
    # than reached through `deal.stage.pipeline`, which is not eagerly loaded and would lazy-load in async.
    template = await pipeline_service.get_template(db, deal.pipeline_template_id)
    stages = list(template.stages) if template is not None else []
    return deal_detail(deal, last_activity, stage_moves=stage_moves, stages=stages)


async def _require_visible_deal(db: DbSession, user, deal_id: uuid.UUID) -> Deal:
    """
    Loads a deal the caller is allowed to see.

    A deal outside their scope is reported as missing rather than forbidden: a 403 would
    confirm the deal exists and that its id is valid.
    """
    deal = await deals_repo.get(db, deal_id)
    if deal is None or (not permissions.is_admin(user) and deal.owner_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


async def _reload_detail(db: DbSession, deal_id: uuid.UUID) -> DealDetail:
    """
    Re-reads a deal after a write, for the response.

    `expire_on_commit` is False on this session, so after a committed change to `stage_id`
    the already-loaded `stage` relationship still points at the previous stage — the write
    lands but the response describes the old state, lagging by exactly one call.

    `expire_all()` is not sufficient: eager loaders do not overwrite an already-loaded
    relationship on an instance that is still in the identity map. Detaching everything
    forces the next query to build the object from scratch.
    """
    db.expunge_all()
    deal = await deals_repo.get(db, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return await _detail(db, deal)


async def _resolve_assignments(
    db: DbSession, assignments: list[DealContactAssignment]
) -> list[tuple[uuid.UUID, uuid.UUID | None]]:
    """
    Checks that every contact exists, and every named role exists.

    There is no longer a rule that a contact must work at the deal's customer or partner. That check
    used `deals.partner_id` to know the second permitted company, and with the column gone there is
    nothing to check against — a partner-side contact works at a third company by definition, so
    narrowing to the customer would make attaching one impossible. Anybody in the directory can be
    attached; who they work for is shown on every row so a mistake is visible rather than prevented.

    A role may be absent. Attaching somebody before anyone knows what they are is the normal opening
    move, not an incomplete request.

    Duplicates in the payload are collapsed rather than rejected. A form that lets somebody pick the
    same pairing twice has a UI problem, not a data problem, and a 422 midway through creating a deal is
    a poor way to report it.
    """
    seen: set[tuple[uuid.UUID, uuid.UUID | None]] = set()
    resolved: list[tuple[uuid.UUID, uuid.UUID | None]] = []

    for assignment in assignments:
        pair = (assignment.contact_id, assignment.role_id)
        if pair in seen:
            continue
        seen.add(pair)

        if await contacts_repo.get(db, assignment.contact_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
        if assignment.role_id is not None and await contacts_repo.get_role(db, assignment.role_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        resolved.append(pair)

    return resolved


async def _resolve_roles(db: DbSession, role_ids: list[uuid.UUID]) -> list[uuid.UUID]:
    """The roles a deal will track, de-duplicated and checked to exist."""
    resolved: list[uuid.UUID] = []
    for role_id in role_ids:
        if role_id in resolved:
            continue
        if await contacts_repo.get_role(db, role_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        resolved.append(role_id)
    return resolved


def _log_people_change(db: DbSession, deal_id: uuid.UUID, actor_id: uuid.UUID, summary: str) -> None:
    """
    Records a change to the people or roles on a deal, in the deal's own timeline.

    Added to the session, not committed: every caller is mid-transaction, so the activity lands with the
    change it describes or not at all. A timeline claiming a champion was mapped by a request that was
    then refused would be worse than no timeline.

    `CONTACT_CHANGE` deliberately does not count as a touch — see `NON_TOUCH_KINDS`. Filing who is
    involved is not contact with them, and a deal whose champion was named a month ago and never called
    is precisely the deal the staleness flag exists to surface.
    """
    db.add(
        Activity(
            deal_id=deal_id,
            kind=ActivityKind.CONTACT_CHANGE,
            summary=summary,
            author_id=actor_id,
        )
    )


async def _people(db: DbSession, deal_id: uuid.UUID) -> DealPeople:
    """
    The whole picture for one deal: the roles it tracks, and the people on it.

    Returned as one object by every write below rather than the single row that changed. The client
    renders roles and contacts as one grouped list where an unfilled role and an unmapped person both
    have to appear in the right place — handing it a fragment would have it re-fetch or guess.
    """
    roles = await contacts_repo.list_deal_roles(db, deal_id)
    contacts = await contacts_repo.list_deal_contacts(db, deal_id)
    return DealPeople(
        roles=[contact_service.deal_role_read(link, filled) for link, filled in roles],
        contacts=[contact_service.deal_contact_read(link) for link in contacts],
    )


@router.get("", response_model=list[DealDetail])
async def list_deals(
    db: DbSession,
    user: CurrentUser,
    pipeline_id: uuid.UUID | None = Query(default=None),
    account_id: uuid.UUID | None = Query(default=None),
    lead_id: uuid.UUID | None = Query(default=None),
    owner_id: uuid.UUID | None = Query(default=None),
    stage_id: uuid.UUID | None = Query(default=None),
    open_only: bool = Query(default=False),
) -> list[DealDetail]:
    """Every deal the filters allow, each carrying its derived health and stage detail."""
    found = await deals_repo.list_all(
        db,
        user,
        pipeline_id=pipeline_id,
        account_id=account_id,
        lead_id=lead_id,
        owner_id=owner_id,
        stage_id=stage_id,
        open_only=open_only,
    )
    last_activity = await deals_repo.last_activity_map(db)
    stage_moves = await deals_repo.last_stage_change_map(db)
    # One template read for the whole list, keyed by pipeline: a deals index spans both pipelines, and asking
    # per deal would be a query per row to compute a number that is the same for every row in that pipeline.
    stages_by_pipeline = {
        template.id: list(template.stages) for template in await pipeline_service.list_templates(db)
    }
    return [
        deal_detail(
            deal,
            last_activity,
            stage_moves=stage_moves,
            stages=stages_by_pipeline.get(deal.pipeline_template_id, []),
        )
        for deal in found
    ]


@router.get("/champion-gaps", response_model=list[ChampionGap])
async def list_champion_gaps(db: DbSession, user: CurrentUser) -> list[ChampionGap]:
    """
    Deals sitting in a stage whose champion requirement they do not meet.

    Declared before `/{deal_id}`: routes match in order, and the parameterised one would otherwise
    swallow this path and fail to parse "champion-gaps" as a UUID.

    A separate call rather than a field on `DealDetail`. The gate needs the deal's contacts, which the
    deal list does not load, and `DealDetail` is the response to every deal write — putting it there
    would add a champion lookup to every rename.
    """
    return await contact_service.champion_gaps(db, user)


@router.get("/{deal_id}", response_model=DealDetail)
async def read_deal(db: DbSession, user: CurrentUser, deal_id: uuid.UUID) -> DealDetail:
    return await _detail(db, await _require_visible_deal(db, user, deal_id))


@router.post("", response_model=DealDetail, status_code=status.HTTP_201_CREATED)
async def create_deal(db: DbSession, user: CurrentUser, payload: DealCreate) -> DealDetail:
    # Reps may create deals, but only ones they own.
    permissions.require_own_assignment(user, payload.owner_id)

    if await accounts_repo.get(db, payload.account_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    stage = await _load_stage(db, payload.stage_id)
    if stage.pipeline_template_id != payload.pipeline_template_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That stage belongs to a different pipeline",
        )

    # Both validated before the deal is created, so a bad id cannot leave a deal behind with nobody on
    # it — the one state the client-side "at least one contact" rule exists to prevent.
    assignments = await _resolve_assignments(db, payload.contacts)
    role_ids = await _resolve_roles(db, payload.roles)

    fields = payload.model_dump(exclude={"contacts", "roles"})
    deal = Deal(**fields)
    db.add(deal)
    await db.flush()

    # Every role named on a contact is also tracked, even if the creator did not list it separately.
    # Otherwise a deal could have a champion whose role it does not track, and the People panel would
    # show the person under a heading that is not in its own list of roles.
    for role_id in {*role_ids, *(role for _, role in assignments if role is not None)}:
        db.add(DealRole(deal_id=deal.id, role_id=role_id))
    for contact_id, role_id in assignments:
        db.add(DealContact(deal_id=deal.id, contact_id=contact_id, role_id=role_id))

    await db.commit()
    return await _reload_detail(db, deal.id)


@router.patch("/{deal_id}", response_model=DealDetail)
async def update_deal(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, payload: DealUpdate
) -> DealDetail:
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "edit a deal")

    fields = payload.model_dump(exclude_unset=True)
    permissions.require_no_owner_change(user, deal.owner_id, fields.get("owner_id"))

    # A stage change through the generic patch is still a stage change: route it through
    # the service so it gets logged like a board move would.
    new_stage_id = fields.pop("stage_id", None)
    for field, value in fields.items():
        setattr(deal, field, value)

    if new_stage_id is not None and new_stage_id != deal.stage_id:
        stage = await _load_stage(db, new_stage_id)
        try:
            await pipeline_service.move_deal_to_stage(db, deal, stage, user.id)
        except pipeline_service.CrossPipelineMove as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="That stage belongs to a different pipeline",
            ) from exc
        except contact_service.ChampionRequired as exc:
            # Rolled back explicitly: the non-stage fields above were already assigned to the deal, and
            # a refused move must not leave a renamed or revalued deal behind as a side effect.
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await db.commit()
    return await _reload_detail(db, deal_id)


@router.post("/{deal_id}/stage", response_model=DealDetail)
async def move_deal(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, payload: DealStageMove
) -> DealDetail:
    """
    Moves a deal to another stage and logs the change.

    No exit-criteria gating (spec 6.4): any stage can be reached from any other inside the
    same pipeline, which is what the board's drag-and-drop and move-to menu both call.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    # The core rule: a rep advances their own deals and nobody else's.
    permissions.require_deal_owner(user, deal, "move a deal")

    stage = await _load_stage(db, payload.stage_id)
    try:
        await pipeline_service.move_deal_to_stage(db, deal, stage, user.id)
    except pipeline_service.CrossPipelineMove as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That stage belongs to a different pipeline",
        ) from exc
    except contact_service.ChampionRequired as exc:
        # 409, not 403: the caller has permission, the deal is not ready. The same distinction
        # `nudge_deal` draws below.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await db.commit()
    return await _reload_detail(db, deal_id)


@router.delete("/{deal_id}", response_model=Message)
async def delete_deal(db: DbSession, user: CurrentUser, deal_id: uuid.UUID) -> Message:
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "delete a deal")

    name = deal.name
    await db.delete(deal)
    await db.commit()
    return Message(detail=f"Deleted {name}")


# --- Deal roles and contacts -------------------------------------------------


@router.get("/{deal_id}/people", response_model=DealPeople)
async def read_deal_people(db: DbSession, user: CurrentUser, deal_id: uuid.UUID) -> DealPeople:
    """The roles this deal tracks and the people on it, mapped or not."""
    await _require_visible_deal(db, user, deal_id)
    return await _people(db, deal_id)


@router.post("/{deal_id}/roles", response_model=DealPeople, status_code=status.HTTP_201_CREATED)
async def add_deal_role(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, payload: DealRoleCreate
) -> DealPeople:
    """
    Starts tracking a role on this deal, with or without anybody in it.

    The deal's owner decides which roles matter here — the same opportunity can need a technical buyer
    and the next one not. Adding a role is how "we still have not found the exec sponsor" becomes
    visible rather than remembered.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "change the roles on a deal")

    role = await contacts_repo.get_role(db, payload.role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    db.add(DealRole(deal_id=deal_id, role_id=payload.role_id))
    _log_people_change(db, deal_id, user.id, f"Now tracking the {role.name} role.")
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This deal already tracks that role"
        ) from exc

    return await _people(db, deal_id)


@router.delete("/{deal_id}/roles/{link_id}", response_model=DealPeople)
async def remove_deal_role(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, link_id: uuid.UUID
) -> DealPeople:
    """
    Stops tracking a role, and unmaps anybody who held it.

    The people stay on the deal — losing a role should not lose the person, who is still involved even
    if the label was wrong. They become unmapped, which the deal page shows plainly.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "change the roles on a deal")

    link = await contacts_repo.get_deal_role(db, link_id)
    if link is None or link.deal_id != deal_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not tracked on this deal")

    unmapped = await db.execute(
        update(DealContact)
        .where(DealContact.deal_id == deal_id, DealContact.role_id == link.role_id)
        .values(role_id=None)
    )
    role_name = link.role.name
    await db.delete(link)

    # The count is in the sentence because it is the surprising part: untracking a role quietly leaves
    # people behind with no role, and somebody reading the timeline later needs to know that happened.
    held = unmapped.rowcount or 0
    _log_people_change(
        db,
        deal_id,
        user.id,
        f"Stopped tracking the {role_name} role."
        + (f" {held} {'person' if held == 1 else 'people'} left without a role." if held else ""),
    )
    await db.commit()
    return await _people(db, deal_id)


@router.post("/{deal_id}/contacts", response_model=DealPeople, status_code=status.HTTP_201_CREATED)
async def add_deal_contact(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, payload: DealContactCreate
) -> DealPeople:
    """
    Attaches somebody to this deal, in a role or not yet.

    A role sent here is also tracked on the deal, so the People panel never shows a person under a
    heading missing from the deal's own list of roles.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "change who is on a deal")

    await _resolve_assignments(
        db, [DealContactAssignment(contact_id=payload.contact_id, role_id=payload.role_id)]
    )

    if payload.role_id is not None and not await contacts_repo.deal_tracks_role(
        db, deal_id, payload.role_id
    ):
        db.add(DealRole(deal_id=deal_id, role_id=payload.role_id))

    db.add(DealContact(deal_id=deal_id, contact_id=payload.contact_id, role_id=payload.role_id))

    added = await contacts_repo.get(db, payload.contact_id)
    role = (
        await contacts_repo.get_role(db, payload.role_id) if payload.role_id is not None else None
    )
    _log_people_change(
        db,
        deal_id,
        user.id,
        f"Added {added.full_name} ({added.account.name})"  # type: ignore[union-attr]
        + (f" as {role.name}." if role else ", role not decided yet."),
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "That person already holds that role on this deal"
                if payload.role_id
                else "That person is already on this deal"
            ),
        ) from exc

    return await _people(db, deal_id)


@router.patch("/{deal_id}/contacts/{link_id}", response_model=DealPeople)
async def remap_deal_contact(
    db: DbSession,
    user: CurrentUser,
    deal_id: uuid.UUID,
    link_id: uuid.UUID,
    payload: DealContactUpdate,
) -> DealPeople:
    """
    Changes what somebody is on this deal, or unmaps them.

    This is the operation the whole shape exists for: contacts arrive unmapped and get mapped as the
    deal progresses, and a mapping that turns out wrong gets corrected. Sending a null role unmaps
    without detaching — a champion who turned out not to be one is still involved.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "change who is on a deal")

    link = await db.get(DealContact, link_id)
    if link is None or link.deal_id != deal_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not on this deal")

    if payload.role_id is not None:
        if await contacts_repo.get_role(db, payload.role_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        if not await contacts_repo.deal_tracks_role(db, deal_id, payload.role_id):
            db.add(DealRole(deal_id=deal_id, role_id=payload.role_id))

    # Captured before the change, so the sentence can say what it was as well as what it became.
    was = link.role.name if link.role is not None else None
    person = link.contact.full_name
    now = (await contacts_repo.get_role(db, payload.role_id)).name if payload.role_id else None  # type: ignore[union-attr]

    link.role_id = payload.role_id
    if now is None:
        _log_people_change(
            db, deal_id, user.id, f"{person} is no longer the {was}, and stays on the deal."
            if was
            else f"{person} still has no role."
        )
    elif was is None:
        _log_people_change(db, deal_id, user.id, f"Mapped {person} as {now}.")
    else:
        _log_people_change(db, deal_id, user.id, f"{person} changed from {was} to {now}.")
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That person already appears on this deal in that role",
        ) from exc

    return await _people(db, deal_id)


@router.delete("/{deal_id}/contacts/{link_id}", response_model=DealPeople)
async def remove_deal_contact(
    db: DbSession, user: CurrentUser, deal_id: uuid.UUID, link_id: uuid.UUID
) -> DealPeople:
    """
    Detaches one person from this deal. The contact itself is untouched, and the role stays tracked.

    Removing a champion is allowed even when the deal's stage requires one. A deal whose champion has
    left the company needs to record that, and refusing the edit would only make the CRM say something
    untrue. What the gate does instead is refuse to let the deal *move on* until a champion is named
    again, and the deal is flagged in the meantime — the constraint belongs on motion, not on honesty.
    """
    deal = await _require_visible_deal(db, user, deal_id)
    permissions.require_deal_owner(user, deal, "change who is on a deal")

    link = await db.get(DealContact, link_id)
    if link is None or link.deal_id != deal_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not on this deal")

    _log_people_change(
        db,
        deal_id,
        user.id,
        f"Removed {link.contact.full_name}"
        + (f" ({link.role.name}) from the deal." if link.role is not None else " from the deal."),
    )
    await db.delete(link)
    await db.commit()
    return await _people(db, deal_id)


@router.post("/{deal_id}/nudge", response_model=NudgeResult, status_code=status.HTTP_201_CREATED)
async def nudge_deal(db: DbSession, user: CurrentUser, deal_id: uuid.UUID) -> NudgeResult:
    """
    Chase this deal's owner. Administrators only.

    Not `_require_visible_deal`: that helper narrows to deals the caller owns for a rep, and the
    whole point here is acting on somebody else's deal. Admin-only, so the scope is every deal.

    A rep nudging their own deal would be emailing themselves, and a rep nudging a colleague is
    a management action wearing a peer's clothes — either way it belongs to an admin.
    """
    permissions.require_admin(user, "nudge a deal's owner")

    deal = await deals_repo.get(db, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")

    # A nudge is an email to a person. Sending one to a deactivated account would post mail nobody
    # collects and log a reminder claiming somebody is chasing this — the deal would look attended to
    # precisely because nobody can attend to it. The fix is a new owner, so that is what it says.
    if not deal.owner.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{deal.owner.full_name} is deactivated, so a nudge would reach nobody. "
                "Reassign this deal to chase it."
            ),
        )

    touched = (await deals_repo.last_activity_map(db)).get(deal.id)

    try:
        reminder = await nudge_service.nudge(db, deal, user, touched)  # type: ignore[arg-type]
    except nudge_service.NotNudgeable as exc:
        # 409, not 403: the caller has permission, the deal is simply not in a state that makes
        # the action meaningful.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except nudge_service.OnCooldown as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{deal.owner.full_name} was already nudged about this deal. "
                f"You can nudge again after {nudge_service.COOLDOWN_HOURS} hours."
            ),
        ) from exc

    return NudgeResult(
        deal_id=deal.id,
        owner_id=deal.owner_id,
        owner_name=deal.owner.full_name,
        reminder_id=reminder.id,
        nudged_at=reminder.created_at,
        detail=f"Nudged {deal.owner.full_name}.",
    )
