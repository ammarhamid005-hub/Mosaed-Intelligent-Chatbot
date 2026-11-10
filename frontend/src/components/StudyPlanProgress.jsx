import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "../services/api";
import StudyPlanMap from "./StudyPlanMap";
import styles from "./StudyPlanProgress.module.css";

// Study Plan Progress: the student picks a study plan and ticks the courses they have
// completed; the panel shows what is left and which courses they can take now, using
// the prerequisites in the official study plans. Progress is saved per user.

const ChecklistIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const FILTERS = [
  { id: "all", label: "All" },
  { id: "available", label: "Can take now" },
  { id: "locked", label: "Locked" },
  { id: "done", label: "Done" },
];

const courseName = (c) => (c.code ? `${c.code} ${c.title}` : c.title);

// Works out each course's status from the ticked courses and the prerequisites.
function courseStatuses(courses, done) {
  const byCode = new Map(courses.filter((c) => c.code).map((c) => [c.code, c]));
  const out = new Map();
  for (const c of courses) {
    if (done.has(c.key)) {
      out.set(c.key, { status: "done", needs: [], withCourses: [], notes: [] });
      continue;
    }
    const needs = [], withCourses = [], notes = [];
    for (const cond of c.prerequisites || []) {
      const inPlan = cond.codes.filter((code) => byCode.has(code));
      if (cond.codes.length === 0) { notes.push(cond.text); continue; }
      if (inPlan.length === 0) { notes.push(`${cond.text} (earlier study)`); continue; }
      if (inPlan.some((code) => done.has(code) || [...done].some((k) => k.startsWith(code + "-")))) continue;
      const names = inPlan.map((code) => courseName(byCode.get(code))).join(" or ");
      if (cond.coreq) withCourses.push(names);
      else needs.push(names);
    }
    out.set(c.key, { status: needs.length ? "locked" : "available", needs, withCourses, notes });
  }
  return out;
}

