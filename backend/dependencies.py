from __future__ import annotations

"""
Reusable FastAPI auth dependencies.

Import these in routes/api.py (and any future router) to protect endpoints
by role without duplicating the JWT decoding logic.

Usage example
-------------
from ..dependencies import require_role

@router.get("/some-protected-endpoint")
async def endpoint(
    request: Request,
    user: dict = Depends(require_role("superuser", "admin")),
):
    ...
"""

from typing import Any, Dict

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError

from .auth_utils import decode_access_token
from .database import Database
from .queries import auth as auth_queries


def get_db(request: Request) -> Database:
    return request.app.state.db


async def get_current_user(request: Request) -> Dict[str, Any]:
    """
    Decode the Bearer token and return the matching DB user.
    Raises 401 if the token is missing, invalid, expired, or the user is inactive.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header[len("Bearer "):]
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await auth_queries.get_user_by_id(get_db(request), int(payload["sub"]))
    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )
    return user


def require_role(*roles: str):
    """
    Dependency factory.  Checks that the current user has one of *roles*.

    Roles (most → least privileged):  admin > superuser > user

    Examples
    --------
    Depends(require_role("admin"))                  # admin only
    Depends(require_role("superuser", "admin"))     # superuser or admin
    Depends(require_role("user", "superuser", "admin"))  # any authenticated user
    """
    async def _dependency(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions.",
            )
        return user
    return _dependency


# Convenience aliases
AnyUser = Depends(require_role("user", "superuser", "admin"))
SuperuserOrAdmin = Depends(require_role("superuser", "admin"))
AdminOnly = Depends(require_role("admin"))