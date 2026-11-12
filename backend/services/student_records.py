"""
Calculations on a (simulated) student record: CGPA, passed courses, study plan status
and GPA what-if. Everything here is plain Python on a "snapshot" dict, so the agent's
tools can use it without touching the database.

Grade points and passing grades follow the Master's Executive Regulations (C+ to pass a
master's course; CGPA below 3.0 = probation) and the Student Handbook (D to pass an
undergraduate course).
"""
import json

GRADE_POINTS = {"A": 4.0, "B+": 3.5, "B": 3.0, "C+": 2.5, "C": 2.0, "D+": 1.5, "D": 1.0, "F": 0.0}
# Not counted in the GPA: IP = in progress, P = pass, W = withdrawn
PASS_GRADE = {"masters": "C+", "bachelors": "D"}


def snapshot(record, plan_ticks: list[str], thesis_done: list[str], name: str) -> dict:
    """Everything the agent may read about one student, as plain data."""
    return {
        "name": name,
        "student_id": record.student_id,
        "plan_id": record.plan_id,
        "track": record.track,
        "level": record.level,
        "study_mode": record.study_mode,
        "admission": record.admission,
        "start_term": record.start_term,
        "current_term": record.current_term,
        "advisor": record.advisor,
        "supervisor": record.supervisor,
        "probations": record.probations,
        "transcript": json.loads(record.transcript or "[]"),
        "registered": json.loads(record.registered or "[]"),
        "notes": record.notes,
        "plan_ticks": plan_ticks,
        "thesis_done": thesis_done,
    }


def passed(entry: dict, level: str) -> bool:
    g = entry.get("grade")
    if g == "P":
        return True
    if g not in GRADE_POINTS:
        return False
    return GRADE_POINTS[g] >= GRADE_POINTS[PASS_GRADE.get(level, "D")]


def gpa(entries: list[dict]) -> tuple[float | None, int]:
    """(GPA, credit hours counted). For a retaken course only the latest attempt counts."""
    latest = {}
    for e in entries:
        if e.get("grade") in GRADE_POINTS:
            latest[e["code"]] = e  # transcript is in term order, so the last attempt wins
    hours = sum(e["credits"] for e in latest.values())
    if not hours:
        return None, 0
    points = sum(GRADE_POINTS[e["grade"]] * e["credits"] for e in latest.values())
    return round(points / hours, 2), hours


def standing(snap: dict) -> str:
    cgpa, _ = gpa(snap["transcript"])
    if cgpa is None:
        return "No grades yet (first semester)"
    if snap["level"] == "masters":
        if cgpa < 3.0:
            return f"Academic probation (CGPA {cgpa:.2f} is below 3.0; probation number {max(1, snap['probations'])})"
        return f"Good standing (CGPA {cgpa:.2f})"
    return f"CGPA {cgpa:.2f}"


def passed_codes(snap: dict) -> set[str]:
    return {e["code"] for e in snap["transcript"] if passed(e, snap["level"])}


def _is_slot(c: dict) -> bool:
    """An 'Elective Course' placeholder in the plan (no real course code)."""
    return not c.get("code") or not c["code"].isdigit()


def _missing_prereqs(c: dict, in_plan: set, done: set, registered: set) -> list[str]:
    missing = []
    for cond in c.get("prerequisites", []):
        codes = [x for x in cond["codes"] if x in in_plan]
        if not codes:
            continue  # prerequisite from earlier study (e.g. a bachelor's course)
        if any(x in done or (cond.get("coreq") and x in registered) for x in codes):
            continue
        missing.append(" or ".join(codes))
    return missing


