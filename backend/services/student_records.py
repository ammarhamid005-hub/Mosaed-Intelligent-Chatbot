"""
Calculations on a (simulated) student record: CGPA, passed courses, study plan status
and GPA what-if. Everything here is plain Python on a "snapshot" dict, so the agent's
tools can use it without touching the database.

Grade points and passing grades follow the Master's Executive Regulations (C+ to pass a
master's course; CGPA below 3.0 = probation) and the Student Handbook (D to pass an
undergraduate course).
"""
import json
import math
import re
from collections import Counter

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


ELECTIVE_GROUPS = ("Elective courses", "Other courses")


def _is_dept_slot(c: dict) -> bool:
    """A department / specialized elective slot (vs. a university or free elective)."""
    t = c["title"].lower()
    return any(w in t for w in ("dept", "department", "specialized", "specialised", "major"))


def slot_kind(title: str) -> str:
    """'Dept. Specialized Elec 3' -> 'Dept. Specialized Elec' (numbered slots of one kind)."""
    return re.sub(r"\s*\d+\s*$", "", title).strip()


def plan_courses(snap: dict, plan: dict) -> list[dict]:
    """The plan's courses for the student's track."""
    return [c for c in plan["courses"] if not c.get("track") or c["track"] == snap["track"]]


def _prereq_check(c: dict, by_code: dict, done: set, registered: set) -> tuple[list, list, list]:
    """(needs, with_courses, notes) for one course.
    needs        prerequisites not passed yet: the course is locked
    with_courses co-requisites not passed or registered: take them before or together
    notes        conditions without a course code ("Senior standing"), or from earlier study"""
    needs, together, notes = [], [], []
    for cond in c.get("prerequisites", []):
        codes = [x for x in cond["codes"] if x in by_code]
        if not cond["codes"]:
            if cond.get("text") and cond["text"].lower() != "graduate standing":
                notes.append(cond["text"])
            continue
        if not codes:
            continue  # prerequisite from earlier study (e.g. a bachelor's course)
        if any(x in done for x in codes):
            continue
        names = " or ".join(f"{x} {by_code[x]['title']}" for x in codes)
        if cond.get("coreq"):
            if not any(x in registered for x in codes):
                together.append((codes, names))
        else:
            needs.append(names)
    return needs, together, notes


