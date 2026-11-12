"""
Agentic mode: for a logged-in student who has a student record, the answer model can
call tools (function calling) to read the student's own data and to search the
university documents, several times if needed, before it answers.

Tools
  search_regulations(query)      hybrid RAG search over the official documents (same as normal chat)
  get_student_profile()          program, admission, terms, advisor, standing, CGPA
  get_transcript()               courses with grades and terms, plus this term's registration
  get_study_plan_status()        done / registered / can take now / locked, elective choices
  get_thesis_status()            Thesis Roadmap progress (master's)
  calculate_gpa(courses)         what-if CGPA for hypothetical grades (retakes replace old grades)
  grade_needed(target_cgpa)      lowest grade in one more course to reach a CGPA

The student data is passed in as a snapshot; the tools never write anything.
If the model or a tool fails, the caller falls back to the normal RAG answer.
"""
import json
import os

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool

from backend.services import student_records as sr
from backend.services import thesis_roadmap
from backend.services.gemini_llm import get_llm_client, _extract_text, _clean
from backend.services.rag_service import ROOT_DIR  # noqa: F401  (puts the project root on sys.path)
from RAG.query_data import retrieve, _cited_sources

MAX_ROUNDS = int(os.getenv("AGENT_MAX_ROUNDS", "4"))

AGENT_PROMPT = """You are Mosaed, an assistant for the University of Sharjah (UOS). You are talking to a logged-in student, and you have tools to read this student's record and to search the official university documents.

How to work:
- For any rule, requirement, deadline, procedure, form or policy, call search_regulations and base the rule only on what it returns. Never state a rule from memory.
- For anything about the student themself (grades, CGPA, standing, courses done or left, registration, thesis progress), call the student tools. Do not ask the student for data the tools can give you.
- Combine both when the question needs it, e.g. "can I register my thesis now?" needs the record AND the rule. Search again with a better query if the first results do not cover the question.
- Use calculate_gpa or grade_needed for any GPA arithmetic; do not compute GPAs yourself.

How to answer:
- Be short. Start with the direct answer in the first sentence (e.g. "You need at least a B+ in 1501566."). Default to 2-4 sentences; use a short numbered list only when the student asks for steps, a procedure or a list.
- Mention only the record details needed to support the answer (one line, e.g. "Your CGPA is 2.75 over 6 credit hours."). Do not restate the whole record.
- Give the one rule that decides the answer, in one sentence. No extra sections, background, warnings or related rules unless the student asks.
- No greetings. Address the student directly ("you") and name the specific courses, grades and steps that matter.
- If the documents do not cover a rule, say what is missing and suggest the student confirm with their advisor or the Deanship. Never invent policies, deadlines, GPA thresholds, forms or contact details.
- Never mention tools, "the context" or "the documents"; just answer.
- If the question is unrelated to the University of Sharjah and to the student's studies, say: "I can only assist with questions related to the University of Sharjah. Please ask a relevant question."
- Respond in the same language the student used (Arabic or English)."""


def _dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1)


def _make_tools(snap: dict, found: list):
    """Tools bound to one student's snapshot. `found` collects retrieved chunks for the sources."""

    def search_regulations(query: str) -> str:
        """Search the official UOS documents (regulations, Student Handbook, Master's Executive
        Regulations, thesis roadmap, academic calendar, study plans, campus guide). Write a
        specific query, e.g. 'academic probation CGPA below 3.0 dismissal'."""
        results, _route = retrieve(query)
        found.extend(results)
        return "\n\n---\n\n".join(doc.page_content for doc, _ in results[:6]) or "No results."

    def get_student_profile() -> str:
        """The student's profile: name, student ID, program, level, study mode, admission type,
        start and current term, advisor, thesis supervisor, academic standing and CGPA."""
        cgpa, hours = sr.gpa(snap["transcript"])
        keys = ["name", "student_id", "level", "study_mode", "admission", "start_term", "current_term",
                "advisor", "supervisor", "probations", "notes"]
        out = {k: snap[k] for k in keys}
        out["program"] = sr.plan_status(snap).get("plan", snap["plan_id"])
        out["cgpa"] = cgpa
        out["gpa_credit_hours"] = hours
        out["standing"] = sr.standing(snap)
        out["passing_grade_per_course"] = sr.PASS_GRADE[snap["level"]]
        return _dump(out)

    def get_transcript() -> str:
        """All courses on the student's transcript with grade and term (IP = in progress,
        P = pass, not in the GPA), and the courses registered this term."""
        rows = [{**e, "passed": sr.passed(e, snap["level"])} for e in snap["transcript"]]
        return _dump({"transcript": rows, "registered_this_term": snap["registered"],
                      "current_term": snap["current_term"]})

    def get_study_plan_status() -> str:
        """Compare the record with the official study plan: courses done, registered now,
        can take now, locked (with missing prerequisites), open elective slots and elective choices."""
        return _dump(sr.plan_status(snap))

    def get_thesis_status() -> str:
        """The student's Thesis Roadmap progress (9 steps): which steps are done, the current step and what follows."""
        if snap["thesis_done"] is None:
            return "This student is not in a thesis program (no Thesis Roadmap)."
        return thesis_roadmap.progress_context(snap["thesis_done"])

    def calculate_gpa(courses: list[dict]) -> str:
        """What-if CGPA. `courses` = list of {"code": optional course code, "credits": int,
        "grade": one of A, B+, B, C+, C, D+, D, F}. A code already on the transcript counts as a retake."""
        return _dump(sr.what_if(snap, courses))

    def grade_needed(target_cgpa: float, credits: int = 3) -> str:
        """Lowest grade needed in one more course (default 3 credit hours) to bring the CGPA to target_cgpa."""
        return _dump(sr.needed_grade(snap, float(target_cgpa), int(credits)))

    fns = [search_regulations, get_student_profile, get_transcript, get_study_plan_status,
           get_thesis_status, calculate_gpa, grade_needed]
    return [StructuredTool.from_function(f) for f in fns]


def run_agent(question: str, chat_history: list[dict], snap: dict) -> tuple[str, list, list]:
    """Returns (answer, sources, trace). trace = the tool calls made, for logs and evaluation."""
    found, trace = [], []
    tools = _make_tools(snap, found)
    by_name = {t.name: t for t in tools}
    llm = get_llm_client(temperature=0.1, max_tokens=2048)
    llm_tools = llm.bind_tools(tools)

    messages = [SystemMessage(AGENT_PROMPT)]
    for m in (chat_history or [])[-6:]:
        messages.append(HumanMessage(m["content"]) if m["role"] == "user" else AIMessage(m["content"]))
    messages.append(HumanMessage(question))

    for _ in range(MAX_ROUNDS):
        reply = llm_tools.invoke(messages)
        messages.append(reply)
        if not reply.tool_calls:
            break
        for call in reply.tool_calls:
            tool = by_name.get(call["name"])
            try:
                result = tool.invoke(call["args"]) if tool else f"Unknown tool {call['name']}"
            except Exception as e:  # a bad argument should not end the conversation
                result = f"Tool error: {e}"
            trace.append({"tool": call["name"], "args": call["args"]})
            messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))
    else:
        # out of rounds: ask for the final answer without tools
        reply = llm.invoke(messages + [HumanMessage("Answer the student's question now with what you have.")])

    answer = _clean(_extract_text(reply.content))
    print(f"Agent tools: {[t['tool'] for t in trace]}")
    return answer, _cited_sources(answer, found), trace
