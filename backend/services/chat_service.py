"""
Chat service – business logic for creating sessions, saving messages,
and orchestrating the RAG call.
"""
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import ChatSession, ChatMessage, StudyProgress, StudentRecord, User
from backend.services.rag_service import get_rag_answer
from backend.services import thesis_roadmap
from backend.services import student_records

# Agentic mode for students who have a (simulated) student record; AGENT_MODE=off disables it.
AGENT_MODE = os.getenv("AGENT_MODE", "on").strip().lower() != "off"


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


async def load_student_context(db: AsyncSession, user_id: str) -> dict | None:
    """The student's Thesis Roadmap progress, if they have used the tracker."""
    if not user_id:
        return None
    row = (await db.execute(
        select(StudyProgress).where(StudyProgress.user_id == user_id,
                                    StudyProgress.plan_id == thesis_roadmap.PLAN_ID)
    )).scalar_one_or_none()
    if row is None:
        return None
    completed = json.loads(row.completed or "[]")
    return {"text": thesis_roadmap.progress_context(completed),
            "search_hint": thesis_roadmap.search_hint(completed)}


async def load_student_snapshot(db: AsyncSession, user_id: str) -> dict | None:
    """The student's record + tracker progress for the agent, or None if they have no record."""
    if not user_id:
        return None
    record = (await db.execute(select(StudentRecord).where(StudentRecord.user_id == user_id))).scalar_one_or_none()
    if record is None:
        return None
    user = await db.get(User, user_id)
    rows = (await db.execute(select(StudyProgress).where(StudyProgress.user_id == user_id))).scalars().all()
    by_plan = {r.plan_id: json.loads(r.completed or "[]") for r in rows}
    thesis = by_plan.get(thesis_roadmap.PLAN_ID)
    if thesis is None and record.level == "masters":
        thesis = []
    return student_records.snapshot(record, by_plan.get(record.plan_id, []), thesis, user.name if user else "")


def _answer(question: str, history: list[dict], student: dict | None, snap: dict | None):
    """Agent for students with a record; normal RAG otherwise or if the agent fails."""
    if snap is not None and AGENT_MODE:
        try:
            from backend.services.agent_service import run_agent
            answer, sources, _trace = run_agent(question, history, snap)
            if answer:
                return answer, sources
        except Exception as e:
            print(f"Agent failed, using normal RAG: {e!r}")
    return get_rag_answer(question, history, student)


async def handle_chat(db: AsyncSession, session_id: str | None, question: str, user_id: str = "") -> dict:
    session = await get_or_create_session(db, session_id, user_id)
    history = await load_history(db, session.id)
    student = await load_student_context(db, user_id)
    snap = await load_student_snapshot(db, user_id)

    # Run the blocking RAG / agent call in a thread pool so we don't block the event loop
    answer, sources = await asyncio.to_thread(_answer, question, history, student, snap)

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
        sources=json.dumps(sources or [], ensure_ascii=False),
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