def course_statuses(snap: dict, courses: list[dict]) -> dict:
    """Every plan course's status on the record, keyed by the course's plan key:
    done (passed, with the grade) · progress (registered this term) · retake (failed and
    not retaken yet) · available (can register now) · locked (a prerequisite is missing).
    The Study Plan panel and the chatbot both use this, so they always agree."""
    level = snap["level"]
    keys = {c["key"] for c in courses}
    by_code = {}
    for c in courses:
        if c.get("code"):
            by_code.setdefault(c["code"], c)

    def key_of(e):
        if e.get("key") in keys:
            return e["key"]
        c = by_code.get(e.get("code"))
        return c["key"] if c else None

    attempts = {}
    for e in snap["transcript"]:
        k = key_of(e)
        if k:
            attempts.setdefault(k, []).append(e)
    reg_keys = {key_of(r) for r in snap["registered"]} - {None}
    done = passed_codes(snap)
    registered = {r["code"] for r in snap["registered"]}

    out = {}
    for c in courses:
        tries = attempts.get(c["key"], [])
        ok = next((e for e in reversed(tries) if passed(e, level)), None)
        failed = [e for e in tries if e.get("grade") in GRADE_POINTS and not passed(e, level)]
        info = {"attempts": [{"grade": e.get("grade"), "term": e.get("term")} for e in tries],
                "needs": [], "with_courses": [], "notes": []}
        if ok:
            info.update(status="done", grade=ok["grade"], term=ok.get("term"))
        elif c["key"] in reg_keys:
            info.update(status="progress", term=snap["current_term"], retake=bool(failed))
        else:
            needs, together, notes = _prereq_check(c, by_code, done, registered)
            info.update(needs=needs, with_courses=together, notes=notes)
            info["status"] = "retake" if failed else ("locked" if needs else "available")
        out[c["key"]] = info

    # A course to be taken "together with" another one is only open if that one is open too
    # (e.g. Physical Chemistry II Lab, while Physical Chemistry II is still locked).
    for c in courses:
        info = out[c["key"]]
        together, info["with_courses"] = info["with_courses"], [names for _, names in info["with_courses"]]
        # the same, as plan keys (one list per condition: any one of them is enough)
        info["with_options"] = [[by_code[x]["key"] for x in codes] for codes, _ in together]
        if info["status"] != "available":
            continue
        closed = [names for codes, names in together
                  if not any(out[by_code[x]["key"]]["status"] in ("available", "retake") for x in codes)]
        if closed:
            info["status"] = "locked"
            info["needs"] = [f"{n} (taken together, not open yet)" for n in closed]

    # Elective slots ("Elective Course" placeholders): fill them with the passed or registered
    # courses that are not required courses of the plan. A course from the program's own
    # department (same code prefix as most required courses) goes into a department /
    # specialized slot first; any other course only into a university / free elective slot.
    main = [c for c in courses if c["group"] not in ELECTIVE_GROUPS]
    required = {c["code"] for c in main if not _is_slot(c)}
    fillers = [("done", e) for e in snap["transcript"] if passed(e, level) and e["code"] not in required]
    fillers += [("progress", r) for r in snap["registered"] if r["code"] not in required]
    seen = set()
    fillers = [f for f in fillers if not (f[1]["code"] in seen or seen.add(f[1]["code"]))]
    prefixes = Counter(c["code"][:4] for c in main if not _is_slot(c))
    dept = prefixes.most_common(1)[0][0] if prefixes else None
    open_slots = [c for c in main if _is_slot(c)]
    pairs = []
    for status, e in fillers:
        own = dept and str(e.get("code", "")).startswith(dept)
        order = ([s for s in open_slots if _is_dept_slot(s)] + [s for s in open_slots if not _is_dept_slot(s)]
                 if own else [s for s in open_slots if not _is_dept_slot(s)])
        if order:
            open_slots.remove(order[0])
            pairs.append((order[0], (status, e)))
    for c, (status, e) in pairs:
        out[c["key"]].update(status=status, grade=e.get("grade") if status == "done" else None,
                             term=e.get("term") or snap["current_term"], needs=[], with_courses=[],
                             with_options=[], filled_by=f"{e['code']} {e.get('title') or ''}".strip())
    return out


def add_chains(courses: list[dict], statuses: dict) -> None:
    """Add prerequisite-chain facts to every status (in place):
    unlocks  plan keys of the courses that list this one as a prerequisite (direct)
    blocks   how many required courses still to do depend on it, directly or further down
    depth    terms needed from this course to the end of its longest chain of prerequisites
             (a course taken "together with" it adds no term); 0 when passed or in progress
    Elective choices are optional, so they do not count towards blocks or depth."""
    key_of = {}
    for c in courses:
        if c.get("code"):
            key_of.setdefault(c["code"], c["key"])
    code_of = {c["key"]: c.get("code") or c["key"] for c in courses}
    deps = {c["key"]: [] for c in courses}
    for c in courses:
        for cond in c.get("prerequisites", []):
            for code in cond["codes"]:
                k = key_of.get(code)
                if k and k != c["key"] and (c["key"], bool(cond.get("coreq"))) not in deps[k]:
                    deps[k].append((c["key"], bool(cond.get("coreq"))))
    left = {c["key"] for c in courses if c["group"] not in ELECTIVE_GROUPS
            and statuses[c["key"]]["status"] not in ("done", "progress")}
    memo = {}

    def depth(k, stack=()):
        if k in memo:
            return memo[k]
        d = 1
        for dk, coreq in deps[k]:
            if dk in left and dk not in stack:
                d = max(d, depth(dk, stack + (k,)) + (0 if coreq else 1))
        memo[k] = d
        return d

    for k, s in statuses.items():
        below, todo = set(), [k]
        while todo:
            for dk, _ in deps[todo.pop()]:
                if dk in left and dk != k and dk not in below:
                    below.add(dk)
                    todo.append(dk)
        s["unlocks"] = list(dict.fromkeys(dk for dk, _ in deps[k]))
        s["blocks"] = len({code_of[x] for x in below})  # a course split over terms counts once
        s["depth"] = 0 if s["status"] in ("done", "progress") else depth(k)


