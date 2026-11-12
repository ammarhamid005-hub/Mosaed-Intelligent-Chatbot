"""
Creates SIMULATED (made-up) students for the agentic demo.

    python -m backend.seed_students

Each student gets a login, a student record (program, admission, transcript, current
registration), their Study Plan Progress ticks and their Thesis Roadmap ticks, so the
panels and the chatbot all show the same data. Running it again resets these accounts
to the data below. All names, IDs, grades and people are fictional; the e-mail domain
example.com is reserved for examples.
"""
import asyncio
import json

from sqlalchemy import select, delete

from backend.database.connection import AsyncSessionLocal, create_tables
from backend.database.models import User, StudentRecord, StudyProgress
from backend.services.auth_service import hash_password
from backend.services.student_records import passed
from backend.services.study_plan_service import load_plans
from backend.services import thesis_roadmap

DOMAIN = "mosaed.example.com"


def T(code, grade, term, key=None, credits=None, title=None):
    return {"code": code, "grade": grade, "term": term, "key": key or code, "credits": credits, "title": title}


def R(code, key=None, credits=None, title=None):
    return {"code": code, "key": key or code, "credits": credits, "title": title}


STUDENTS = [
    {
        "name": "Layla Haddad", "email": f"layla.haddad@{DOMAIN}", "password": "Layla@2026",
        "student_id": "U25100001", "plan_id": "cci-msc-data-science", "level": "masters",
        "study_mode": "full-time", "admission": "Regular", "start_term": "Fall 2025-26",
        "current_term": "Fall 2026-27", "advisor": "Dr. Rana Saeed (fictional)",
        "supervisor": "Dr. Rana Saeed (fictional)", "probations": 0,
        "transcript": [
            T("1501565", "A", "Fall 2025-26"), T("1440581", "B+", "Fall 2025-26"), T("1501531", "A", "Fall 2025-26"),
            T("1501564", "B+", "Spring 2025-26"), T("1501591", "A", "Spring 2025-26"), T("1440582", "B", "Spring 2025-26"),
        ],
        "registered": [R("1501668"), R("1440584"), R("1501696", credits=3, title="Thesis in DS (first 3 credit hours)")],
        "thesis_done": ["courses", "proposal", "credits"],
        "notes": "Thesis proposal (G12A) approved in September 2026. Thesis topic: forecasting campus energy use.",
    },
    {
        "name": "Khalid Mansour", "email": f"khalid.mansour@{DOMAIN}", "password": "Khalid@2026",
        "student_id": "U25100002", "plan_id": "cci-msc-data-science", "level": "masters",
        "study_mode": "part-time", "admission": "Regular", "start_term": "Fall 2025-26",
        "current_term": "Fall 2026-27", "advisor": "Dr. Hani Yousef (fictional)", "supervisor": None,
        "probations": 0,
        "transcript": [
            T("1501565", "B+", "Fall 2025-26"),
            T("1501564", "A", "Spring 2025-26"), T("1501591", "C", "Spring 2025-26"),
        ],
        "registered": [R("1440581")],
        "thesis_done": ["courses"],
        "notes": "Works full time; takes one or two courses per semester.",
    },
    {
        "name": "Mariam Al Ali", "email": f"mariam.alali@{DOMAIN}", "password": "Mariam@2026",
        "student_id": "U24100003", "plan_id": "cci-msc-data-science", "level": "masters",
        "study_mode": "full-time", "admission": "Regular", "start_term": "Fall 2024-25",
        "current_term": "Fall 2026-27", "advisor": "Dr. Rana Saeed (fictional)",
        "supervisor": "Dr. Omar Fares (fictional)", "probations": 0,
        "transcript": [
            T("1501565", "A", "Fall 2024-25"), T("1440581", "A", "Fall 2024-25"), T("1501511", "B+", "Fall 2024-25"),
            T("1501564", "A", "Spring 2024-25"), T("1501591", "A", "Spring 2024-25"), T("1440582", "B+", "Spring 2024-25"),
            T("1501663", "A", "Fall 2025-26"), T("1440583", "B+", "Fall 2025-26"),
            T("1501696", "P", "Fall 2025-26", credits=3, title="Thesis in DS (3 credit hours)"),
            T("1501696", "IP", "Spring 2025-26", key="1501696-9", credits=6, title="Thesis in DS (6 credit hours)"),
        ],
        "registered": [R("1501696", key="1501696-9", credits=0, title="Thesis in DS (re-registration, 0 credits)")],
        "thesis_done": ["courses", "proposal", "credits", "remaining", "paper", "portfolio"],
        "notes": "Paper accepted in a peer-reviewed journal (G21 submitted, September 2026). ORCID registered. "
                 "Thesis draft finished; defense not scheduled yet.",
    },
    {
        "name": "Yousef Karim", "email": f"yousef.karim@{DOMAIN}", "password": "Yousef@2026",
        "student_id": "U26100004", "plan_id": "cci-msc-artificial-intelligence", "level": "masters",
        "study_mode": "part-time", "admission": "Conditional (condition B)", "start_term": "Spring 2025-26",
        "current_term": "Fall 2026-27", "advisor": "Dr. Hani Yousef (fictional)", "supervisor": None,
        "probations": 1,
        "transcript": [T("1501511", "B", "Spring 2025-26"), T("1501530", "C+", "Spring 2025-26")],
        "registered": [R("1501566")],
        "thesis_done": ["courses"],
        "notes": "Admitted conditionally (condition B). Placed on academic probation after Spring 2025-26.",
    },
    {
        "name": "Sara Nasser", "email": f"sara.nasser@{DOMAIN}", "password": "Sara@2026",
        "student_id": "U24200005", "plan_id": "sci-bsc-chemistry", "level": "bachelors",
        "study_mode": "full-time", "admission": "Regular", "start_term": "Fall 2024-25",
        "current_term": "Fall 2026-27", "advisor": "Dr. Lina Khatib (fictional)", "supervisor": None,
        "probations": 0,
        "transcript": [
            T("0201102", "B", "Fall 2024-25"), T("0202112", "B+", "Fall 2024-25"), T("1420101", "B", "Fall 2024-25"),
            T("1420102", "A", "Fall 2024-25"), T("1430110", "C+", "Fall 2024-25"), T("1430116", "B", "Fall 2024-25"),
            T("1440131", "C", "Fall 2024-25"),
            T("1501100", "A", "Spring 2024-25"), T("1420103", "C+", "Spring 2024-25"), T("1420104", "B+", "Spring 2024-25"),
            T("1430117", "C", "Spring 2024-25"), T("1430118", "B", "Spring 2024-25"), T("1440132", "D+", "Spring 2024-25"),
            T("1501116", "B", "Fall 2025-26"), T("0202227", "B+", "Fall 2025-26"), T("1420221", "B", "Fall 2025-26"),
            T("1420222", "A", "Fall 2025-26"), T("1420211", "C+", "Fall 2025-26"), T("1420212", "B", "Fall 2025-26"),
            T("0204102", "A", "Fall 2025-26"),
            T("0104101", "A", "Spring 2025-26"), T("0302200", "B+", "Spring 2025-26"), T("1420217", "C", "Spring 2025-26"),
            T("1420218", "B+", "Spring 2025-26"), T("1420241", "F", "Spring 2025-26"), T("1420242", "C+", "Spring 2025-26"),
        ],
        "registered": [R("1420241"), R("1420331"), R("1420311"), R("1420361"), R("0202207")],
        "thesis_done": None,  # bachelor's student: no thesis roadmap
        "notes": "Retaking Physical Chemistry I (1420241) after an F in Spring 2025-26.",
    },
]


