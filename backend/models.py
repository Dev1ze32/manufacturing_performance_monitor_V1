from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class ActualCostPayload(BaseModel):
    month: str
    utility_cost: Optional[float] = None
    rm_cost: Optional[float] = None
    volume: Optional[float] = None


class OBTargetPayload(BaseModel):
    month: str
    utility_budget: Optional[float] = None
    rm_budget: Optional[float] = None
    volume_budget: Optional[float] = None


class RunrateMonthlyPayload(BaseModel):
    month: str
    line: str
    capacity: Optional[float] = None
    actual_output: Optional[float] = None
    machine_availability: Optional[float] = None


class RunrateWeeklyPayload(BaseModel):
    month: str
    line: str
    week_label: str
    week_num: Optional[int] = None
    capacity: Optional[float] = None
    actual_output: Optional[float] = None
    machine_availability: Optional[float] = None


class ManhoursPayload(BaseModel):
    month: str
    line: str = ""
    working_days: Optional[float] = None
    manpower: Optional[float] = None
    planned_reg: Optional[float] = None
    actual_reg: Optional[float] = None
    planned_ot: Optional[float] = None
    actual_ot: Optional[float] = None
    absenteeism: Optional[float] = None


class SavedResponse(BaseModel):
    ok: bool = True


class DeletedResponse(BaseModel):
    ok: bool = True
    deleted: bool = True
