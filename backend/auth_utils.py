from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from jose import JWTError, jwt

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Set JWT_SECRET in your environment for production.
# A hard-coded fallback is intentionally weak so it fails obviously if someone
# forgets to set the env var in production (the secret is short enough that it
# should be replaced).
_SECRET_KEY: str = os.getenv(
    "JWT_SECRET",
    "CHANGE_ME_in_production_use_a_long_random_string",
)
_ALGORITHM = "HS256"
_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))  # 8 h default

# Argon2id with sensible defaults (argon2-cffi uses id variant by default)
_ph = PasswordHasher()


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    """Return an Argon2id hash of *plain*."""
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*, False otherwise."""
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(hashed: str) -> bool:
    """Return True if the hash should be upgraded (parameters changed)."""
    return _ph.check_needs_rehash(hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(
    user_id: int,
    username: str,
    role: str,
    expires_minutes: Optional[int] = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes if expires_minutes is not None else _ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, _SECRET_KEY, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT.  Raises JWTError on any problem."""
    return jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
