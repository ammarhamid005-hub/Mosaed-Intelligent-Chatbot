"""
Study plans for the Study Plan Progress feature.

Reads the extracted study-plan JSON files in data/study-plans/**/extracted/
(the same files the chatbot indexes) and turns each course's prerequisite text
into structured requirements:

    "(1501263 or 1501567 or equiv.) And 1440281."
        -> [{"codes": ["1501263", "1501567"], "text": "...", "coreq": False},
            {"codes": ["1440281"], "text": "1440281", "coreq": False}]

Each item is one condition that must be met; any one of its codes is enough.
An item with no codes is a note (e.g. "Graduate Standing", "90 credit hours").
"""
import csv
import glob
import json
import os
import re
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PLANS_DIR = os.path.join(ROOT, "data", "study-plans")

_CODE = re.compile(r"\b\d{7}\b")
_COREQ = re.compile(r"\bco\b|\bcor\.?\b|p/co|pre/co|co-?req", re.I)
_COLLEGES = {"cci": "College of Computing and Informatics", "sci": "College of Sciences"}


def _split_top_level(text: str) -> list[str]:
    """Split on and / & / + that are not inside parentheses."""
    parts, depth, start = [], 0, 0
    for m in re.finditer(r"[()]|\s+and\s+|\s*&\s*|\s*\+\s*", text, re.I):
        tok = m.group(0)
        if tok == "(":
            depth += 1
        elif tok == ")":
            depth = max(depth - 1, 0)
        elif depth == 0:
            parts.append(text[start:m.start()])
            start = m.end()
    parts.append(text[start:])
    return [p.strip(" .;,()") for p in parts if p.strip(" .;,()")]


def parse_prerequisites(items) -> list[dict]:
    out = []
    for item in items or []:
        item = str(item).strip()
        if not item:
            continue
        coreq = bool(_COREQ.search(item))
        # "(A + B) or equiv." is one condition; otherwise split the AND parts
        parts = [item] if re.search(r"\)\s*or\b", item, re.I) else _split_top_level(item)
        for part in parts:
            codes = list(dict.fromkeys(_CODE.findall(part)))
            out.append({"codes": codes, "text": part, "coreq": coreq})
    return out


def _plan_id(path: str) -> str:
    # data/study-plans/cci/masters/msc-data-science/extracted/<file>.json -> cci-msc-data-science
    parts = os.path.relpath(path, PLANS_DIR).replace("\\", "/").split("/")
    return f"{parts[0]}-{parts[2]}"


def _credit_hours_index() -> dict:
    path = os.path.join(PLANS_DIR, "_meta", "programs_index.csv")
    out = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("credit_hours"):
                    out[f"{row['college']}-{row['program_slug']}"] = int(float(row["credit_hours"]))
    return out


def _group(c: dict) -> str:
    if c.get("type") == "thesis":
        return "Thesis"
    if c.get("year") and c.get("semester"):
        return f"Year {c['year']} · {str(c['semester']).title()}"
    if c.get("term"):
        return f"Semester {c['term']}"
    if c.get("type") == "elective":
        return "Elective courses"
    if c.get("type") == "university":
        return "University requirements"
    return "Other courses"


@lru_cache(maxsize=1)
def load_plans() -> dict:
    credit_index = _credit_hours_index()
    plans = {}
    for path in sorted(glob.glob(os.path.join(PLANS_DIR, "**", "extracted", "*.json"), recursive=True)):
        if "_archive" in path:
            continue
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        pid = _plan_id(path)
        level = data.get("level") or ""
        degree = "MSc" if level.startswith("master") else "BSc"
        courses, used_keys = [], set()
        for i, c in enumerate(data.get("courses") or []):
            key = c.get("code") or f"slot-{i}"
            if key in used_keys:  # same code listed twice (e.g. thesis 3 + 6 credits)
                key = f"{key}-{i}"
            used_keys.add(key)
            courses.append({
                "key": key,
                "code": c.get("code"),
                "title": c.get("title") or "Course",
                "credits": c.get("credits") or 0,
                "type": c.get("type") or "",
                "track": c.get("track"),
                "group": _group(c),
                "prerequisites": parse_prerequisites(c.get("prerequisites")),
            })
        plans[pid] = {
            "id": pid,
            "name": f"{degree} in {re.sub(r'^Science in ', '', data.get('program') or pid)}",
            "level": "masters" if degree == "MSc" else "bachelors",
            "college": _COLLEGES.get(data.get("college"), data.get("college")),
            "catalog_year": data.get("catalog_year"),
            "total_credit_hours": data.get("total_credit_hours") or credit_index.get(pid),
            "tracks": sorted({c["track"] for c in courses if c["track"]}),
            "has_prerequisites": any(c["prerequisites"] for c in courses),
            "courses": courses,
            "notes": data.get("notes") or [],
        }
    return plans
