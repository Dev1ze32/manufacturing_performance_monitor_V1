from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from ..database import Database


async def list_actual_costs(db: Database, limit: int = 100) -> List[Dict[str, Any]]:
    return await db.fetch_all(
        """
        SELECT month, utility_cost, rm_cost, volume
        FROM (
            SELECT u.month, u.utility_cost, u.rm_cost, p.volume
            FROM utilities u
            LEFT JOIN production p ON u.month = p.month
            UNION
            SELECT p.month, u.utility_cost, u.rm_cost, p.volume
            FROM production p
            LEFT JOIN utilities u ON p.month = u.month
        )
        ORDER BY month DESC
        LIMIT :limit
        """,
        {"limit": limit},
    )


async def save_actual_cost(
    db: Database,
    month: str,
    utility_cost: Optional[float],
    rm_cost: Optional[float],
    volume: Optional[float],
) -> None:
    statements: List[Tuple[str, Dict[str, Any]]] = []

    if utility_cost is not None or rm_cost is not None:
        statements.append(
            (
                """
                INSERT INTO utilities (month, utility_cost, rm_cost)
                VALUES (:month, :utility_cost, :rm_cost)
                ON CONFLICT(month) DO UPDATE SET
                    utility_cost = excluded.utility_cost,
                    rm_cost = excluded.rm_cost,
                    updated_at = CURRENT_TIMESTAMP
                """,
                {"month": month, "utility_cost": utility_cost, "rm_cost": rm_cost},
            )
        )

    if volume is not None:
        statements.append(
            (
                """
                INSERT INTO production (month, volume)
                VALUES (:month, :volume)
                ON CONFLICT(month) DO UPDATE SET
                    volume = excluded.volume,
                    updated_at = CURRENT_TIMESTAMP
                """,
                {"month": month, "volume": volume},
            )
        )

    if statements:
        await db.execute_batch(statements)


async def delete_actual_cost(db: Database, month: str) -> None:
    await db.execute_batch(
        [
            ("DELETE FROM utilities WHERE month = :month", {"month": month}),
            ("DELETE FROM production WHERE month = :month", {"month": month}),
        ]
    )


async def clear_actual_costs(db: Database) -> None:
    await db.execute_batch(
        [
            ("DELETE FROM utilities", None),
            ("DELETE FROM production", None),
        ]
    )
