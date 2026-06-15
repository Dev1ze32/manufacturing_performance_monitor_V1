from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..database import Database


async def list_ob_targets(db: Database, limit: int = 100) -> List[Dict[str, Any]]:
    return await db.fetch_all(
        """
        SELECT month, utility_budget, rm_budget, volume_budget
        FROM budget
        ORDER BY month DESC
        LIMIT :limit
        """,
        {"limit": limit},
    )


async def save_ob_target(
    db: Database,
    month: str,
    utility_budget: Optional[float],
    rm_budget: Optional[float],
    volume_budget: Optional[float],
) -> None:
    await db.execute(
        """
        INSERT INTO budget (month, utility_budget, rm_budget, volume_budget)
        VALUES (:month, :utility_budget, :rm_budget, :volume_budget)
        ON CONFLICT(month) DO UPDATE SET
            utility_budget = excluded.utility_budget,
            rm_budget = excluded.rm_budget,
            volume_budget = excluded.volume_budget,
            updated_at = CURRENT_TIMESTAMP
        """,
        {
            "month": month,
            "utility_budget": utility_budget,
            "rm_budget": rm_budget,
            "volume_budget": volume_budget,
        },
    )


async def delete_ob_target(db: Database, month: str) -> None:
    await db.execute("DELETE FROM budget WHERE month = :month", {"month": month})


async def clear_ob_targets(db: Database) -> None:
    await db.execute("DELETE FROM budget")


async def get_budget_actual_rows(db: Database, month: Optional[str] = None) -> List[Dict[str, Any]]:
    where = "WHERE b.month = :month" if month else ""
    params: Dict[str, Any] = {"month": month} if month else {}
    return await db.fetch_all(
        f"""
        SELECT
            b.month,
            b.utility_budget,
            b.rm_budget,
            b.volume_budget,
            u.utility_cost,
            u.rm_cost,
            p.volume
        FROM budget b
        LEFT JOIN utilities u ON b.month = u.month
        LEFT JOIN production p ON b.month = p.month
        {where}
        ORDER BY b.month DESC
        LIMIT 100
        """,
        params,
    )
