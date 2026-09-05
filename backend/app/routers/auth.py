from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.schemas.user import (
    UserCreate, UserLogin, Token, UserResponse, UserUpdate,
    ChangePasswordRequest, MessageResponse, ForgotPasswordRequest,
)
from app.services.auth_service import (
    verify_password, get_password_hash, create_access_token,
    create_password_reset_token, clear_pending_reset_tokens,
)
from app.database import get_db
from app.db_adapters import UserAdapter
from app.middleware.auth_middleware import get_current_user, user_response
from app.limiter import limiter
from datetime import datetime
from uuid import uuid4
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserCreate, session=Depends(get_db)):
    """
    Register a new account. It starts PENDING APPROVAL — the pool admin approves
    or denies each request, so a stranger who finds the site can't get in just
    by signing up. No token is issued here; login works once approved.
    """
    if UserAdapter.get_by_email(session, user_data.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    UserAdapter.create(
        session, str(uuid4()), user_data.email, user_data.username,
        get_password_hash(user_data.password),
        is_admin=False, is_active=False,
        display_name=user_data.display_name, nickname=user_data.nickname,
        pending_approval=True,
    )
    logger.info(f"New registration awaiting approval: {user_data.email}")
    return MessageResponse(
        message="Account created! The pool admin has been asked to approve it — "
                "you'll be able to log in once they do."
    )


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin, session=Depends(get_db)):
    user = UserAdapter.get_by_email(session, credentials.email)
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    if not user['is_active']:
        if user.get('pending_approval'):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Your registration is awaiting the pool admin's approval")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Account is inactive — ask the pool admin to activate it")

    access_token = create_access_token(
        data={"sub": str(user['user_id']), "email": user['email'], "is_admin": user['is_admin']}
    )
    return Token(access_token=access_token, user=user_response(user))


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest, session=Depends(get_db)):
    """
    Submit a password reset request. The admin reviews pending requests and
    sets a temporary password for the user (no email is sent). Always returns
    the same message so the endpoint can't be used to discover accounts.
    """
    generic = MessageResponse(
        message="If an account exists for that email, your reset request has been "
                "sent to the pool admin. They'll set a new password and let you know."
    )
    user = UserAdapter.get_by_email(session, body.email)
    if not user:
        return generic
    clear_pending_reset_tokens(session, str(user['user_id']))
    create_password_reset_token(session, str(user['user_id']), user['email'], expires_hours=168)
    logger.info(f"Password reset requested for user: {user['email']}")
    return generic


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: UserResponse = Depends(get_current_user)):
    return current_user


@router.post("/refresh", response_model=Token)
async def refresh_token(current_user: UserResponse = Depends(get_current_user)):
    access_token = create_access_token(
        data={"sub": str(current_user.user_id), "email": current_user.email, "is_admin": current_user.is_admin}
    )
    return Token(access_token=access_token, user=current_user)


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    current_user: UserResponse = Depends(get_current_user),
    session=Depends(get_db)
):
    user = UserAdapter.get_by_id(session, str(current_user.user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(body.current_password, user['password_hash']):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different password than the current one")

    # A real password lifts the forced-change lock
    UserAdapter.set_password(session, str(current_user.user_id), get_password_hash(body.new_password), must_change=False)
    logger.info(f"Password changed for user: {current_user.email}")
    return MessageResponse(message="Password changed successfully")


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    update_data: UserUpdate,
    current_user: UserResponse = Depends(get_current_user),
    session=Depends(get_db)
):
    if update_data.email and str(update_data.email).lower() != current_user.email.lower():
        existing = UserAdapter.get_by_email(session, str(update_data.email))
        if existing and str(existing['user_id']) != str(current_user.user_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use by another account")

    updates, params = [], []
    for field in ("username", "email", "display_name", "nickname"):
        value = getattr(update_data, field)
        if value is not None:
            updates.append(f"{field} = ?")
            params.append(str(value))

    if updates:
        updates.append("updated_at = ?")
        params.append(datetime.utcnow().isoformat())
        params.append(str(current_user.user_id))
        session.execute(f"UPDATE users SET {', '.join(updates)} WHERE user_id = ?", params)
        session.commit()

    updated = UserAdapter.get_by_id(session, str(current_user.user_id))
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user_response(updated)
