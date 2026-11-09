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

# Retrieval mode: vector (ChromaDB only, the original behaviour), graph (GraphRAG path for
# every question) or hybrid (the router picks per question). Set RETRIEVAL_MODE in .env.
RETRIEVAL_MODE = os.getenv("RETRIEVAL_MODE", "vector").strip().lower()
LAST_ROUTE = None  # route of the most recent question (read by evaluate_rag.py)

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

_LABEL_RE = re.compile(r"\[Study plan: (?:BSc|MSc) in (.+?) \((Bachelor's|Master's)\)")


def program_hint(query: str, results: list) -> str:
    """If the retrieved study plans come from programs the user never named,
    return a note telling the model to ask which program instead of guessing."""
    programs = {}
    plan_chunks = 0
    for doc, _score in results:
        m = _LABEL_RE.match(doc.metadata.get("label") or "")
        if m:
            plan_chunks += 1
            programs[m.group(1).lower()] = f"{m.group(1)} ({m.group(2)})"
    if not programs:
        return ""
    q = query.lower()
    if any(name in q for name in programs):
        return ""  # the user named the program
    if len(programs) < 2 and plan_chunks < len(results) / 2:
        return ""  # one stray study-plan chunk, the answer is probably in the regulations
    names = ", ".join(sorted(programs.values()))
    return ("\n\nNote: the question does not name a program, and the study plans above belong to: "
            f"{names}. If the answer depends on the program, do not pick one; ask the user which "
            "program (and Bachelor's or Master's) they mean, giving a few of these as examples. "
            "If the answer is the same for all students (for example a general regulation), answer normally.")


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


def _merge(first: list, second: list, max_results: int = 8) -> list:
    """Combine two (Document, score) lists, first list first, without duplicate chunks."""
    seen, out = set(), []
    for doc, score in first + second:
        key = doc.metadata.get("id") or doc.page_content[:80]
        if key in seen:
            continue
        seen.add(key)
        out.append((doc, score))
        if len(out) >= max_results:
            break
    return out


def _interleave(a: list, b: list) -> list:
    out = []
    for i in range(max(len(a), len(b))):
        out += a[i:i + 1] + b[i:i + 1]
    return out


def query_rag(query_text: str, chat_history: list[dict] | None = None, with_route: bool = False):
    global LAST_ROUTE
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
    # Embed the question once and reuse it for both the vector and the graph path.
    query_embedding = embedding_function.embed_query(standalone_query)
    raw_results = db.similarity_search_by_vector_with_relevance_scores(
        query_embedding,
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

    # ── hybrid RAG / GraphRAG ─────────────────────────────────────────────
    route = "vector"
    if RETRIEVAL_MODE in ("graph", "hybrid"):
        from . import graph_retriever
        if not graph_retriever.available():
            route = "vector (no graph_db yet)"
        else:
            if RETRIEVAL_MODE == "graph":
                route = "multi_step"
            else:
                from .router import route as choose_route
                route, reason = choose_route(standalone_query)
                print(f"Route: {route} ({reason})")
            if route in ("multi_step", "unsure"):
                graph_results = graph_retriever.graph_retrieve(standalone_query, query_embedding, k=6)
                if route == "multi_step":
                    # graph passages first, a few vector chunks as a safety net
                    results = _merge(graph_results, results[:3], max_results=8)
                else:
                    results = _merge(_interleave(graph_results, results), [], max_results=8)
    LAST_ROUTE = route

    context_text = "\n\n---\n\n".join([doc.page_content for doc, _score in results])

    user_prompt_formatted = USER_PROMPT.format(
        user_question=standalone_query,
        retrieved_context=context_text
    ) + program_hint(standalone_query, results)

    response_text = generate_answer(SYSTEM_PROMPT, user_prompt_formatted)

    sources = [doc.metadata.get("id", None) for doc, _score in results]
    print(f"Response: {response_text}\nSources: {sources}")
    if with_route:
        return response_text, sources, route
    return response_text, sources


if __name__ == "__main__":
    main()