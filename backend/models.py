from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Existing models (unchanged)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Auth models (new)
# ---------------------------------------------------------------------------

Role = Literal["user", "superuser", "admin"]


class RegisterPayload(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    # Only admins may set a role at creation time; the route enforces this.
    role: Role = "user"


class LoginPayload(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    username: str


class UserPublic(BaseModel):
    id: int
    username: str
    role: Role
    is_active: bool


class UpdateRolePayload(BaseModel):
    role: Role


class SetActivePayload(BaseModel):
    is_active: bool


class UpdateUserPayload(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=64)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)