from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..database import Database
from ..auth_utils import hash_password, password_needs_rehash


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_user_by_username(db: Database, username: str) -> Optional[Dict[str, Any]]:
    return await db.fetch_one(
        "SELECT id, username, password_hash, role, is_active FROM users WHERE username = :username COLLATE NOCASE",
        {"username": username},
    )


async def get_user_by_id(db: Database, user_id: int) -> Optional[Dict[str, Any]]:
    return await db.fetch_one(
        "SELECT id, username, role, is_active, created_at FROM users WHERE id = :id",
        {"id": user_id},
    )


async def list_users(db: Database) -> List[Dict[str, Any]]:
    """Return all users (no password_hash). Admin-only."""
    return await db.fetch_all(
        "SELECT id, username, role, is_active, created_at, updated_at FROM users ORDER BY id"
    )


async def username_exists(db: Database, username: str) -> bool:
    row = await db.fetch_one(
        "SELECT 1 FROM users WHERE username = :username COLLATE NOCASE",
        {"username": username},
    )
    return row is not None


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

async def create_user(
    db: Database,
    username: str,
    plain_password: str,
    role: str = "user",
) -> int:
    """Insert a new user and return the new row id."""
    password_hash = hash_password(plain_password)
    row_id = await db.execute(
        """
        INSERT INTO users (username, password_hash, role)
        VALUES (:username, :password_hash, :role)
        """,
        {"username": username.strip(), "password_hash": password_hash, "role": role},
    )
    return row_id  # type: ignore[return-value]


async def update_user_role(db: Database, user_id: int, role: str) -> None:
    await db.execute(
        "UPDATE users SET role = :role, updated_at = CURRENT_TIMESTAMP WHERE id = :id",
        {"role": role, "id": user_id},
    )


async def set_user_active(db: Database, user_id: int, is_active: bool) -> None:
    await db.execute(
        "UPDATE users SET is_active = :is_active, updated_at = CURRENT_TIMESTAMP WHERE id = :id",
        {"is_active": int(is_active), "id": user_id},
    )


async def update_user(
    db: Database,
    user_id: int,
    username: Optional[str] = None,
    plain_password: Optional[str] = None,
) -> None:
    """Update username and/or password. Only provided fields are changed."""
    if username is not None:
        await db.execute(
            "UPDATE users SET username = :username, updated_at = CURRENT_TIMESTAMP WHERE id = :id",
            {"username": username.strip(), "id": user_id},
        )
    if plain_password is not None:
        new_hash = hash_password(plain_password)
        await db.execute(
            "UPDATE users SET password_hash = :hash, updated_at = CURRENT_TIMESTAMP WHERE id = :id",
            {"hash": new_hash, "id": user_id},
        )


async def delete_user(db: Database, user_id: int) -> None:
    """Permanently delete a user row."""
    await db.execute("DELETE FROM users WHERE id = :id", {"id": user_id})


async def rehash_if_needed(db: Database, user_id: int, plain_password: str, current_hash: str) -> None:
    """Transparently upgrade the stored hash if Argon2 parameters changed."""
    if password_needs_rehash(current_hash):
        new_hash = hash_password(plain_password)
        await db.execute(
            "UPDATE users SET password_hash = :hash, updated_at = CURRENT_TIMESTAMP WHERE id = :id",
            {"hash": new_hash, "id": user_id},
        )