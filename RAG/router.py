"""
router.py
=========
Decides which retrieval path a question takes in the hybrid system.

    route(question) -> ("simple" | "multi_step" | "unsure", reason)

  simple      -> normal vector RAG (ChromaDB), as before
  multi_step  -> GraphRAG path (plus a few vector chunks as a safety net)
  unsure      -> both paths, merged

Two layers, cheap first:
  1. Rules (free, instant): obvious simple questions (greetings, campus services,
     study plans / courses) and obvious multi-step scenarios.
  2. LLM classifier (one short call to the answer model) for everything else.
ROUTER=rules in .env uses the rules only (no extra model call; undecided -> unsure).
"""
import os
import re

_CAMPUS = re.compile(
    r"\b(office|building|located|location|where is|where can|working hours|opening hours|open on|"
    r"library|printer|print|restaurant|cafe|coffee|atm|bank|parking|gate|pharmacy|prayer|mosque|"
    r"sports|gym|hospital|clinic|dental|housing|dorm|security|lost and found|co-?op|club|email of|phone)\b", re.I)
_STUDY_PLAN = re.compile(
    r"\b(study plan|msc in|bsc in|master'?s in|bachelor'?s in|course code|which courses|elective courses|"
    r"compulsory courses|first semester of the|semester \d of)\b", re.I)
_DATE = re.compile(r"\b(when (do|does|is|are)|last day|what date|which date|deadline for)\b", re.I)
_PREREQ_CHAIN = re.compile(
    r"\b(prerequisites? (chain|of the prerequisites?)|before (i can |i could |i )?(take|register|enrol+)|"
    r"(must|should|do) i (finish|complete|pass|take) (first|before)|what (courses )?(must|should|do) i (finish|complete|pass) )", re.I)
_GREETING = re.compile(r"^\s*(hi|hello|hey|salam|السلام عليكم|مرحبا|thanks|thank you|شكرا)\b[\s!.?]*$", re.I)
_SCENARIO = re.compile(
    r"\b(what happens if|what happens now|can i still|am i at risk|is there any way|if i (do not|don't|fail|skip|get)|"
    r"what if|and then|after that|still eligible|longest|maximum total|earliest)\b|"
    r"(ماذا يحدث|ماذا سيحدث|هل يمكنني|إذا)", re.I)

CLASSIFY_PROMPT = """Classify a university student's question for a retrieval system.

simple     = answered by ONE fact or ONE rule: a date, a number, a contact, an office, a course list,
             one requirement or one definition.
multi_step = needs SEVERAL rules or documents combined: checking conditions, a personal scenario
             ("I have X and Y, can I ...?"), consequences ("what happens if ... and then ..."),
             sequences of steps, or a calculation from several rules.

Reply with exactly one word: simple, multi_step or unsure.

Question: {question}"""


def _rules(q: str):
    if _GREETING.match(q):
        return "simple", "rule: greeting"
    if _PREREQ_CHAIN.search(q):
        return "multi_step", "rule: prerequisite chain"
    if _CAMPUS.search(q) and not _SCENARIO.search(q):
        return "simple", "rule: campus services"
    if _STUDY_PLAN.search(q) and not _SCENARIO.search(q):
        return "simple", "rule: study plan"
    if _DATE.search(q) and not _SCENARIO.search(q) and len(q.split()) <= 15:
        return "simple", "rule: single date"
    if _SCENARIO.search(q) and len(q.split()) >= 8:
        return "multi_step", "rule: scenario wording"
    return None, None


def _llm(q: str):
    from backend.services.gemini_llm import get_llm_client, _extract_text
    llm = get_llm_client(temperature=0.0, max_tokens=10)
    word = _extract_text(llm.invoke(CLASSIFY_PROMPT.format(question=q)).content).strip().lower()
    for label in ("multi_step", "simple", "unsure"):
        if label in word.replace("-", "_").replace(" ", "_"):
            return label
    return "unsure"


def route(question: str):
    label, reason = _rules(question)
    if label:
        return label, reason
    if os.getenv("ROUTER", "llm").lower() == "rules":
        return "unsure", "rules: undecided"
    try:
        return _llm(question), "llm"
    except Exception as e:
        return "unsure", f"llm error: {str(e)[:80]}"
