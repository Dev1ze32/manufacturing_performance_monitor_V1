from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..database import Database
from ..dependencies import AnyUser, SuperuserOrAdmin, AdminOnly, require_role
from ..models import (
    ActualCostPayload,
    DeletedResponse,
    ManhoursPayload,
    OBTargetPayload,
    RunrateMonthlyPayload,
    RunrateWeeklyPayload,
    SavedResponse,
)
from ..queries import actual_costs, dashboards, manhours, ob_targets, runrate


router = APIRouter(prefix="/api")
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def get_db(request: Request) -> Database:
    return request.app.state.db


def validate_month(month: str) -> str:
    if not MONTH_RE.match(month):
        raise HTTPException(status_code=422, detail="Month must use YYYY-MM format.")
    return month


def require_any(payload: Dict[str, Any], fields: List[str], message: str) -> None:
    if all(payload.get(field) is None for field in fields):
        raise HTTPException(status_code=422, detail=message)


def model_data(payload: Any) -> Dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    return payload.dict()


# ---------------------------------------------------------------------------
# Public / health
# ---------------------------------------------------------------------------

@router.get("/health")
async def health(request: Request) -> Dict[str, Any]:
    db = get_db(request)
    return {"ok": True, "database": db.dialect}


# ---------------------------------------------------------------------------
# Dashboard endpoints — any authenticated user (user / superuser / admin)
# ---------------------------------------------------------------------------

@router.get("/months")
async def months(
    request: Request,
    _user: Dict = Depends(require_role("user", "superuser", "admin")),
) -> List[str]:
    return await dashboards.list_months(get_db(request))


@router.get("/dashboard/cost")
async def dashboard_cost(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    _user: Dict = Depends(require_role("user", "superuser", "admin")),
) -> List[Dict[str, Any]]:
    return await dashboards.get_cost_rows(get_db(request), limit=limit)


@router.get("/dashboard/production")
async def dashboard_production(
    request: Request,
    month: Optional[str] = None,
    _user: Dict = Depends(require_role("user", "superuser", "admin")),
) -> List[Dict[str, Any]]:
    if month:
        validate_month(month)
    return await dashboards.get_production_rows(get_db(request), month=month)


@router.get("/dashboard/runrate-summary")
async def dashboard_runrate_summary(
    request: Request,
    month: Optional[str] = None,
    _user: Dict = Depends(require_role("user", "superuser", "admin")),
) -> List[Dict[str, Any]]:
    if month:
        validate_month(month)
    return await dashboards.get_runrate_summary(get_db(request), month=month)


@router.get("/dashboard/manhours-summary")
async def dashboard_manhours_summary(
    request: Request,
    month: Optional[str] = None,
    _user: Dict = Depends(require_role("user", "superuser", "admin")),
) -> List[Dict[str, Any]]:
    if month:
        validate_month(month)
    return await dashboards.get_manhours_summary(get_db(request), month=month)


@router.get("/dashboard/ob-actual")
async def dashboard_ob_actual(
    request: Request,
    month: Optional[str] = None,
    _user: Dict = Depends(require_role("user", "superuser", "admin")),
) -> List[Dict[str, Any]]:
    if month:
        validate_month(month)
    return await dashboards.get_ob_actual_rows(get_db(request), month=month)


# ---------------------------------------------------------------------------
# Data-entry endpoints — superuser or admin only
# ---------------------------------------------------------------------------

