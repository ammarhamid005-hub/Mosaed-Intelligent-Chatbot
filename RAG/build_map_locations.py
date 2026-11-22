"""
Builds data/campus/uos_campus_map_locations.md from the campus map's data
(frontend/public/campus-map/data.json and A9-office-directory.json), so the chatbot can
answer "where is ..." questions with the same building codes and room numbers the map uses.

    python -m RAG.build_map_locations
    python -m RAG.populate_database        # adds the new document to the vector database

Run it again whenever the map data changes. One section per building / A9 room keeps each
answer's source chunk small (populate_database splits on Markdown headings).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "frontend" / "public" / "campus-map"
OUT = ROOT / "data" / "campus" / "uos_campus_map_locations.md"
LEVELS = {0: "Ground floor", 1: "Level 1 (first floor)", 2: "Level 2 (second floor)"}
SHORT = {0: "Ground floor", 1: "Level 1", 2: "Level 2"}
DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def _time(e: dict) -> str:
    if e.get("from") and e.get("to"):
        return f"{e['from']}–{e['to']}"
    w = e.get("postedWindow") or {}
    return f"within {w['from']}–{w['to']}" if w.get("from") else "time not given"


def _office_hours(schedule: dict) -> str:
    hours = sorted(schedule.get("officeHours") or [], key=lambda e: (DAYS.index(e["day"]) if e["day"] in DAYS else 9, e.get("from") or ""))
    parts = []
    for e in hours:
        where = f" ({e['location']})" if e.get("location") else ""
        parts.append(f"{e['day']} {_time(e)}{where}")
    return "; ".join(parts)


def _teaching(schedule: dict) -> str:
    """Courses / classes on the posted timetable (title and place), without repeats."""
    skip = ("office hour", "meeting", "busy", "research", "prayer", "lunch", "admin", "supervision", "appointments", "committee")
    seen = []
    for e in schedule.get("activities") or []:
        title = (e.get("title") or "").strip()
        if not title or any(s in title.lower() for s in skip):
            continue
        item = title + (f" in {e['location']}" if e.get("location") else "")
        if item not in seen:
            seen.append(item)
    return "; ".join(seen)


def _person_lines(p: dict) -> list[str]:
    name = p.get("name") or "Occupant (name not posted)"
    if p.get("nameArabic"):
        name += f" ({p['nameArabic']})"
    lines = [f"- Occupant: {name}"]
    if p.get("role"):
        lines.append(f"- Title: {p['role']}")
    if p.get("department"):
        lines.append(f"- Department: {p['department']}")
    if p.get("email"):
        lines.append(f"- Email: {p['email']}")
    if p.get("extension"):
        lines.append(f"- Phone extension: {p['extension']}")
    if p.get("alternateOffices"):
        lines.append(f"- Also has an office in: {', '.join(p['alternateOffices'])}")
    s = p.get("schedule")
    if s:
        period = " ".join(x for x in (s.get("term"), s.get("academicYear")) if x) or "current notice"
        oh = _office_hours(s)
        lines.append(f"- Office hours ({period}, as posted on the office door): {oh or 'none listed'}")
        teach = _teaching(s)
        if teach:
            lines.append(f"- Teaching ({period}): {teach}")
    return lines


def build() -> str:
    data = json.loads((MAP / "data.json").read_text(encoding="utf-8"))
    directory = json.loads((MAP / "A9-office-directory.json").read_text(encoding="utf-8"))
    b_by_id = {b["id"]: b for b in data["buildings"]}

    out = ["# University of Sharjah – Campus Map Locations (Zone A)", "",
           "Building codes and rooms from Mosaed's 3D campus map of Zone A. "
           "Rooms and occupants in building A9 come from the door signs photographed in Fall 2026/2027.", ""]

    out += ["## Buildings in Zone A", ""]
    for b in data["buildings"]:
        floors = f" ({len(b['levels'])} floors: {', '.join(b['levels'])})" if b.get("levels") else ""
        out.append(f"- {b['id']}: {b['name']}{floors}")
    out.append("")

    # Short summary of who is where in A9, so "where is the dean / chair / student assistance" finds one chunk
    a9 = b_by_id["A9"]
    rooms = directory["rooms"]
    key = []
    for num, r in sorted(rooms.items()):
        for p in r.get("people") or []:
            role = p.get("role") or ""
            if any(w in role for w in ("Dean", "Chair", "Director", "Coordinator", "Student assistance")):
                key.append(f"- {role}: {p.get('name') or '—'}, room {num} ({SHORT.get(r['level'], '')})")
    out += [f"## Building A9 – {a9['name']}", "",
            "- Floors: Ground floor, Level 1, Level 2 (lift and main staircase by the lobby)",
            "- College of Computing and Informatics (CCI) offices are on Level 1 and Level 2.", ""]
    out += ["## A9 key offices – Dean, Vice Dean, Assistant Dean, department chairs, student assistance", ""] + key + [""]

    facilities = []
    for num, r in sorted(rooms.items()):
        if r.get("roomType") and r["roomType"] != "Office":
            facilities.append(f"- {r.get('roomName') or r['roomType']}: room {num} ({SHORT.get(r['level'], '')})")
    out += ["## A9 facilities – prayer rooms, washrooms, labs, meeting rooms", ""] + facilities + [""]

    for num, r in sorted(rooms.items()):
        people = [p for p in r.get("people") or [] if p.get("name") or p.get("schedule")]
        if r.get("roomType") not in (None, "Office", "Office Suite") and not people:
            continue  # already listed under facilities
        title = r.get("roomName") or (people[0].get("name") if people and people[0].get("name") else None) or "Office"
        out += [f"## A9 room {num} – {title}", "",
                f"- Building: A9 ({a9['name']})",
                f"- Room: {num}, {LEVELS.get(r['level'], 'level ' + str(r['level']))}"]
        if r.get("roomType"):
            out.append(f"- Room type: {r['roomType']}")
        for p in people:
            out += _person_lines(p)
        if not people:
            out.append("- Occupant: not recorded yet")
        out.append("")

    a11 = b_by_id.get("A11")
    if a11:
        out += [f"## Building A11 – {a11['name']}", "",
                "- Floors: Ground floor, Level 1, Level 2; rooms are on the campus map (room numbers like L1-02), "
                "occupants are not recorded yet.", ""]
    return "\n".join(out)


if __name__ == "__main__":
    text = build()
    OUT.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({text.count('## ')} sections, {len(text):,} characters)")
