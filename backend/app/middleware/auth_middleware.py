from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.auth_service import decode_access_token, PASSWORD_GATE_ALLOWED_PATHS
from app.schemas.user import UserResponse
from app.database import db
from app.db_adapters import UserAdapter

security = HTTPBearer()


def user_response(u: dict) -> UserResponse:
    return UserResponse(
        user_id=u['user_id'],
        email=u['email'],
        username=u['username'],
        display_name=u['display_name'],
        nickname=u.get('nickname'),
        is_admin=u['is_admin'],
        is_active=u['is_active'],
        pending_approval=u.get('pending_approval', False),
        must_change_password=u.get('must_change_password', False),
        created_at=u['created_at'],
    )


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> UserResponse:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = decode_access_token(credentials.credentials)
    if token_data is None or token_data.user_id is None:
        raise credentials_exception

    user_data = UserAdapter.get_by_id(db.get_session(), token_data.user_id)
    if user_data is None:
        raise credentials_exception

    if not user_data['is_active']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    # Accounts on an admin-issued temporary password may only change it (or
    # load their own profile) — everything else is locked until they do.
    if user_data.get('must_change_password') and request.url.path not in PASSWORD_GATE_ALLOWED_PATHS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must set your own password before using the app"
        )

    return user_response(user_data)


async def get_current_admin_user(
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
