import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.database.models import Feedback, ChatMessage
from backend.database.schemas import FeedbackRequest, FeedbackOut

router = APIRouter(prefix="/feedback", tags=["Feedback"])

VALID_RATINGS = {"positive", "negative"}


@router.post("", response_model=FeedbackOut)
async def submit_feedback(payload: FeedbackRequest, db: AsyncSession = Depends(get_db)):
    if payload.rating not in VALID_RATINGS:
        raise HTTPException(status_code=400, detail="Rating must be 'positive' or 'negative'.")

    # Verify message exists
    result = await db.execute(select(ChatMessage).where(ChatMessage.id == payload.message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found.")

    # Upsert: if the user changes their vote, overwrite the existing record.
    fb_result = await db.execute(select(Feedback).where(Feedback.message_id == payload.message_id))
    existing = fb_result.scalar_one_or_none()
    if existing:
        existing.rating = payload.rating
        existing.comment = payload.comment
        await db.commit()
        await db.refresh(existing)
        return existing

    feedback = Feedback(
        id=str(uuid.uuid4()),
        message_id=payload.message_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)
    return feedback
