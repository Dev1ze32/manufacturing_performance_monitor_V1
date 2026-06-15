from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..database import Database
from ..normalization import normalize_line_name


def planned_regular_hours(working_days: Optional[float], manpower: Optional[float]) -> Optional[float]:
    if working_days is None or manpower is None or working_days <= 0 or manpower <= 0:
        return None
    return working_days * manpower * 8


def planned_ot_hours(working_days: Optional[float], manpower: Optional[float]) -> Optional[float]:
    if working_days is None or manpower is None or working_days <= 0 or manpower <= 0:
        return None
    return working_days * manpower * 4


async def list_manhours(db: Database, limit: int = 300) -> List[Dict[str, Any]]:
    return await db.fetch_all(
        """
        SELECT
            id,
            month,
            line,
            working_days,
            manpower,
            planned_reg,
            actual_reg,
            planned_ot,
            actual_ot,
            absenteeism
        FROM manhours
        ORDER BY month DESC, line
        LIMIT :limit
        """,
        {"limit": limit},
    )


async def save_manhours(
    db: Database,
    month: str,
    line: str,
    working_days: Optional[float],
    manpower: Optional[float],
    planned_reg: Optional[float],
    actual_reg: Optional[float],
    planned_ot: Optional[float],
    actual_ot: Optional[float],
    absenteeism: Optional[float],
) -> None:
    computed_reg = planned_regular_hours(working_days, manpower)
    computed_ot = planned_ot_hours(working_days, manpower)

    await db.execute(
        """
        INSERT INTO manhours (
            month,
            line,
            working_days,
            manpower,
            planned_reg,
            actual_reg,
            planned_ot,
            actual_ot,
            absenteeism
        )
        VALUES (
            :month,
            :line,
            :working_days,
            :manpower,
            :planned_reg,
            :actual_reg,
            :planned_ot,
            :actual_ot,
            :absenteeism
        )
        ON CONFLICT(month, line) DO UPDATE SET
            working_days = excluded.working_days,
            manpower = excluded.manpower,
            planned_reg = excluded.planned_reg,
            actual_reg = excluded.actual_reg,
            planned_ot = excluded.planned_ot,
            actual_ot = excluded.actual_ot,
            absenteeism = excluded.absenteeism,
            updated_at = CURRENT_TIMESTAMP
        """,
        {
            "month": month,
            "line": normalize_line_name(line),
            "working_days": working_days,
            "manpower": manpower,
            "planned_reg": computed_reg if computed_reg is not None else planned_reg,
            "actual_reg": actual_reg,
            "planned_ot": computed_ot if computed_ot is not None else planned_ot,
            "actual_ot": actual_ot,
            "absenteeism": absenteeism,
        },
    )


async def delete_manhours(db: Database, record_id: int) -> None:
    await db.execute("DELETE FROM manhours WHERE id = :id", {"id": record_id})


async def clear_manhours(db: Database) -> None:
    await db.execute_batch(
        [
            ("DELETE FROM manhours", None),
            ("DELETE FROM manhours_weekly", None),
        ]
    )
