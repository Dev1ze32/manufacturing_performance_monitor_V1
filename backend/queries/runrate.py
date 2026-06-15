from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..database import Database
from ..normalization import normalize_line_name, normalize_percent


EFFECTIVE_CAPACITY_CTE = """
WITH weekly AS (
    SELECT
        cw.month,
        cw.line,
        SUM(cw.capacity) AS capacity,
        SUM(cw.actual_output) AS actual_output,
        COALESCE(AVG(cw.machine_availability), (
            SELECT c.machine_availability
            FROM capacity c
            WHERE c.month = cw.month AND c.line = cw.line
            LIMIT 1
        )) AS machine_availability,
        COUNT(*) AS weekly_count
    FROM capacity_weekly cw
    GROUP BY cw.month, cw.line
),
manual AS (
    SELECT
        c.month,
        c.line,
        c.capacity,
        c.actual_output,
        c.machine_availability,
        0 AS weekly_count
    FROM capacity c
    WHERE NOT EXISTS (
        SELECT 1
        FROM weekly w
        WHERE w.month = c.month AND w.line = c.line
    )
),
effective AS (
    SELECT * FROM weekly
    UNION ALL
    SELECT * FROM manual
)
"""


async def list_monthly_runrate(db: Database, limit: int = 200) -> List[Dict[str, Any]]:
    return await db.fetch_all(
        """
        SELECT month, line, capacity, actual_output, machine_availability
        FROM capacity
        ORDER BY month DESC, line
        LIMIT :limit
        """,
        {"limit": limit},
    )


async def list_weekly_runrate(
    db: Database, month: Optional[str] = None, limit: int = 300
) -> List[Dict[str, Any]]:
    where = "WHERE month = :month" if month else ""
    params: Dict[str, Any] = {"limit": limit}
    if month:
        params["month"] = month

    return await db.fetch_all(
        f"""
        SELECT id, month, line, week_label, week_num, capacity, actual_output, machine_availability
        FROM capacity_weekly
        {where}
        ORDER BY month DESC, line, week_num ASC, week_label ASC
        LIMIT :limit
        """,
        params,
    )


async def list_effective_runrate(db: Database, month: Optional[str] = None) -> List[Dict[str, Any]]:
    where = "WHERE month = :month" if month else ""
    params: Dict[str, Any] = {"month": month} if month else {}
    return await db.fetch_all(
        f"""
        {EFFECTIVE_CAPACITY_CTE}
        SELECT month, line, capacity, actual_output, machine_availability, weekly_count
        FROM effective
        {where}
        ORDER BY month DESC, line
        """,
        params,
    )


async def save_monthly_runrate(
    db: Database,
    month: str,
    line: str,
    capacity: Optional[float],
    actual_output: Optional[float],
    machine_availability: Optional[float],
) -> None:
    await db.execute(
        """
        INSERT INTO capacity (month, line, capacity, actual_output, machine_availability)
        VALUES (:month, :line, :capacity, :actual_output, :machine_availability)
        ON CONFLICT(month, line) DO UPDATE SET
            capacity = excluded.capacity,
            actual_output = excluded.actual_output,
            machine_availability = excluded.machine_availability,
            updated_at = CURRENT_TIMESTAMP
        """,
        {
            "month": month,
            "line": normalize_line_name(line),
            "capacity": capacity,
            "actual_output": actual_output,
            "machine_availability": normalize_percent(machine_availability),
        },
    )


async def save_weekly_runrate(
    db: Database,
    month: str,
    line: str,
    week_label: str,
    week_num: Optional[int],
    capacity: Optional[float],
    actual_output: Optional[float],
    machine_availability: Optional[float],
) -> None:
    await db.execute(
        """
        INSERT INTO capacity_weekly (
            month, line, week_label, week_num, capacity, actual_output, machine_availability
        )
        VALUES (
            :month, :line, :week_label, :week_num, :capacity, :actual_output, :machine_availability
        )
        ON CONFLICT(month, line, week_label) DO UPDATE SET
            week_num = excluded.week_num,
            capacity = excluded.capacity,
            actual_output = excluded.actual_output,
            machine_availability = excluded.machine_availability,
            updated_at = CURRENT_TIMESTAMP
        """,
        {
            "month": month,
            "line": normalize_line_name(line),
            "week_label": week_label.strip().upper(),
            "week_num": week_num,
            "capacity": capacity,
            "actual_output": actual_output,
            "machine_availability": normalize_percent(machine_availability),
        },
    )


async def delete_monthly_runrate(db: Database, month: str, line: str) -> None:
    await db.execute(
        "DELETE FROM capacity WHERE month = :month AND line = :line",
        {"month": month, "line": normalize_line_name(line)},
    )


async def delete_weekly_runrate(db: Database, record_id: int) -> None:
    await db.execute("DELETE FROM capacity_weekly WHERE id = :id", {"id": record_id})


async def clear_runrate(db: Database) -> None:
    await db.execute_batch(
        [
            ("DELETE FROM capacity_weekly", None),
            ("DELETE FROM capacity", None),
        ]
    )


async def clear_monthly_runrate(db: Database) -> None:
    await db.execute("DELETE FROM capacity")
