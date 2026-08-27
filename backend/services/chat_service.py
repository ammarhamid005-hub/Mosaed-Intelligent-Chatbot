"""
Chat service – business logic for creating sessions, saving messages,
and orchestrating the RAG call.
"""
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import ChatSession, ChatMessage
from backend.services.rag_service import get_rag_answer


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def get_or_create_session(db: AsyncSession, session_id: str | None, user_id: str) -> ChatSession:
    if session_id:
        result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
        session = result.scalar_one_or_none()
        if session:
            return session

    session = ChatSession(id=str(uuid.uuid4()), user_id=user_id, title="New Chat")
    db.add(session)
    await db.flush()
    return session


async def load_history(db: AsyncSession, session_id: str) -> list[dict]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = result.scalars().all()
    return [{"role": m.role, "content": m.content} for m in messages]


async def handle_chat(db: AsyncSession, session_id: str | None, question: str, user_id: str = "") -> dict:
    session = await get_or_create_session(db, session_id, user_id)
    history = await load_history(db, session.id)

    # Run the blocking RAG call in a thread pool so we don't block the event loop
    answer, sources = await asyncio.to_thread(get_rag_answer, question, history)

    # Persist user message
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="user",
        content=question,
        created_at=_utcnow(),
    )
    db.add(user_msg)

    # Persist assistant message
    assistant_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        role="assistant",
        content=answer,
        created_at=_utcnow(),
    )
    db.add(assistant_msg)

    # Update session title from first question
    if session.title == "New Chat":
        new_title = question[:60].strip() + ("…" if len(question) > 60 else "")
        await db.execute(
            update(ChatSession)
            .where(ChatSession.id == session.id)
            .values(title=new_title, updated_at=_utcnow())
        )
    else:
        await db.execute(
            update(ChatSession)
            .where(ChatSession.id == session.id)
            .values(updated_at=_utcnow())
        )

    await db.commit()

    return {
        "session_id": session.id,
        "message_id": assistant_msg.id,
        "answer": answer,
        "sources": sources,
    }