def mark_bottlenecks(courses: list[dict], statuses: dict, summary: dict) -> None:
    """Flag open courses (can take / retake) that hold other courses back (in place).
    critical    its chain is as long as the terms left: leaving it for later delays graduation
    overdue     the plan puts it before next term
    bottleneck  critical, a chain of 3+ terms, 3+ later courses depend on it, or it is a
                retake or overdue and at least one later course waits for it"""
    need = summary.get("terms_needed")
    next_no = (summary.get("terms_done") or 0) + 2  # the plan's term number for next term
    for c in courses:
        s = statuses[c["key"]]
        is_open = s["status"] in ("available", "retake")
        p = _plan_position(c["group"])
        s["overdue"] = bool(is_open and p and p < next_no)
        s["critical"] = bool(is_open and need and s["depth"] >= 2 and s["depth"] >= need)
        s["bottleneck"] = bool(is_open and c["group"] not in ELECTIVE_GROUPS and (
            s["critical"] or s["depth"] >= 3 or s["blocks"] >= 3
            or (s["blocks"] and (s["status"] == "retake" or s["overdue"]))))


# ── Terms: "Fall 2025-26" <-> a number, so terms can be counted and added ──
def term_index(term: str | None) -> int | None:
    """Fall Y = 2Y, Spring Y = 2Y+1. A summer term counts with the spring before it."""
    m = re.match(r"\s*(Fall|Spring|Summer)\s+(\d{4})", term or "", re.I)
    if not m:
        return None
    return int(m.group(2)) * 2 + (0 if m.group(1).lower() == "fall" else 1)


def term_name(index: int) -> str:
    year, season = divmod(index, 2)
    return f"{'Fall' if season == 0 else 'Spring'} {year}-{str(year + 1)[-2:]}"


def _plan_position(group: str) -> float | None:
    """Which regular term of the plan a course group belongs to (1 = first fall).
    Summer courses count as done by the end of that year's spring."""
    m = re.match(r"Year (\d+) · (\w+)", group)
    if m:
        season = m.group(2).lower()
        return (int(m.group(1)) - 1) * 2 + (1 if season == "fall" else 2)
    m = re.match(r"Semester (\d+)", group)
    return int(m.group(1)) if m else None


