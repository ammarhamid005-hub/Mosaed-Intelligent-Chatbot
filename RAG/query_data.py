import sys
import argparse
import os
import re

# Ensure stdout can handle Unicode (fixes 'charmap' codec error on Windows)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from langchain_chroma import Chroma
from dotenv import load_dotenv

from .get_embedding_function import get_embedding_function
from backend.services.gemini_llm import generate_answer, generate_text

# Load environment variables
load_dotenv()

CHROMA_PATH = "./chroma_db"

# L2 distance threshold — chunks with score >= this value are too dissimilar
# and are dropped before the LLM sees them. Lower = stricter.
SCORE_THRESHOLD = 1.5

SYSTEM_PROMPT = """You are Mosaed, an assistant for the University of Sharjah (UOS) community: undergraduate and graduate students, faculty and staff. Master's students remain the main audience, but answer any UOS question the documents cover.

You assist with any topic that may help them, including:
- Academic regulations, GPA rules, graduation and admission requirements
- Thesis, research procedures, and official forms (graduate students)
- Registration, deadlines, withdrawals, and the academic calendar
- Study plans for Bachelor's and Master's programs: courses, credit hours, prerequisites and semester order
- Colleges, departments and programs at UOS
- Campus services and facilities: offices (Finance, Registration, Admissions, IT), libraries, study rooms, printers, restaurants, cafes, shops, pharmacy, prayer rooms, mosques, sports complex, hospitals, ATMs, parking, gates, housing, security, lost and found, clubs, labs
- Building names, campus locations, working hours and contact details

Response rules:
- Answer using only the retrieved context. Do not use outside knowledge.
- Do NOT add greetings, self-introductions, or pleasantries before your answer. Get straight to the point.
- If the user sends only a greeting or small talk (no actual question), respond briefly and invite them to ask their question.
- Match the length of your answer to the question: simple factual questions (a single number, name, or requirement) get a single sentence. Only use more detail if the question asks for a process, list, or explanation.
- Study plans differ by program and level. If the question does not say which program (or Bachelor's vs Master's) and the answer differs between programs, ask which program they mean instead of guessing. If the context contains plans from different catalog years, say which year you used.
- If a rule differs for undergraduate and graduate students, answer for the level the user asked about; if they did not say, give both or ask.
- If the context only partially covers the question, share what is available and note what is missing. Never present a partial list as complete.
- Never mention "the context" or "the documents" in your answer; just answer.
- If the answer is not in the context at all, say: "I can only assist with questions related to the University of Sharjah. Please ask a relevant question."
- Never fabricate policies, deadlines, credit hours, GPA thresholds, procedures, prices, working hours, phone numbers, instructor names, or emails.
- Respond in the same language the user used (Arabic or English).
- Format multi-step procedures and requirement lists with numbered points for clarity."""

USER_PROMPT = """Retrieved context:
-----
{retrieved_context}
-----

Question: {user_question}

Using only the context above, answer the question."""

STANDALONE_QUESTION_TEMPLATE = """
Rewrite the follow-up question into a standalone question using the conversation history.

Rules:
- Only use the conversation history to resolve pronouns (e.g. "it", "that", "this") or explicit references like "what about the other one?" or "and for Arabic programs?".
- Do NOT carry over topics from previous questions if the new question does not explicitly reference them.
- If the question is already standalone and self-contained, return it exactly as-is.
- Do not answer the question. Return only the rewritten question.

Conversation history:
{chat_history}

Follow-up question: {question}

Standalone question:
"""

# Queries asking for lists or procedures need more context chunks than point questions.
_BROAD_PATTERN = re.compile(
    r'\b(list|summarize|summary|overview|complete|full|steps|roadmap|'
    r'requirements|conditions|procedure|process|guide)\b'
)

def is_broad_query(query: str) -> bool:
    return bool(_BROAD_PATTERN.search(query.lower()))


def main():
    # Create CLI.
    parser = argparse.ArgumentParser()
    parser.add_argument("query_text", type=str, help="The query text.")
    args = parser.parse_args()
    query_text = args.query_text
    query_rag(query_text, [])


def _format_chat_history(chat_history: list[dict], max_messages: int = 6) -> str:
    if not chat_history:
        return ""

    recent_messages = chat_history[-max_messages:]
    formatted_messages = []
    for message in recent_messages:
        role = "User" if message.get("role") == "user" else "Assistant"
        content = (message.get("content") or "").strip()
        if content:
            formatted_messages.append(f"{role}: {content}")

    return "\n".join(formatted_messages)


def _select_diverse_chunks(scored_docs: list, max_results: int = 6) -> list:
    """Return up to max_results chunks, keeping at most two chunks per page.
    This avoids context flooding from one page while still capturing multi-chunk rules."""
    page_counts: dict = {}
    diverse = []
    for doc, score in scored_docs:
        page_key = f"{doc.metadata.get('source')}:{doc.metadata.get('page')}"
        if page_counts.get(page_key, 0) < 2:
            diverse.append((doc, score))
            page_counts[page_key] = page_counts.get(page_key, 0) + 1
        if len(diverse) >= max_results:
            break
    return diverse


def query_rag(query_text: str, chat_history: list[dict] | None = None):
    if not os.path.exists(CHROMA_PATH):
        sys.exit(f"Database not found at {CHROMA_PATH}. Run populate_database.py first.")

    embedding_function = get_embedding_function()
    db = Chroma(persist_directory=CHROMA_PATH, embedding_function=embedding_function)

    history_text = _format_chat_history(chat_history or [])
    standalone_query = query_text

    if history_text:
        # Resolve pronouns ("it", "that program") using prior turns so the
        # vector search query is self-contained and hits the right chunks.
        rewrite_prompt = STANDALONE_QUESTION_TEMPLATE.format(
            chat_history=history_text,
            question=query_text
        )
        rewritten_query = generate_text(rewrite_prompt)
        standalone_query = (rewritten_query or "").strip() or query_text

    broad_query = is_broad_query(standalone_query)

    # Broad queries fetch fewer candidates (coverage > precision);
    # focused questions fetch more so the threshold filter has room to work.
    raw_results = db.similarity_search_with_score(
        standalone_query,
        k=10 if broad_query else 20
    )

    if broad_query:
        results = raw_results[:10]
    else:
        filtered = [(doc, score) for doc, score in raw_results if score < SCORE_THRESHOLD]
        # Fallback: always show something rather than returning nothing.
        if not filtered:
            filtered = raw_results[:5]
        results = _select_diverse_chunks(filtered, max_results=8)

    context_text = "\n\n---\n\n".join([doc.page_content for doc, _score in results])

    user_prompt_formatted = USER_PROMPT.format(
        user_question=standalone_query,
        retrieved_context=context_text
    )

    response_text = generate_answer(SYSTEM_PROMPT, user_prompt_formatted)

    sources = [doc.metadata.get("id", None) for doc, _score in results]
    print(f"Response: {response_text}\nSources: {sources}")
    return response_text, sources


if __name__ == "__main__":
    main()