import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.database.models import ChatSession, ChatMessage, Feedback, User
from backend.database.schemas import SessionCreate, SessionOut, SessionPatch, MessageOut
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("", response_model=SessionOut)
async def create_session(
    payload: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ChatSession(id=str(uuid.uuid4()), user_id=current_user.id, title=payload.title or "New Chat")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("", response_model=list[SessionOut])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/{session_id}/messages", response_model=list[MessageOut])
async def get_session_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found.")

    messages_result = await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at)
    )
    return messages_result.scalars().all()


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found.")

    # Delete feedback and messages explicitly; Feedback has no DB-level cascade
    # from the session, so we must delete it before the messages row is removed.
    msg_ids_result = await db.execute(select(ChatMessage.id).where(ChatMessage.session_id == session_id))
    message_ids = msg_ids_result.scalars().all()
    if message_ids:
        await db.execute(sql_delete(Feedback).where(Feedback.message_id.in_(message_ids)))
        await db.execute(sql_delete(ChatMessage).where(ChatMessage.session_id == session_id))

    await db.execute(sql_delete(ChatSession).where(ChatSession.id == session_id))
    await db.commit()


@router.patch("/{session_id}", response_model=SessionOut)
async def patch_session(
    session_id: str,
    payload: SessionPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    session.folder_id = payload.folder_id
    await db.commit()
    await db.refresh(session)
    return session
