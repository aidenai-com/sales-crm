from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.core.config import settings
from app.core.security import (
    InvalidToken,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import User
from app.repositories import users as users_repo
from app.schemas.auth import (
    AccessToken,
    OwnershipSummary,
    PasswordChange,
    RefreshRequest,
    Token,
    UserCreate,
    UserRead,
)
from app.schemas.common import Message

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(
    db: DbSession,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """
    OAuth2 password flow. `username` is the email address.

    The same message is returned for an unknown email and a wrong password, so the
    response cannot be used to discover which addresses have accounts.
    """
    user = await users_repo.get_by_email(db, form.username)

    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is inactive")

    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


@router.post("/refresh", response_model=AccessToken)
async def refresh(db: DbSession, payload: RefreshRequest) -> AccessToken:
    """Exchanges a refresh token for a new access token."""
    try:
        user_id = decode_token(payload.refresh_token, "refresh")
    except InvalidToken as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user = await users_repo.get(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is unavailable")

    return AccessToken(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> User:
    return user


@router.post("/change-password", response_model=Message)
async def change_password(db: DbSession, user: CurrentUser, payload: PasswordChange) -> Message:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )

    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return Message(detail="Password changed")


@router.get("/users", response_model=list[UserRead])
async def list_users(db: DbSession, _: CurrentUser) -> list[User]:
    """
    Every signed-in user can read the user list: owner dropdowns on deals, leads, and
    accounts need it. Only creating users is restricted.
    """
    return await users_repo.list_all(db)


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(db: DbSession, _: AdminUser, payload: UserCreate) -> User:
    existing = await users_repo.get_by_email(db, payload.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A user with that email already exists"
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        initials=payload.initials.upper(),
        job_title=payload.job_title,
        role=payload.role,
        password_hash=hash_password(payload.password),
    )
    await users_repo.create(db, user)
    await db.commit()
    return user
<<<<<<< Updated upstream
=======


@router.get("/users/{user_id}/ownership", response_model=OwnershipSummary)
async def read_ownership(db: DbSession, _: AdminUser, user_id: uuid.UUID) -> OwnershipSummary:
    """
    What this person holds, so the deactivate dialog can say what is at stake before it is confirmed.

    Deactivating somebody used to be silent about their book, and the consequence is not obvious: deals
    stay owner-scoped, so the whole thing becomes invisible to every rep and visible only to
    administrators, while still counting in the forecast.
    """
    user = await users_repo.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such user")

    accounts, open_deals, value = await users_repo.ownership(db, user_id)
    return OwnershipSummary(
        user_id=user_id, accounts=accounts, open_deals=open_deals, open_deal_value=str(value)
    )


@router.patch("/users/{user_id}", response_model=UserRead)
async def update_user(
    db: DbSession, admin: AdminUser, user_id: uuid.UUID, payload: UserUpdate
) -> User:
    """
    An administrator's edit of a team member: name, email, title, role, active state, password.

    Two refusals protect the administrator from locking everyone out of administration, since
    nothing else in this system can grant the role back:

      - you cannot take your own admin role away
      - you cannot deactivate yourself

    Both are checked against the *acting* administrator rather than against a count of remaining
    admins. A count would be the wrong test: it would let the last two admins each demote the
    other, and it would refuse a legitimate demotion whenever a second admin happened to be
    inactive.

    Deactivating is the only way to remove somebody. There is no delete, because a user owns
    accounts, deals and logged activity — removing the row would either destroy that history or
    leave it pointing at nothing. An inactive user cannot sign in, is refused at token refresh, and
    stops being offered as an owner.
    """
    user = await users_repo.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such user")

    editing_self = user.id == admin.id

    if editing_self and payload.role is not None and payload.role is not UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own administrator role. Ask another administrator.",
        )

    if editing_self and payload.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    # Ownership moves before the deactivation lands, in the same transaction: a handover that half
    # happened would leave a signed-out person holding deals nobody else can see.
    if payload.reassign_to is not None:
        if payload.reassign_to == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reassigning somebody's work to themselves changes nothing.",
            )
        successor = await users_repo.get(db, payload.reassign_to)
        if successor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="No such user to reassign to"
            )
        if not successor.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{successor.full_name} is deactivated and cannot take over a book of work.",
            )
        await users_repo.reassign_ownership(db, user.id, successor.id)

    if payload.email is not None and payload.email.lower() != user.email.lower():
        clash = await users_repo.get_by_email(db, payload.email)
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with that email already exists",
            )
        user.email = payload.email

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.initials is not None:
        user.initials = payload.initials.upper()
    if payload.job_title is not None:
        user.job_title = payload.job_title
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)

    await db.commit()
    await db.refresh(user)
    return user
>>>>>>> Stashed changes
