import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.database.models import User
from backend.database.schemas import ChatRequest, ChatResponse
from backend.services.chat_service import handle_chat
from backend.routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def send_message(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    try:
        result = await handle_chat(db, payload.session_id, payload.question.strip(), current_user.id)
        return result
    except Exception as exc:
        logger.error("Chat error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(exc))
