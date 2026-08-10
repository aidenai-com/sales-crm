import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession
from app.core import permissions
from app.models import Account, ActivitySubjectType, Deal, Lead, Reminder
from app.repositories import activities as activities_repo
from app.schemas.common import Message
from app.schemas.reminder import ReminderCreate, ReminderInbox, ReminderRead, ReminderUpdate
from app.services import reminders as reminders_service

router = APIRouter(prefix="/reminders", tags=["reminders"])


async def _require_visible_subject(db: DbSession, user, payload: ReminderCreate) -> None:
    """
    A reminder may only be attached to a record the caller can already see.

    Without this, a rep could probe for valid ids by scheduling reminders against them and
    reading back the subject label.
    """
    if payload.subject_type is ActivitySubjectType.DEAL:
        deal = await db.get(Deal, payload.subject_id)
        if deal is None or (not permissions.is_admin(user) and deal.owner_id != user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    elif payload.subject_type is ActivitySubjectType.LEAD:
        lead = await db.get(Lead, payload.subject_id)
        if lead is None or (not permissions.is_admin(user) and lead.owner_id != user.id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Business unit not found"
            )
    else:
        account = await db.get(Account, payload.subject_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")


async def _require_own_reminder(db: DbSession, user, reminder_id: uuid.UUID) -> Reminder:
    reminder = await reminders_service.get(db, reminder_id)
    if reminder is None or (
        not permissions.is_admin(user) and reminder.assignee_id != user.id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    return reminder


@router.get("/inbox", response_model=ReminderInbox)
async def read_inbox(db: DbSession, user: CurrentUser) -> ReminderInbox:
    """
    Everything demanding this user's attention, for the surface shown on opening the app.

    Combines reminders they scheduled with derived nudges about leads nobody has touched for
    a week. One request, because it renders as one card.
    """
    return await reminders_service.inbox(db, user)


@router.get("", response_model=list[ReminderRead])
async def list_reminders(
    db: DbSession,
    user: CurrentUser,
    include_complete: bool = Query(default=False),
) -> list[ReminderRead]:
    found = await reminders_service.list_for(db, user, include_complete=include_complete)
    now = datetime.now(timezone.utc)
    return [reminders_service.to_read(reminder, now) for reminder in found]


@router.post("", response_model=ReminderRead, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    db: DbSession, user: CurrentUser, payload: ReminderCreate
) -> ReminderRead:
    await _require_visible_subject(db, user, payload)

    assignee_id = payload.assignee_id or user.id
    # Same rule as deal creation: a rep assigns work to themselves and nobody else.
    permissions.require_own_assignment(user, assignee_id)

    reminder = Reminder(
        title=payload.title,
        due_at=payload.due_at,
        assignee_id=assignee_id,
        created_by_id=user.id,
        **activities_repo.subject_columns(payload.subject_type, payload.subject_id),
    )
    db.add(reminder)
    await db.commit()

    stored = await reminders_service.get(db, reminder.id)
    if stored is None:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    return reminders_service.to_read(stored)


@router.patch("/{reminder_id}", response_model=ReminderRead)
async def update_reminder(
    db: DbSession, user: CurrentUser, reminder_id: uuid.UUID, payload: ReminderUpdate
) -> ReminderRead:
    reminder = await _require_own_reminder(db, user, reminder_id)

    fields = payload.model_dump(exclude_unset=True)
    permissions.require_no_owner_change(user, reminder.assignee_id, fields.get("assignee_id"))

    rescheduled = "due_at" in fields and fields["due_at"] != reminder.due_at
    for field, value in fields.items():
        setattr(reminder, field, value)

    # Rescheduling clears the notification stamp so the new time genuinely notifies. Without
    # this, pushing a reminder out by a week would silently never fire again.
    if rescheduled:
        reminder.notified_at = None

    await db.commit()
    refreshed = await reminders_service.get(db, reminder_id)
    if refreshed is None:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    return reminders_service.to_read(refreshed)


@router.post("/{reminder_id}/complete", response_model=ReminderRead)
async def complete_reminder(
    db: DbSession, user: CurrentUser, reminder_id: uuid.UUID
) -> ReminderRead:
    reminder = await _require_own_reminder(db, user, reminder_id)
    # Idempotent: completing twice keeps the original timestamp rather than moving it.
    if reminder.completed_at is None:
        reminder.completed_at = datetime.now(timezone.utc)
        await db.commit()

    refreshed = await reminders_service.get(db, reminder_id)
    if refreshed is None:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    return reminders_service.to_read(refreshed)


@router.post("/{reminder_id}/reopen", response_model=ReminderRead)
async def reopen_reminder(db: DbSession, user: CurrentUser, reminder_id: uuid.UUID) -> ReminderRead:
    reminder = await _require_own_reminder(db, user, reminder_id)
    reminder.completed_at = None
    await db.commit()

    refreshed = await reminders_service.get(db, reminder_id)
    if refreshed is None:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    return reminders_service.to_read(refreshed)


@router.delete("/{reminder_id}", response_model=Message)
async def delete_reminder(db: DbSession, user: CurrentUser, reminder_id: uuid.UUID) -> Message:
    reminder = await _require_own_reminder(db, user, reminder_id)
    title = reminder.title
    await db.delete(reminder)
    await db.commit()
    return Message(detail=f"Deleted reminder: {title}")
