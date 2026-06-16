from __future__ import annotations

from typing import List, Tuple

from .database import Database


MIGRATIONS: List[Tuple[int, List[str]]] = [
    (
        1,
        [
            """
            CREATE TABLE IF NOT EXISTS utilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL UNIQUE,
                utility_cost REAL,
                rm_cost REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS production (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL UNIQUE,
                volume REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS budget (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL UNIQUE,
                utility_budget REAL,
                rm_budget REAL,
                volume_budget REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS capacity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                line TEXT NOT NULL,
                capacity REAL,
                actual_output REAL,
                machine_availability REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(month, line)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS capacity_weekly (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                line TEXT NOT NULL,
                week_label TEXT NOT NULL,
                week_num INTEGER,
                capacity REAL,
                actual_output REAL,
                machine_availability REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(month, line, week_label)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS manhours (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                line TEXT NOT NULL DEFAULT '',
                working_days REAL,
                manpower REAL,
                planned_reg REAL,
                actual_reg REAL,
                planned_ot REAL,
                actual_ot REAL,
                absenteeism REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(month, line)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS manhours_weekly (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                line TEXT NOT NULL DEFAULT '',
                week_label TEXT NOT NULL,
                week_num INTEGER,
                working_days REAL,
                manpower REAL,
                actual_reg REAL,
                actual_ot REAL,
                absenteeism REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(month, line, week_label)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS loss (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                line TEXT NOT NULL DEFAULT '',
                runrate_loss REAL,
                absenteeism_loss REAL,
                manhours_loss REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(month, line)
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_utilities_month ON utilities(month)",
            "CREATE INDEX IF NOT EXISTS idx_production_month ON production(month)",
            "CREATE INDEX IF NOT EXISTS idx_budget_month ON budget(month)",
            "CREATE INDEX IF NOT EXISTS idx_capacity_month_line ON capacity(month, line)",
            "CREATE INDEX IF NOT EXISTS idx_capacity_weekly_month_line ON capacity_weekly(month, line)",
            "CREATE INDEX IF NOT EXISTS idx_manhours_month_line ON manhours(month, line)",
            "CREATE INDEX IF NOT EXISTS idx_loss_month_line ON loss(month, line)",
        ],
    ),
    (
        2,
        [
            # Roles: user | superuser | admin
            # 'user'      → dashboard read-only
            # 'superuser' → dashboard + data entry
            # 'admin'     → everything + account management
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user'
                    CHECK(role IN ('user', 'superuser', 'admin')),
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)",
        ],
    ),
]


async def migrate(db: Database) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    rows = await db.fetch_all("SELECT version FROM schema_migrations")
    applied = {int(row["version"]) for row in rows}

    for version, statements in MIGRATIONS:
        if version in applied:
            continue

        batch = [(statement, None) for statement in statements]
        batch.append(
            (
                "INSERT INTO schema_migrations (version) VALUES (:version)",
                {"version": version},
            )
        )
        await db.execute_batch(batch)