export default function StudyPlanProgress({ onAsk, disabled }) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [plan, setPlan] = useState(null);
  const [track, setTrack] = useState("");
  const [done, setDone] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("map");
  const [saveState, setSaveState] = useState("");
  const [error, setError] = useState("");
  const loaded = useRef(false);
  const saveTimer = useRef(null);

  // First open: load the plan list and the last plan the user worked on.
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    Promise.all([api.getStudyPlans(), api.getLastStudyProgress()])
      .then(([list, last]) => {
        setPlans(list);
        if (last?.plan_id) setPlanId(last.plan_id);
      })
      .catch(() => setError("Could not load the study plans."));
  }, [open]);

  // Load the chosen plan and the user's saved progress for it.
  useEffect(() => {
    if (!planId) { setPlan(null); return; }
    setError("");
    Promise.all([api.getStudyPlan(planId), api.getStudyProgress(planId)])
      .then(([p, prog]) => {
        setPlan(p);
        setDone(new Set(prog.completed || []));
        setTrack(prog.track || p.tracks[0] || "");
        setSaveState("");
      })
      .catch(() => setError("Could not load this study plan."));
  }, [planId]);

  useEffect(() => {
    function onEsc(e) { if (e.key === "Escape") setOpen(false); }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  const save = (nextDone, nextTrack) => {
    clearTimeout(saveTimer.current);
    setSaveState("Saving…");
    saveTimer.current = setTimeout(() => {
      api.saveStudyProgress(planId, [...nextDone], nextTrack || null)
        .then(() => setSaveState("Saved"))
        .catch(() => setSaveState("Not saved — check your connection"));
    }, 500);
  };

  const toggle = (key) => {
    const next = new Set(done);
    next.has(key) ? next.delete(key) : next.add(key);
    setDone(next);
    save(next, track);
  };

  const changeTrack = (t) => {
    setTrack(t);
    save(done, t);
  };

  const courses = useMemo(
    () => (plan ? plan.courses.filter((c) => !c.track || c.track === track) : []),
    [plan, track],
  );
  const statuses = useMemo(() => courseStatuses(courses, done), [courses, done]);

  const counts = { done: 0, available: 0, locked: 0 };
  let creditsDone = 0;
  for (const c of courses) {
    const s = statuses.get(c.key).status;
    counts[s] += 1;
    if (s === "done") creditsDone += c.credits || 0;
  }
  const total = plan?.total_credit_hours;
  const groups = [];
  for (const c of courses) {
    if (filter !== "all" && statuses.get(c.key).status !== filter) continue;
    let g = groups.find((x) => x.name === c.group);
    if (!g) { g = { name: c.group, items: [] }; groups.push(g); }
    g.items.push(c);
  }

  const askNext = () => {
    if (!onAsk || disabled || !plan) return;
    const finished = courses.filter((c) => done.has(c.key) && c.code).map((c) => `${c.code} ${c.title}`);
    const q = finished.length
      ? `I am a student in the ${plan.name} (catalog ${plan.catalog_year}). I have completed: ${finished.join(", ")}. Which courses can I take next?`
      : `I am starting the ${plan.name} (catalog ${plan.catalog_year}). Which courses should I take first?`;
    setOpen(false);
    onAsk(q);
  };

  const masters = plans.filter((p) => p.level === "masters");
  const bachelors = plans.filter((p) => p.level !== "masters");

  return (
    <>
      <button
        className={`${styles.trigger} ${open ? styles.triggerActive : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Study Plan Progress"
        aria-label="Open study plan progress"
        aria-expanded={open}
      >
        <ChecklistIcon />
      </button>

      {/* Rendered into <body>: the header's blur effect would otherwise trap and clip this full-screen drawer */}
      {open && createPortal(
        <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside className={`${styles.drawer} ${plan && view === "map" ? styles.drawerWide : ""}`} role="dialog" aria-label="Study Plan Progress">
            <div className={styles.head}>
              <div>
                <p className={styles.title}>Study Plan Progress</p>
                <p className={styles.sub}>Tick the courses you have completed</p>
              </div>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>

            <div className={styles.controls}>
              <select className={styles.select} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Choose your program…</option>
                <optgroup label="Master's">
                  {masters.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.catalog_year})</option>)}
                </optgroup>
                <optgroup label="Bachelor's">
                  {bachelors.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.catalog_year})</option>)}
                </optgroup>
              </select>
              {plan && plan.tracks.length > 0 && (
                <select className={styles.select} value={track} onChange={(e) => changeTrack(e.target.value)}>
                  {plan.tracks.map((t) => <option key={t} value={t}>{t.replace(/-/g, " ")}</option>)}
                </select>
              )}
            </div>

            {error && <p className={styles.error}>{error}</p>}

            {plan && (
              <>
                <div className={styles.summary}>
                  <div className={styles.summaryTop}>
                    <span><b>{creditsDone}</b>{total ? ` of ${total}` : ""} credit hours completed</span>
                    <span className={styles.saveState}>{saveState}</span>
                  </div>
                  {total ? (
                    <div className={styles.bar}><span style={{ width: `${Math.min(100, (creditsDone / total) * 100)}%` }} /></div>
                  ) : null}
                  <p className={styles.counts}>
                    {counts.done} done · {counts.available} can take now · {counts.locked} locked
                  </p>
                  {!plan.has_prerequisites && (
                    <p className={styles.warn}>
                      This study plan file has no prerequisite data, so every remaining course is shown as available.
                      Check prerequisites with your advisor.
                    </p>
                  )}
                </div>

                <div className={styles.viewSwitch} role="tablist" aria-label="View">
                  {[["map", "Plan map"], ["list", "List"]].map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={view === id}
                      className={`${styles.viewBtn} ${view === id ? styles.viewBtnActive : ""}`}
                      onClick={() => setView(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {view === "map" ? (
                  <StudyPlanMap courses={courses} statuses={statuses} done={done} onToggle={toggle} />
                ) : (
                <>
                <div className={styles.filters} role="tablist">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      role="tab"
                      aria-selected={filter === f.id}
                      className={`${styles.filter} ${filter === f.id ? styles.filterActive : ""}`}
                      onClick={() => setFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className={styles.list}>
                  {groups.length === 0 && <p className={styles.empty}>No courses here.</p>}
                  {groups.map((g) => (
                    <section key={g.name}>
                      <h4 className={styles.groupName}>{g.name}</h4>
                      {g.items.map((c) => {
                        const st = statuses.get(c.key);
                        return (
                          <label key={c.key} className={`${styles.course} ${styles[st.status]}`}>
                            <input type="checkbox" checked={done.has(c.key)} onChange={() => toggle(c.key)} />
                            <span className={styles.courseText}>
                              <span className={styles.courseName}>
                                {c.code && <span className={styles.code}>{c.code}</span>} {c.title}
                              </span>
                              {st.needs.length > 0 && <span className={styles.detail}>Needs: {st.needs.join("; ")}</span>}
                              {st.withCourses.length > 0 && <span className={styles.detail}>Before or together with: {st.withCourses.join("; ")}</span>}
                              {st.status !== "done" && st.notes.length > 0 && <span className={styles.detailQuiet}>Also: {st.notes.join("; ")}</span>}
                            </span>
                            <span className={styles.right}>
                              <span className={styles.credits}>{c.credits} cr</span>
                              <span className={`${styles.pill} ${styles["pill_" + st.status]}`}>
                                {st.status === "done" ? "Done" : st.status === "available" ? "Can take" : "Locked"}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </section>
                  ))}
                </div>
                </>
                )}

                <div className={styles.foot}>
                  {onAsk && (
                    <button className={styles.askBtn} onClick={askNext} disabled={disabled}>
                      Ask Mosaed what to take next
                    </button>
                  )}
                  <p className={styles.note}>
                    Based on the official study plan ({plan.catalog_year}). Your progress is saved to your account; confirm with your academic advisor before registering.
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
