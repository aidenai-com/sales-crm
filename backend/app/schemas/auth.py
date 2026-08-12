import uuid

from pydantic import EmailStr, Field

from app.models.enums import UserRole
from app.schemas.common import ORMModel, PayloadModel


class UserRead(ORMModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    initials: str
    job_title: str
    role: UserRole
    is_active: bool


class UserCreate(PayloadModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    initials: str = Field(min_length=1, max_length=4)
    job_title: str = Field(default="", max_length=120)
    role: UserRole = UserRole.REP
    # 72 bytes is bcrypt's hard limit; anything longer would be silently truncated.
    password: str = Field(min_length=8, max_length=72)


class UserUpdate(PayloadModel):
    """
    An administrator's edit of somebody else's record. Every field is optional: the form sends
    only what changed, so two admins editing different fields of the same person do not overwrite
    each other.

    `password` is a reset, not a change — it needs no current password, because an administrator
    is by definition someone who does not have the user's. The user changing their own password
    goes through `PasswordChange`, which does demand it.
    """

    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    initials: str | None = Field(default=None, min_length=1, max_length=4)
    job_title: str | None = Field(default=None, max_length=120)
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=72)


class Token(ORMModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class RefreshRequest(PayloadModel):
    refresh_token: str


class AccessToken(ORMModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class PasswordChange(PayloadModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)
