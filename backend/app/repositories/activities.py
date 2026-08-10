import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core import permissions
from app.models import Activity, ActivitySubjectType, User


async def get(db: AsyncSession, activity_id: uuid.UUID) -> Activity | None:
    return await db.get(Activity, activity_id)


async def list_all(
    db: AsyncSession,
    viewer: User,
    *,
    subject_type: ActivitySubjectType | None = None,
    subject_id: uuid.UUID | None = None,
    limit: int = 100,
) -> list[Activity]:
    stmt = (
        select(Activity)
        .options(
            joinedload(Activity.author),
            joinedload(Activity.account),
            joinedload(Activity.lead),
            joinedload(Activity.deal),
        )
        .order_by(Activity.occurred_at.desc())
        .limit(limit)
    )

    if subject_id is not None and subject_type is not None:
        column = {
            ActivitySubjectType.ACCOUNT: Activity.account_id,
            ActivitySubjectType.LEAD: Activity.lead_id,
            ActivitySubjectType.DEAL: Activity.deal_id,
        }[subject_type]
        stmt = stmt.where(column == subject_id)

    result = await db.execute(permissions.scope_activities(stmt, viewer))
    return list(result.unique().scalars())


def subject_columns(subject_type: ActivitySubjectType, subject_id: uuid.UUID) -> dict[str, uuid.UUID]:
    """
    Maps the API's (subject_type, subject_id) pair onto the single foreign key column that
    should be set. The other two stay null, which the exactly_one_subject constraint checks.
    """
    return {
        ActivitySubjectType.ACCOUNT: {"account_id": subject_id},
        ActivitySubjectType.LEAD: {"lead_id": subject_id},
        ActivitySubjectType.DEAL: {"deal_id": subject_id},
    }[subject_type]
