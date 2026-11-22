from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.database.models import User
from backend.routers.auth import get_current_user
from backend.services import student_records as sr
from backend.services.chat_service import load_student_snapshot
from backend.services.study_plan_service import load_plans

router = APIRouter(prefix="/students", tags=["Student record (simulated)"])


@router.get("/me")
async def my_record(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The logged-in user's simulated student record, for the 'My record' panel. 404 if none."""
    snap = await load_student_snapshot(db, current_user.id)
    if snap is None:
        raise HTTPException(status_code=404, detail="No student record for this account.")
    cgpa, hours = sr.gpa(snap["transcript"])
    status = sr.plan_status(snap)
    return {
        "name": snap["name"], "student_id": snap["student_id"], "program": status.get("plan"),
        "plan_id": snap["plan_id"], "level": snap["level"], "study_mode": snap["study_mode"],
        "admission": snap["admission"], "start_term": snap["start_term"], "current_term": snap["current_term"],
        "advisor": snap["advisor"], "supervisor": snap["supervisor"],
        "cgpa": cgpa, "standing": sr.standing(snap),
        "credit_hours_passed": status.get("credit_hours_passed"),
        "total_credit_hours": status.get("total_credit_hours"),
        "registered": snap["registered"],
        "transcript": [{**e, "passed": sr.passed(e, snap["level"])} for e in snap["transcript"]],
        "notes": snap["notes"],
    }


@router.get("/me/plan")
async def my_plan(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The student's own study plan, filled in from the record: every course's status
    (passed with grade, in progress, retake, can take, locked) and a 'where you stand'
    summary. 404 if the account has no record (the panel then falls back to manual ticking)."""
    snap = await load_student_snapshot(db, current_user.id)
    if snap is None:
        raise HTTPException(status_code=404, detail="No student record for this account.")
    plan = load_plans().get(snap["plan_id"])
    if plan is None:
        raise HTTPException(status_code=404, detail="Study plan not found.")
    view = sr.plan_view(snap, plan)
    return {
        "plan": {**{k: v for k, v in plan.items() if k not in ("courses", "notes")}, "courses": view["courses"]},
        "track": snap["track"],
        "statuses": view["statuses"],
        "summary": view["summary"],
        "next_term": view["next_term"],
    }