def plan_status(snap: dict) -> dict:
    """Compare the record with the official study plan: done / registered / can take / locked."""
    from backend.services.study_plan_service import load_plans
    plan = load_plans().get(snap["plan_id"])
    if not plan:
        return {"error": f"Study plan {snap['plan_id']} not found"}
    courses = [c for c in plan["courses"] if not c.get("track") or c["track"] == snap["track"]]
    done = passed_codes(snap)
    registered = {r["code"] for r in snap["registered"]}
    in_plan = {c["code"] for c in courses if c.get("code")}
    elective_list = [c for c in courses if c["group"] in ("Elective courses", "Other courses")]
    main = [c for c in courses if c not in elective_list]
    required_codes = {c["code"] for c in main if not _is_slot(c)}

    out = {"plan": f"{plan['name']} (catalog {plan['catalog_year']})",
           "total_credit_hours": plan.get("total_credit_hours"),
           "has_prerequisite_data": plan.get("has_prerequisites", True),
           "credit_hours_passed": sum(e["credits"] for e in snap["transcript"] if passed(e, snap["level"])),
           "done": [], "registered_now": [], "can_take": [], "locked": []}
    seen = set()
    for c in main:
        if _is_slot(c) or c["code"] in seen:
            continue
        seen.add(c["code"])
        label = f"{c['code']} {c['title']}"
        if c["code"] in done:
            out["done"].append(label)
        elif c["code"] in registered:
            out["registered_now"].append(label)
        else:
            missing = _missing_prereqs(c, in_plan, done, registered)
            # conditions without a course code ("Senior standing", "Completion of 12 credit hours")
            # cannot be checked here: pass them on so the answer can mention them
            other = [cond["text"] for cond in c.get("prerequisites", [])
                     if not cond["codes"] and cond.get("text") and cond["text"].lower() != "graduate standing"]
            if missing:
                out["locked"].append(f"{label} (needs {', '.join(missing)} first)")
            else:
                out["can_take"].append(label + (f" (also requires: {'; '.join(other)})" if other else ""))

    slots = sum(1 for c in main if _is_slot(c))
    electives_used = len({e["code"] for e in snap["transcript"] if passed(e, snap["level"])} - required_codes) \
        + len(registered - required_codes)
    out["elective_slots_in_plan"] = slots
    out["elective_slots_still_open"] = max(0, slots - electives_used)
    choices = []
    for c in elective_list:
        if not c.get("code") or c["code"] in done | registered:
            continue
        missing = _missing_prereqs(c, in_plan, done, registered)
        choices.append(f"{c['code']} {c['title']}" + (f" (needs {', '.join(missing)} first)" if missing else ""))
    out["elective_choices"] = choices
    return out


def what_if(snap: dict, courses: list[dict]) -> dict:
    """New CGPA if the student gets these grades. A course code already on the transcript
    is treated as a retake (latest attempt replaces the old grade in this calculation)."""
    now, hours_now = gpa(snap["transcript"])
    extra, notes = [], []
    known = {e["code"] for e in snap["transcript"]}
    for i, c in enumerate(courses):
        g = str(c.get("grade", "")).upper().strip()
        if g not in GRADE_POINTS:
            return {"error": f"Unknown grade '{c.get('grade')}'. Use one of {', '.join(GRADE_POINTS)}."}
        code = c.get("code") or f"new-{i}"
        if code in known:
            notes.append(f"{code} counted as a retake: the new grade replaces the old one in this calculation")
        extra.append({"code": code, "credits": int(c.get("credits") or 3), "grade": g})
    new, hours_new = gpa(snap["transcript"] + extra)
    return {"current_cgpa": now, "current_hours": hours_now, "new_cgpa": new, "hours_after": hours_new,
            "notes": notes}


def needed_grade(snap: dict, target: float, credits: int = 3) -> dict:
    """Lowest grade in one more course (of `credits`) that lifts the CGPA to the target."""
    for g in sorted(GRADE_POINTS, key=GRADE_POINTS.get):
        r = what_if(snap, [{"credits": credits, "grade": g}])
        if r["new_cgpa"] is not None and r["new_cgpa"] >= target:
            return {"target": target, "lowest_grade_needed": g, "cgpa_with_it": r["new_cgpa"]}
    return {"target": target, "lowest_grade_needed": None,
            "note": f"Even an A in one {credits}-credit course does not reach {target}"}