@router.get("/actual-costs")
async def list_actual_costs(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> List[Dict[str, Any]]:
    return await actual_costs.list_actual_costs(get_db(request), limit=limit)


@router.post("/actual-costs", response_model=SavedResponse)
async def save_actual_cost(
    request: Request,
    payload: ActualCostPayload,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> SavedResponse:
    validate_month(payload.month)
    data = model_data(payload)
    require_any(data, ["utility_cost", "rm_cost", "volume"], "Enter at least one actual cost or volume value.")
    await actual_costs.save_actual_cost(
        get_db(request),
        payload.month,
        payload.utility_cost,
        payload.rm_cost,
        payload.volume,
    )
    return SavedResponse()


@router.delete("/actual-costs/{month}", response_model=DeletedResponse)
async def delete_actual_cost(
    request: Request,
    month: str,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    validate_month(month)
    await actual_costs.delete_actual_cost(get_db(request), month)
    return DeletedResponse()


@router.delete("/actual-costs", response_model=DeletedResponse)
async def clear_actual_costs(
    request: Request,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    await actual_costs.clear_actual_costs(get_db(request))
    return DeletedResponse()


@router.get("/ob-targets")
async def list_ob_targets(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> List[Dict[str, Any]]:
    return await ob_targets.list_ob_targets(get_db(request), limit=limit)


@router.post("/ob-targets", response_model=SavedResponse)
async def save_ob_target(
    request: Request,
    payload: OBTargetPayload,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> SavedResponse:
    validate_month(payload.month)
    data = model_data(payload)
    require_any(data, ["utility_budget", "rm_budget", "volume_budget"], "Enter at least one OB target value.")
    await ob_targets.save_ob_target(
        get_db(request),
        payload.month,
        payload.utility_budget,
        payload.rm_budget,
        payload.volume_budget,
    )
    return SavedResponse()


@router.delete("/ob-targets/{month}", response_model=DeletedResponse)
async def delete_ob_target(
    request: Request,
    month: str,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    validate_month(month)
    await ob_targets.delete_ob_target(get_db(request), month)
    return DeletedResponse()


@router.delete("/ob-targets", response_model=DeletedResponse)
async def clear_ob_targets(
    request: Request,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    await ob_targets.clear_ob_targets(get_db(request))
    return DeletedResponse()


@router.get("/runrate/monthly")
async def list_monthly_runrate(
    request: Request,
    limit: int = Query(default=200, ge=1, le=1000),
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> List[Dict[str, Any]]:
    return await runrate.list_monthly_runrate(get_db(request), limit=limit)


@router.post("/runrate/monthly", response_model=SavedResponse)
async def save_monthly_runrate(
    request: Request,
    payload: RunrateMonthlyPayload,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> SavedResponse:
    validate_month(payload.month)
    data = model_data(payload)
    require_any(
        data,
        ["capacity", "actual_output", "machine_availability"],
        "Enter capacity, actual output, or machine availability.",
    )
    await runrate.save_monthly_runrate(
        get_db(request),
        payload.month,
        payload.line,
        payload.capacity,
        payload.actual_output,
        payload.machine_availability,
    )
    return SavedResponse()


@router.delete("/runrate/monthly", response_model=DeletedResponse)
async def delete_monthly_runrate(
    request: Request,
    month: str,
    line: str,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    validate_month(month)
    await runrate.delete_monthly_runrate(get_db(request), month, line)
    return DeletedResponse()


@router.get("/runrate/weekly")
async def list_weekly_runrate(
    request: Request,
    month: Optional[str] = None,
    limit: int = Query(default=300, ge=1, le=2000),
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> List[Dict[str, Any]]:
    if month:
        validate_month(month)
    return await runrate.list_weekly_runrate(get_db(request), month=month, limit=limit)


@router.post("/runrate/weekly", response_model=SavedResponse)
async def save_weekly_runrate(
    request: Request,
    payload: RunrateWeeklyPayload,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> SavedResponse:
    validate_month(payload.month)
    data = model_data(payload)
    require_any(
        data,
        ["capacity", "actual_output", "machine_availability"],
        "Enter capacity, actual output, or machine availability.",
    )
    await runrate.save_weekly_runrate(
        get_db(request),
        payload.month,
        payload.line,
        payload.week_label,
        payload.week_num,
        payload.capacity,
        payload.actual_output,
        payload.machine_availability,
    )
    return SavedResponse()


@router.delete("/runrate/weekly/{record_id}", response_model=DeletedResponse)
async def delete_weekly_runrate(
    request: Request,
    record_id: int,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    await runrate.delete_weekly_runrate(get_db(request), record_id)
    return DeletedResponse()


@router.delete("/runrate/monthly/all", response_model=DeletedResponse)
async def clear_monthly_runrate(
    request: Request,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    await runrate.clear_monthly_runrate(get_db(request))
    return DeletedResponse()


@router.delete("/runrate", response_model=DeletedResponse)
async def clear_runrate(
    request: Request,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    await runrate.clear_runrate(get_db(request))
    return DeletedResponse()


@router.get("/manhours")
async def list_manhours(
    request: Request,
    limit: int = Query(default=300, ge=1, le=1000),
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> List[Dict[str, Any]]:
    return await manhours.list_manhours(get_db(request), limit=limit)


@router.post("/manhours", response_model=SavedResponse)
async def save_manhours(
    request: Request,
    payload: ManhoursPayload,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> SavedResponse:
    validate_month(payload.month)
    data = model_data(payload)
    require_any(
        data,
        ["working_days", "manpower", "planned_reg", "actual_reg", "planned_ot", "actual_ot", "absenteeism"],
        "Enter at least one manhours or absenteeism value.",
    )
    await manhours.save_manhours(
        get_db(request),
        payload.month,
        payload.line,
        payload.working_days,
        payload.manpower,
        payload.planned_reg,
        payload.actual_reg,
        payload.planned_ot,
        payload.actual_ot,
        payload.absenteeism,
    )
    return SavedResponse()


@router.delete("/manhours/{record_id}", response_model=DeletedResponse)
async def delete_manhours(
    request: Request,
    record_id: int,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    await manhours.delete_manhours(get_db(request), record_id)
    return DeletedResponse()


@router.delete("/manhours", response_model=DeletedResponse)
async def clear_manhours(
    request: Request,
    _user: Dict = Depends(require_role("superuser", "admin")),
) -> DeletedResponse:
    await manhours.clear_manhours(get_db(request))
    return DeletedResponse()