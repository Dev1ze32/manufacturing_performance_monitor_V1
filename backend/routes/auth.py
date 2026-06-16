from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError

from ..auth_utils import create_access_token, decode_access_token, verify_password
from ..database import Database
from ..models import (
    DeletedResponse,
    LoginPayload,
    RegisterPayload,
    SetActivePayload,
    TokenResponse,
    UpdateRolePayload,
    UpdateUserPayload,
    UserPublic,
)
from ..queries import auth as auth_queries


router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_db(request: Request) -> Database:
    return request.app.state.db


def _bearer_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    return auth_header[len("Bearer "):]


async def _current_user(request: Request) -> Dict[str, Any]:
    token = _bearer_token(request)
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.")

    user = await auth_queries.get_user_by_id(get_db(request), int(payload["sub"]))
    if not user or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")
    return user


def _require_role(*roles: str):
    """Dependency factory that checks the current user's role."""
    async def dependency(request: Request) -> Dict[str, Any]:
        user = await _current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
        return user
    return dependency


# ---------------------------------------------------------------------------
# Public routes
# ---------------------------------------------------------------------------

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(request: Request, payload: RegisterPayload) -> TokenResponse:
    """
    Register a new account.

    - Anyone can self-register with the default role **user**.
    - Only an authenticated **admin** may register with role *superuser* or *admin*.
    """
    db = get_db(request)

    # Non-default role requires admin privileges
    if payload.role != "user":
        try:
            caller = await _current_user(request)
        except HTTPException:
            caller = None
        if not caller or caller["role"] != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can create accounts with elevated roles.",
            )

    if await auth_queries.username_exists(db, payload.username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken.")

    new_id = await auth_queries.create_user(db, payload.username, payload.password, payload.role)

    token = create_access_token(new_id, payload.username, payload.role)
    return TokenResponse(access_token=token, role=payload.role, username=payload.username)  # type: ignore[arg-type]


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, payload: LoginPayload) -> TokenResponse:
    db = get_db(request)
    user = await auth_queries.get_user_by_username(db, payload.username)

    # Constant-time-ish: always call verify even on missing user to avoid timing attacks
    password_ok = verify_password(payload.password, user["password_hash"]) if user else False

    if not user or not password_ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled.")

    # Transparent rehash if Argon2 parameters have changed
    await auth_queries.rehash_if_needed(db, user["id"], payload.password, user["password_hash"])

    token = create_access_token(user["id"], user["username"], user["role"])
    return TokenResponse(access_token=token, role=user["role"], username=user["username"])  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Authenticated routes
# ---------------------------------------------------------------------------

@router.get("/me", response_model=UserPublic)
async def me(request: Request) -> UserPublic:
    """Return the currently authenticated user's profile."""
    user = await _current_user(request)
    return UserPublic(**user)


# ---------------------------------------------------------------------------
# Admin-only routes
# ---------------------------------------------------------------------------

@router.get("/users", response_model=List[UserPublic])
async def list_users(
    request: Request,
    _admin: Dict[str, Any] = Depends(_require_role("admin")),
) -> List[UserPublic]:
    rows = await auth_queries.list_users(get_db(request))
    return [UserPublic(**r) for r in rows]


@router.patch("/users/{user_id}/role", response_model=UserPublic)
async def update_role(
    request: Request,
    user_id: int,
    payload: UpdateRolePayload,
    _admin: Dict[str, Any] = Depends(_require_role("admin")),
) -> UserPublic:
    db = get_db(request)
    user = await auth_queries.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    await auth_queries.update_user_role(db, user_id, payload.role)
    updated = await auth_queries.get_user_by_id(db, user_id)
    return UserPublic(**updated)  # type: ignore[arg-type]


@router.patch("/users/{user_id}/active", response_model=UserPublic)
async def set_active(
    request: Request,
    user_id: int,
    payload: SetActivePayload,
    _admin: Dict[str, Any] = Depends(_require_role("admin")),
) -> UserPublic:
    db = get_db(request)
    user = await auth_queries.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    await auth_queries.set_user_active(db, user_id, payload.is_active)
    updated = await auth_queries.get_user_by_id(db, user_id)
    return UserPublic(**updated)  # type: ignore[arg-type]


@router.patch("/users/{user_id}", response_model=UserPublic)
async def update_user(
    request: Request,
    user_id: int,
    payload: UpdateUserPayload,
    admin: Dict[str, Any] = Depends(_require_role("admin")),
) -> UserPublic:
    """Update a user's username and/or password. At least one field must be provided."""
    db = get_db(request)

    # Validate at least one field is given
    if payload.username is None and payload.password is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Provide a new username or password.")

    user = await auth_queries.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Prevent an admin from editing another admin (only themselves)
    if user["role"] == "admin" and user["id"] != admin["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit another admin account.")

    # Check new username is not already taken by someone else
    if payload.username is not None:
        existing = await auth_queries.get_user_by_username(db, payload.username)
        if existing and existing["id"] != user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken.")

    await auth_queries.update_user(db, user_id, payload.username, payload.password)
    updated = await auth_queries.get_user_by_id(db, user_id)
    return UserPublic(**updated)  # type: ignore[arg-type]


@router.delete("/users/{user_id}", response_model=DeletedResponse)
async def delete_user(
    request: Request,
    user_id: int,
    admin: Dict[str, Any] = Depends(_require_role("admin")),
) -> DeletedResponse:
    """Permanently delete a user. Admins cannot delete themselves or other admins."""
    db = get_db(request)

    user = await auth_queries.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Prevent self-deletion
    if user["id"] == admin["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot delete your own account.")

    # Prevent deleting other admins
    if user["role"] == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete another admin account.")

    await auth_queries.delete_user(db, user_id)
    return DeletedResponse()