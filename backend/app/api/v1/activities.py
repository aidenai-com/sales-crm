import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession
from app.core import permissions
from app.models import Activity, ActivitySubjectType
from app.repositories import accounts as accounts_repo
from app.repositories import activities as activities_repo
from app.repositories import deals as deals_repo
from app.schemas.common import Message
from app.schemas.crm import ActivityCreate, ActivityDetail
from app.services.serializers import activity_detail

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("", response_model=list[ActivityDetail])
async def list_activities(
    db: DbSession,
    user: CurrentUser,
    subject_type: ActivitySubjectType | None = Query(default=None),
    subject_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[ActivityDetail]:
    """
    Recent activity, newest first. Filter by subject to get one record's timeline; omit
    the filter for the dashboard feed.
    """
    if (subject_type is None) != (subject_id is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="subjectType and subjectId must be provided together",
        )

    found = await activities_repo.list_all(
        db, user, subject_type=subject_type, subject_id=subject_id, limit=limit
    )
    return [activity_detail(activity) for activity in found]


@router.post("", response_model=ActivityDetail, status_code=status.HTTP_201_CREATED)
async def create_activity(
    db: DbSession, user: CurrentUser, payload: ActivityCreate
) -> ActivityDetail:
    """
    Logs an activity against an account, a lead, or a deal (R4).

    The subject is verified to exist first: the database constraint guarantees exactly one
    subject column is set, but not that it points at a real row until the insert fails.
    """
    await _assert_subject_visible(db, user, payload.subject_type, payload.subject_id)
    # Logging on someone else's behalf would forge a record; the author is the caller.
    permissions.require_own_assignment(user, payload.author_id)

    activity = Activity(
        kind=payload.kind,
        summary=payload.summary,
        author_id=payload.author_id or user.id,
        **activities_repo.subject_columns(payload.subject_type, payload.subject_id),
    )
    if payload.occurred_at is not None:
        activity.occurred_at = payload.occurred_at

    db.add(activity)
    await db.commit()

    stored = await activities_repo.list_all(
        db, user, subject_type=payload.subject_type, subject_id=payload.subject_id, limit=1
    )
    return activity_detail(stored[0])


@router.delete("/{activity_id}", response_model=Message)
async def delete_activity(db: DbSession, user: CurrentUser, activity_id: uuid.UUID) -> Message:
    activity = await activities_repo.get(db, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    if not permissions.is_admin(user) and activity.author_id != user.id:
        raise permissions.forbid("You can only delete activity you logged")

    await db.delete(activity)
    await db.commit()
    return Message(detail="Activity deleted")


async def _assert_subject_visible(
    db: DbSession, user, subject_type: ActivitySubjectType, subject_id: uuid.UUID
) -> None:
    """
    The subject must exist *and* be visible to the caller.

    Otherwise a rep could attach notes to deals they cannot see, and probe which ids are
    real by watching whether the status comes back 201 or 404.
    """
    if subject_type is ActivitySubjectType.ACCOUNT:
        visible = await accounts_repo.list_all(db, user)
        found = next((a for a in visible if a.id == subject_id), None)
    elif subject_type is ActivitySubjectType.LEAD:
        lead = await accounts_repo.get_lead(db, subject_id)
        found = lead if lead and (permissions.is_admin(user) or lead.owner_id == user.id) else None
    else:
        deal = await deals_repo.get(db, subject_id)
        found = deal if deal and (permissions.is_admin(user) or deal.owner_id == user.id) else None

    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {subject_type.value} with that id",
        )
