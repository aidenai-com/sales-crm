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
