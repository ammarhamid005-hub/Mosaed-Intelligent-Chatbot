import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.database.models import StudyProgress, User
from backend.database.schemas import StudyProgressIn, StudyProgressOut
from backend.routers.auth import get_current_user
from backend.services.study_plan_service import load_plans
from backend.services import thesis_roadmap

router = APIRouter(prefix="/study-plans", tags=["Study Plan Progress"])


@router.get("")
async def list_plans(current_user: User = Depends(get_current_user)):
    """All study plans, without their courses (for the program picker)."""
    return [{k: v for k, v in p.items() if k not in ("courses", "notes")} for p in load_plans().values()]


@router.get("/progress/last", response_model=StudyProgressOut)
async def last_progress(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The plan the user worked on most recently, so the panel reopens on it."""
    row = (await db.execute(
        select(StudyProgress).where(StudyProgress.user_id == current_user.id,
                                    StudyProgress.plan_id != thesis_roadmap.PLAN_ID)
        .order_by(StudyProgress.updated_at.desc()).limit(1)
    )).scalar_one_or_none()
    if not row:
        return StudyProgressOut()
    return StudyProgressOut(plan_id=row.plan_id, completed=json.loads(row.completed or "[]"), track=row.track)


# ── Thesis Roadmap progress (stored in the same table under plan_id "thesis-roadmap") ──
# These routes must stay above "/{plan_id}" so "thesis" is not read as a plan id.

@router.get("/thesis/progress", response_model=StudyProgressOut)
async def get_thesis_progress(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await get_progress(thesis_roadmap.PLAN_ID, db, current_user)


@router.put("/thesis/progress", response_model=StudyProgressOut)
async def save_thesis_progress(payload: StudyProgressIn,
                               db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    completed = [s for s in thesis_roadmap.STEP_IDS if s in set(payload.completed)]
    return await _save(thesis_roadmap.PLAN_ID, completed, None, db, current_user)


@router.get("/{plan_id}")
async def get_plan(plan_id: str, current_user: User = Depends(get_current_user)):
    plan = load_plans().get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found.")
    return plan


@router.get("/{plan_id}/progress", response_model=StudyProgressOut)
async def get_progress(plan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = (await db.execute(
        select(StudyProgress).where(StudyProgress.user_id == current_user.id, StudyProgress.plan_id == plan_id)
    )).scalar_one_or_none()
    if not row:
        return StudyProgressOut(plan_id=plan_id)
    return StudyProgressOut(plan_id=plan_id, completed=json.loads(row.completed or "[]"), track=row.track)


@router.put("/{plan_id}/progress", response_model=StudyProgressOut)
async def save_progress(plan_id: str, payload: StudyProgressIn,
                        db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = load_plans().get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Study plan not found.")
    valid = {c["key"] for c in plan["courses"]}
    completed = [k for k in dict.fromkeys(payload.completed) if k in valid]
    return await _save(plan_id, completed, payload.track, db, current_user)


async def _save(plan_id, completed, track, db, current_user):
    row = (await db.execute(
        select(StudyProgress).where(StudyProgress.user_id == current_user.id, StudyProgress.plan_id == plan_id)
    )).scalar_one_or_none()
    if row is None:
        row = StudyProgress(id=str(uuid.uuid4()), user_id=current_user.id, plan_id=plan_id)
        db.add(row)
    row.completed = json.dumps(completed)
    row.track = track
    await db.commit()
    return StudyProgressOut(plan_id=plan_id, completed=completed, track=track)
