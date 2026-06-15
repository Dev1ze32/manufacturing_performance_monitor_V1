from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple, Union

from .config import Settings


Params = Optional[Union[Mapping[str, Any], Sequence[Any]]]


class DatabaseError(RuntimeError):
    """Raised when the configured database backend cannot be used."""


class Database(ABC):
    """Small async boundary around the persistence layer.

    Repositories depend on this interface instead of importing sqlite3 directly.
    That keeps the API code portable when a PostgreSQL adapter is added later.
    """

    dialect: str

    @abstractmethod
    async def fetch_all(self, sql: str, params: Params = None) -> List[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    async def fetch_one(self, sql: str, params: Params = None) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    async def execute(self, sql: str, params: Params = None) -> Optional[int]:
        raise NotImplementedError

    @abstractmethod
    async def execute_batch(self, statements: Sequence[Tuple[str, Params]]) -> None:
        raise NotImplementedError


class SQLiteDatabase(Database):
    dialect = "sqlite"

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    async def _run_in_worker(self, func, *args):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, func, *args)

    async def fetch_all(self, sql: str, params: Params = None) -> List[Dict[str, Any]]:
        return await self._run_in_worker(self._fetch_all_sync, sql, params)

    async def fetch_one(self, sql: str, params: Params = None) -> Optional[Dict[str, Any]]:
        rows = await self.fetch_all(sql, params)
        return rows[0] if rows else None

    async def execute(self, sql: str, params: Params = None) -> Optional[int]:
        return await self._run_in_worker(self._execute_sync, sql, params)

    async def execute_batch(self, statements: Sequence[Tuple[str, Params]]) -> None:
        await self._run_in_worker(self._execute_batch_sync, statements)

    def _fetch_all_sync(self, sql: str, params: Params = None) -> List[Dict[str, Any]]:
        conn = self._connect()
        try:
            cursor = conn.execute(sql, params or {})
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()

    def _execute_sync(self, sql: str, params: Params = None) -> Optional[int]:
        conn = self._connect()
        try:
            cursor = conn.execute(sql, params or {})
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def _execute_batch_sync(self, statements: Sequence[Tuple[str, Params]]) -> None:
        conn = self._connect()
        try:
            conn.execute("BEGIN")
            for sql, params in statements:
                conn.execute(sql, params or {})
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


class PostgresDatabase(Database):
    dialect = "postgres"

    def __init__(self) -> None:
        raise DatabaseError(
            "DB_BACKEND=postgres is reserved for the production adapter. "
            "The repository layer is isolated so a psycopg/SQLAlchemy adapter can be added without API rewrites."
        )

    async def fetch_all(self, sql: str, params: Params = None) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def fetch_one(self, sql: str, params: Params = None) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    async def execute(self, sql: str, params: Params = None) -> Optional[int]:
        raise NotImplementedError

    async def execute_batch(self, statements: Sequence[Tuple[str, Params]]) -> None:
        raise NotImplementedError


def create_database(settings: Settings) -> Database:
    if settings.database_backend == "sqlite":
        return SQLiteDatabase(settings.sqlite_path)
    if settings.database_backend == "postgres":
        return PostgresDatabase()
    raise DatabaseError(f"Unsupported DB_BACKEND: {settings.database_backend}")
