"""
Thesis Roadmap steps (Master's, thesis track) and the student's progress on them.

The step ids must match the ids in frontend/src/components/ThesisRoadmap.jsx.
The text is a short version of the Roadmap for Master's students (updated 8 Jan 2026)
and the Master's Executive Regulations; the panel in the app shows the full version.
"""
PLAN_ID = "thesis-roadmap"  # row key in the study_progress table

STEPS = [
    ("courses", "Register your courses (first semester)"),
    ("proposal", "Register the thesis proposal (second semester; department submits form G12A)"),
    ("credits", "3 thesis credit hours registered after G12A is approved"),
    ("remaining", "Register the remaining 6 thesis credit hours, then re-register the thesis for zero credits every semester until the defense"),
    ("paper", "Publish a peer-reviewed paper as primary author with the supervisor as co-author (supervisor submits form G21)"),
    ("portfolio", "Complete the scientific portfolio (IDs U221 or later) and register an ORCID iD"),
    ("defense", "Defend the thesis, at least one semester after proposal approval (department submits G16A at least 3 weeks before)"),
    ("decision", "Defense decision within 48 hours (G17A pass with minor revisions, G17B No-Pass, G17C after No-Pass comments are addressed)"),
    ("graduate", "Graduate after the examiners' comments are addressed (department submits G23A)"),
]
STEP_IDS = [s for s, _ in STEPS]


def progress_context(completed: list[str]) -> str:
    """Plain-text summary of the student's roadmap progress, for the answer model."""
    done = [i for i, (sid, _) in enumerate(STEPS) if sid in set(completed)]
    todo = [i for i in range(len(STEPS)) if i not in done]
    fmt = lambda i: f"Step {i + 1}: {STEPS[i][1]}"
    lines = ["The student tracks their progress in Mosaed's Thesis Roadmap (9 steps)."]
    lines.append("Completed: " + ("; ".join(fmt(i) for i in done) if done else "none of the steps yet") + ".")
    if todo:
        lines.append("Current step: " + fmt(todo[0]) + ".")
        if len(todo) > 1:
            lines.append("After that: " + "; ".join(fmt(i) for i in todo[1:]) + ".")
    else:
        lines.append("All 9 steps are marked as completed.")
    return "\n".join(lines)


def search_hint(completed: list[str]) -> str:
    """Words added to the search for 'my next step' questions, so the right rules are retrieved."""
    todo = [t for sid, t in STEPS if sid not in set(completed)]
    return " ".join(todo[:2]) if todo else STEPS[-1][1]
