from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional
from datetime import datetime
from uuid import UUID

from app.config import is_owner_email


class UserBase(BaseModel):
    email: EmailStr
    username: str
    display_name: Optional[str] = None
    nickname: Optional[str] = None


def _require_full_name(value: str) -> str:
    """Names must be first + last so the standings aren't a wall of 'Mike'."""
    cleaned = " ".join(value.split())
    if len(cleaned.split(" ")) < 2:
        raise ValueError("Please use your full name — first and last, e.g. 'John Smith'.")
    return cleaned


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

    @field_validator("username", "display_name")
    @classmethod
    def _full_name(cls, v):
        return _require_full_name(v) if v else v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    nickname: Optional[str] = None

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
    current_password: str
    new_password: str = Field(..., min_length=8)


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