def progress_summary(snap: dict, plan: dict, courses: list[dict], statuses: dict) -> dict:
    """'Where you stand': credits, CGPA, on track or behind the plan, estimated graduation."""
    level = snap["level"]
    cgpa, _ = gpa(snap["transcript"])
    credits_passed = sum(e["credits"] for e in snap["transcript"] if passed(e, level))
    credits_now = sum(r.get("credits") or 0 for r in snap["registered"])
    # Some plan files do not state the total: add up the plan's own courses instead
    total = plan.get("total_credit_hours")
    total_is_sum = False
    if not total:
        total = sum(c["credits"] for c in courses if c["group"] not in ELECTIVE_GROUPS) or None
        total_is_sum = total is not None
    start, now = term_index(snap["start_term"]), term_index(snap["current_term"])
    terms_done = max(0, now - start) if start is not None and now is not None else None

    # Where the official plan expects a full-time student to be by now
    expected = None
    if terms_done is not None and any(_plan_position(c["group"]) for c in courses):
        expected = sum(c["credits"] for c in courses
                       if (p := _plan_position(c["group"])) is not None and p <= terms_done)

    pace = round(credits_passed / terms_done, 1) if terms_done else None
    if snap["study_mode"] == "part-time":
        track_state = "part_time"  # the plan's term layout assumes full-time study
    elif expected is None or not terms_done:
        track_state = "unknown"
    elif credits_passed - expected >= 6:
        track_state = "ahead"
    elif credits_passed - expected >= -3:
        track_state = "on_track"
    else:
        track_state = "behind"

    # Estimated graduation at the student's own pace, assuming this term's courses are passed.
    # A chain of prerequisites can need more terms than the credits alone (one course a term).
    chain_terms = max((statuses[c["key"]].get("depth", 0) for c in courses
                       if c["group"] not in ELECTIVE_GROUPS), default=0)
    graduation, terms_needed, limit = None, None, None
    if total and now is not None:
        left = total - credits_passed - credits_now
        if left <= 0:
            graduation, terms_needed = snap["current_term"], 0
        elif pace:
            by_credits = math.ceil(left / pace)
            terms_needed = max(by_credits, chain_terms)
            limit = "chain" if chain_terms > by_credits else "credits"
            graduation = term_name(now + terms_needed)

    counts = {}
    for s in statuses.values():
        counts[s["status"]] = counts.get(s["status"], 0) + 1
    return {
        "level": level, "study_mode": snap["study_mode"],
        "current_term": snap["current_term"], "start_term": snap["start_term"],
        "terms_done": terms_done,
        "cgpa": cgpa, "standing": standing(snap),
        "probation": cgpa is not None and level == "masters" and cgpa < 3.0,
        "credits_passed": credits_passed, "credits_in_progress": credits_now,
        "total_credit_hours": total, "total_is_sum": total_is_sum,
        "expected_credits": expected, "track_state": track_state,
        "gap_credits": credits_passed - expected if expected is not None else None,
        "pace": pace, "estimated_graduation": graduation,
        "terms_needed": terms_needed, "chain_terms": chain_terms, "graduation_limited_by": limit,
        "counts": counts,
    }


