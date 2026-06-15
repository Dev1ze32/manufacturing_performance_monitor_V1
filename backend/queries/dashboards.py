from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..database import Database
from .runrate import EFFECTIVE_CAPACITY_CTE


async def list_months(db: Database) -> List[str]:
    rows = await db.fetch_all(
        """
        SELECT DISTINCT month FROM utilities
        UNION
        SELECT DISTINCT month FROM production
        UNION
        SELECT DISTINCT month FROM budget
        UNION
        SELECT DISTINCT month FROM capacity
        UNION
        SELECT DISTINCT month FROM capacity_weekly
        UNION
        SELECT DISTINCT month FROM manhours
        UNION
        SELECT DISTINCT month FROM loss
        ORDER BY month
        """
    )
    return [row["month"] for row in rows if row.get("month")]


async def get_cost_rows(db: Database, limit: int = 100) -> List[Dict[str, Any]]:
    return await db.fetch_all(
        """
        SELECT u.month, u.utility_cost, u.rm_cost, p.volume
        FROM utilities u
        LEFT JOIN production p ON u.month = p.month
        ORDER BY u.month DESC
        LIMIT :limit
        """,
        {"limit": limit},
    )


async def get_production_rows(db: Database, month: Optional[str] = None) -> List[Dict[str, Any]]:
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


async def get_runrate_summary(db: Database, month: Optional[str] = None) -> List[Dict[str, Any]]:
    where = "WHERE month = :month" if month else ""
    params: Dict[str, Any] = {"month": month} if month else {}
    return await db.fetch_all(
        f"""
        {EFFECTIVE_CAPACITY_CTE}
        SELECT
            month,
            line,
            SUM(capacity) AS capacity,
            SUM(actual_output) AS actual_output,
            AVG(machine_availability) AS machine_availability,
            SUM(weekly_count) AS weekly_count
        FROM effective
        {where}
        GROUP BY month, line
        ORDER BY month DESC, line
        """,
        params,
    )


async def get_manhours_summary(db: Database, month: Optional[str] = None) -> List[Dict[str, Any]]:
    where = "WHERE month = :month" if month else ""
    params: Dict[str, Any] = {"month": month} if month else {}
    return await db.fetch_all(
        f"""
        SELECT
            month,
            line,
            working_days,
            manpower,
            CASE
                WHEN working_days IS NOT NULL AND manpower IS NOT NULL
                THEN working_days * manpower
                ELSE NULL
            END AS person_days,
            CASE
                WHEN working_days IS NOT NULL AND manpower IS NOT NULL
                THEN working_days * manpower * 8
                ELSE planned_reg
            END AS planned_reg,
            actual_reg,
            CASE
                WHEN working_days IS NOT NULL AND manpower IS NOT NULL
                THEN working_days * manpower * 4
                ELSE planned_ot
            END AS planned_ot,
            actual_ot,
            absenteeism
        FROM manhours
        {where}
        ORDER BY month DESC, line
        """,
        params,
    )


async def get_ob_actual_rows(db: Database, month: Optional[str] = None) -> List[Dict[str, Any]]:
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
        """,
        params,
    )