def _fill(entries: list[dict], plan: dict) -> list[dict]:
    """Add the title and credit hours from the official study plan."""
    by_key = {c["key"]: c for c in plan["courses"]}
    by_code = {c["code"]: c for c in plan["courses"] if c.get("code")}
    out = []
    for e in entries:
        c = by_key.get(e["key"]) or by_code.get(e["code"])
        if c is None:
            raise SystemExit(f"{e['code']} is not in {plan['id'] if 'id' in plan else 'the plan'}")
        out.append({k: v for k, v in {
            "code": e["code"], "title": e["title"] or c["title"],
            "credits": e["credits"] if e["credits"] is not None else c["credits"],
            "grade": e.get("grade"), "term": e.get("term"), "key": e["key"],
        }.items() if v is not None})
    return out


async def seed():
    await create_tables()
    plans = load_plans()
    async with AsyncSessionLocal() as db:
        for s in STUDENTS:
            plan = plans[s["plan_id"]]
            transcript = _fill(s["transcript"], plan)
            registered = _fill(s["registered"], plan)

            user = (await db.execute(select(User).where(User.email == s["email"]))).scalar_one_or_none()
            if user is None:
                user = User(name=s["name"], email=s["email"])
                db.add(user)
            user.name = s["name"]
            user.password_hash = hash_password(s["password"])
            await db.flush()

            await db.execute(delete(StudentRecord).where(StudentRecord.user_id == user.id))
            await db.execute(delete(StudyProgress).where(StudyProgress.user_id == user.id))
            db.add(StudentRecord(
                user_id=user.id, student_id=s["student_id"], plan_id=s["plan_id"], track=None,
                level=s["level"], study_mode=s["study_mode"], admission=s["admission"],
                start_term=s["start_term"], current_term=s["current_term"], advisor=s["advisor"],
                supervisor=s["supervisor"], probations=s["probations"],
                transcript=json.dumps(transcript, ensure_ascii=False),
                registered=json.dumps(registered, ensure_ascii=False), notes=s["notes"],
            ))
            # Study Plan Progress ticks = the courses passed on the record
            ticks = sorted({e["key"] for e in transcript if passed(e, s["level"])})
            db.add(StudyProgress(user_id=user.id, plan_id=s["plan_id"], completed=json.dumps(ticks)))
            if s["thesis_done"] is not None:
                db.add(StudyProgress(user_id=user.id, plan_id=thesis_roadmap.PLAN_ID,
                                     completed=json.dumps(s["thesis_done"])))
            print(f"  {s['name']:<16} {s['email']:<34} {s['password']}")
        await db.commit()
    print("Simulated students ready.")


if __name__ == "__main__":
    asyncio.run(seed())