def _typical_load(courses: list[dict]) -> int | None:
    """The credit hours the plan puts in a regular term (median over its terms)."""
    per_term = {}
    for c in courses:
        p = _plan_position(c["group"])
        if p and "summer" not in c["group"].lower():
            per_term[p] = per_term.get(p, 0) + (c["credits"] or 0)
    loads = sorted(per_term.values())
    return loads[len(loads) // 2] if loads else None


def next_term_plan(snap: dict, courses: list[dict], statuses: dict, summary: dict) -> dict | None:
    """A suggested registration for next term, assuming this term's courses are passed.
    Every course that will be open is a candidate; the suggestion fills the usual load in
    this order: retakes, critical courses, then the earliest in the plan (minus chain length,
    so long chains start sooner), then the ones that unlock the most."""
    now = term_index(snap["current_term"])
    if now is None:
        return None
    nxt = term_name(now + 1)
    proj = {**snap, "registered": [], "current_term": nxt,
            "transcript": snap["transcript"] + [{**r, "grade": "P", "term": snap["current_term"]}
                                                for r in snap["registered"]]}
    st = course_statuses(proj, courses)
    add_chains(courses, st)
    mark_bottlenecks(courses, st, summary)

    by_key = {c["key"]: c for c in courses}
    # One candidate per course code; open elective slots of the same kind count as one
    # candidate ("Specialized Elective", 4 still open)
    seen, cands, slots_open = set(), [], {}
    for c in courses:
        s = st[c["key"]]
        if c["group"] in ELECTIVE_GROUPS or s["status"] not in ("available", "retake"):
            continue
        sig = ("slot", slot_kind(c["title"])) if _is_slot(c) else c["code"]
        if _is_slot(c):
            slots_open[slot_kind(c["title"])] = slots_open.get(slot_kind(c["title"]), 0) + 1
        if sig in seen:
            continue
        seen.add(sig)
        cands.append(c)
    cand_keys = {c["key"] for c in cands}

    # Load: part-time = this term's load; full-time = the plan's usual term
    if snap["study_mode"] == "part-time":
        target, source = summary["credits_in_progress"] or 6, "current"
    else:
        target, source = _typical_load(courses), "plan"
        if not target:
            target, source = summary["credits_in_progress"] or 15, "current"

    pos_next = (summary["terms_done"] or 0) + 2  # the plan's term number for next term

    def reasons(c):
        s, out = st[c["key"]], []
        if s["status"] == "retake":
            last = s["attempts"][-1]
            out.append(f"Retake: {last['grade']} in {last['term']}")
        if s["critical"]:
            out.append("Starts your longest prerequisite chain: leaving it for later delays graduation")
        elif s["blocks"]:
            n = s["blocks"]
            out.append(f"{n} later required course{'s depend' if n != 1 else ' depends'} on it")
        p = _plan_position(c["group"])
        if p and p < pos_next:
            out.append(f"Behind plan: planned for {c['group']}")
        elif p == pos_next:
            out.append(f"Next in your plan ({c['group']})")
        if _is_slot(c):
            n = slots_open[slot_kind(c["title"])]
            out.append(f"{n} of these still open in your plan" if n > 1 else "Last one open in your plan")
        return out

    def rank(c):
        s, p = st[c["key"]], _plan_position(c["group"]) or 99
        return (s["status"] != "retake", not s["critical"], p - s["depth"], -s["blocks"], p)

    chosen, total = [], 0
    for c in sorted(cands, key=rank):
        if c["key"] in chosen:
            continue
        group = [c["key"]]
        for opts in st[c["key"]]["with_options"]:  # courses that must come together
            if not any(o in chosen or o in group for o in opts):
                partner = next((o for o in opts if o in cand_keys), None)
                if partner:
                    group.append(partner)
        group = [k for k in group if k not in chosen]
        cr = sum(by_key[k]["credits"] or 0 for k in group)
        if target and total + cr <= target:
            chosen += group
            total += cr

    return {
        "term": nxt, "target_credits": target, "target_source": source,
        "assumes_passing": [f"{r['code']} {r.get('title') or ''}".strip() for r in snap["registered"]],
        "suggested_credits": total,
        "candidates": [{
            "key": c["key"], "code": c.get("code"),
            "title": slot_kind(c["title"]) if _is_slot(c) else c["title"], "credits": c["credits"],
            "group": c["group"], "status": st[c["key"]]["status"], "slot": _is_slot(c),
            "open_slots": slots_open.get(slot_kind(c["title"]), 0) if _is_slot(c) else None,
            "suggested": c["key"] in chosen, "reasons": reasons(c),
            "with_options": st[c["key"]]["with_options"], "with_courses": st[c["key"]]["with_courses"],
            "notes": st[c["key"]]["notes"], "critical": st[c["key"]]["critical"],
        } for c in sorted(cands, key=rank)],
    }


def plan_view(snap: dict, plan: dict) -> dict:
    """Everything the Study Plan panel and the chatbot need, worked out once."""
    courses = plan_courses(snap, plan)
    statuses = course_statuses(snap, courses)
    add_chains(courses, statuses)
    summary = progress_summary(snap, plan, courses, statuses)
    mark_bottlenecks(courses, statuses, summary)
    return {"courses": courses, "statuses": statuses, "summary": summary,
            "next_term": next_term_plan(snap, courses, statuses, summary)}


def plan_status(snap: dict) -> dict:
    """Compare the record with the official study plan: done / registered / can take / locked."""
    from backend.services.study_plan_service import load_plans
    plan = load_plans().get(snap["plan_id"])
    if not plan:
        return {"error": f"Study plan {snap['plan_id']} not found"}
    view = plan_view(snap, plan)
    courses, st, summary, nxt = view["courses"], view["statuses"], view["summary"], view["next_term"]
    elective_list = [c for c in courses if c["group"] in ELECTIVE_GROUPS]
    main = [c for c in courses if c not in elective_list]

    out = {"plan": f"{plan['name']} (catalog {plan['catalog_year']})",
           "total_credit_hours": plan.get("total_credit_hours") or sum(c["credits"] for c in main) or None,
           "has_prerequisite_data": plan.get("has_prerequisites", True),
           "credit_hours_passed": sum(e["credits"] for e in snap["transcript"] if passed(e, snap["level"])),
           "done": [], "registered_now": [], "must_retake": [], "can_take": [], "locked": []}
    seen = set()
    for c in main:
        if _is_slot(c) or c["code"] in seen:
            continue
        seen.add(c["code"])
        s, label = st[c["key"]], f"{c['code']} {c['title']}"
        extra = []
        if s["with_courses"]:
            extra.append(f"take before or together with {'; '.join(s['with_courses'])}")
        # conditions without a course code cannot be checked here: pass them on
        if s["notes"]:
            extra.append(f"also requires: {'; '.join(s['notes'])}")
        if s["status"] == "done":
            out["done"].append(label)
        elif s["status"] == "progress":
            out["registered_now"].append(label + (" (retake)" if s.get("retake") else ""))
        elif s["status"] == "retake":
            last = s["attempts"][-1]
            out["must_retake"].append(f"{label} (failed: {last['grade']} in {last['term']})")
        elif s["status"] == "locked":
            out["locked"].append(f"{label} (needs {', '.join(s['needs'])} first)")
        else:
            out["can_take"].append(label + (f" ({'; '.join(extra)})" if extra else ""))

    slots = [c for c in main if _is_slot(c)]
    out["elective_slots_in_plan"] = len(slots)
    out["elective_slots_still_open"] = sum(1 for c in slots if st[c["key"]]["status"] not in ("done", "progress"))
    choices = []
    for c in elective_list:
        s = st[c["key"]]
        if not c.get("code") or s["status"] in ("done", "progress"):
            continue
        choices.append(f"{c['code']} {c['title']}" + (f" (needs {', '.join(s['needs'])} first)" if s["needs"] else ""))
    out["elective_choices"] = choices

    # Courses that hold others back, and a suggested registration for next term
    # (the same suggestion the Study Plan panel shows)
    out["bottlenecks"] = []
    for c in main:
        s = st[c["key"]]
        if not s.get("bottleneck") or _is_slot(c):
            continue
        why = [f"{s['blocks']} later required course(s) wait for it",f"starts a chain of {s['depth']} term(s)"]
        if s["status"] == "retake":
            why.append("failed, must be retaken")
        if s["overdue"]:
            why.append(f"behind plan (planned for {c['group']})")
        if s["critical"]:
            why.append("leaving it for later delays graduation")
        out["bottlenecks"].append(f"{c['code']} {c['title']}: {', '.join(why)}")
    out["estimated_graduation"] = summary["estimated_graduation"]
    out["graduation_limited_by"] = summary["graduation_limited_by"]
    if nxt:
        out["suggested_next_term"] = {
            "term": nxt["term"],
            "assumes_passing_this_term": nxt["assumes_passing"],
            "credit_load": f"{nxt['suggested_credits']} of a usual {nxt['target_credits']} credit hours",
            "courses": [f"{(x['code'] + ' ') if not x['slot'] else ''}{x['title']} ({x['credits']} cr)"
                        + (f": {'; '.join(x['reasons'])}" if x["reasons"] else "")
                        for x in nxt["candidates"] if x["suggested"]],
            "also_open": [f"{(x['code'] + ' ') if not x['slot'] else ''}{x['title']}"
                          for x in nxt["candidates"] if not x["suggested"]],
        }
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
