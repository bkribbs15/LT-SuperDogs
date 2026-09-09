from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional
from datetime import datetime
from uuid import UUID

from app.config import is_owner_email


# bcrypt refuses anything over 72 bytes — cap it so a long password is a 422,
# not a 500.
PASSWORD_MAX = 72


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., max_length=60)
    display_name: Optional[str] = Field(None, max_length=60)
    nickname: Optional[str] = Field(None, max_length=30)


def _require_full_name(value: str) -> str:
    """Names must be first + last so the standings aren't a wall of 'Mike'."""
    cleaned = " ".join(value.split())
    if len(cleaned.split(" ")) < 2:
        raise ValueError("Please use your full name — first and last, e.g. 'John Smith'.")
    return cleaned


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=PASSWORD_MAX)

    @field_validator("username", "display_name")
    @classmethod
    def _full_name(cls, v):
        return _require_full_name(v) if v else v


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=PASSWORD_MAX)


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, max_length=60)
    email: Optional[EmailStr] = None
    display_name: Optional[str] = Field(None, max_length=60)
    nickname: Optional[str] = Field(None, max_length=30)
    email_reminders: Optional[bool] = None
    email_results: Optional[bool] = None

    @field_validator("username", "display_name")
    @classmethod
    def _full_name(cls, v):
        return _require_full_name(v) if v else v


class UserResponse(UserBase):
    user_id: UUID
    is_admin: bool
    is_active: bool
    created_at: datetime
    is_owner: bool = False
    pending_approval: bool = False
    # True while the account is on an admin-issued temporary password; the
    # frontend forces a change before anything else.
    must_change_password: bool = False
    # Email preferences (only matter once SMTP is configured)
    email_reminders: bool = True
    email_results: bool = True

    @model_validator(mode="after")
    def _derive_owner(self):
        if is_owner_email(self.email):
            self.is_owner = True
            self.is_admin = True
        return self

    class Config:
        from_attributes = True


User = UserResponse


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    user_id: Optional[UUID] = None
    email: Optional[str] = None
    is_admin: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., max_length=PASSWORD_MAX)
    new_password: str = Field(..., min_length=8, max_length=PASSWORD_MAX)


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
