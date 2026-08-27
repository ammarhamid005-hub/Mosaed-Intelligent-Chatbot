"""
RAG Service – thin wrapper around the existing query_rag() function.
All ChromaDB / LLM logic stays in query_data.py (project root).
"""
import sys
import os

# Allow importing from the project root (where query_data.py lives)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from RAG.query_data import query_rag  # noqa: E402


def get_rag_answer(question: str, chat_history: list[dict]) -> tuple[str, list]:
    """
    Call the existing query_rag function and return (answer, sources).
    Runs synchronously – call via asyncio.to_thread() from async routes.
    """
    return query_rag(question, chat_history)
