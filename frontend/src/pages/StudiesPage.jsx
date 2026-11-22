import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { api } from "../services/api";
import StudyPlanMap from "../components/StudyPlanMap";
import PlanList, { manualStatuses } from "../components/PlanList";
import CourseCard from "../components/CourseCard";
import NextTermPlanner from "../components/NextTermPlanner";
import StudiesOverview from "../components/StudiesOverview";
import StudiesTranscript from "../components/StudiesTranscript";
import { courseLabel } from "../components/planText";
import { IconChat } from "../components/icons";
import styles from "./StudiesPage.module.css";

// "My degree": the student record and the study plan on one page (it replaces the chat
// area; the sidebar stays). Students with a (simulated) record get four tabs, all filled
// in from the record by the backend (student_records.plan_view, the same code the chatbot
// uses): Overview, Study plan (map or list), Next term (planner) and Transcript.
// Accounts without a record: pick a program and tick the completed courses (saved per user).

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Study plan" },
  { id: "next", label: "Next term" },
  { id: "transcript", label: "Transcript" },
];

const RECORD_FILTERS = [
  { id: "all", label: "All" },
  { id: "available", label: "Can take now" },
  { id: "progress", label: "This term" },
  { id: "retake", label: "Retake" },
  { id: "locked", label: "Locked" },
  { id: "done", label: "Passed" },
];

const MANUAL_FILTERS = [
  { id: "all", label: "All" },
  { id: "available", label: "Can take now" },
  { id: "locked", label: "Locked" },
  { id: "done", label: "Done" },
];

// Small per-browser conveniences: the last tab, and the student's own next-term picks
const TAB_KEY = "mosaed.degree.tab";
const PICKS_KEY = (term) => `mosaed.nextTerm.${term}`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } },
};
function loadPicks(next) {
  const keys = new Set(next.candidates.map((c) => c.key));
  try {
    const saved = JSON.parse(store.get(PICKS_KEY(next.term)) || "null");
    if (Array.isArray(saved)) return new Set(saved.filter((k) => keys.has(k)));
  } catch { /* use the suggestion */ }
  return new Set(next.candidates.filter((c) => c.suggested).map((c) => c.key));
}

export default function StudiesPage({ onAsk, busy, onClose }) {
  const [mode, setMode] = useState(null); // null while loading, then "record" or "manual"
  const [record, setRecord] = useState(null);
  const [mine, setMine] = useState(null); // { plan, statuses, summary, next_term }
  const [tab, setTab] = useState(() => {
    const t = store.get(TAB_KEY);
    return TABS.some((x) => x.id === t) ? t : "overview";
  });
  const [planView, setPlanView] = useState("map");
  const [filter, setFilter] = useState("all");
  const [cardKey, setCardKey] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [entering, setEntering] = useState(true);
  const bodyRef = useRef(null);
  // manual mode
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [plan, setPlan] = useState(null);
  const [track, setTrack] = useState("");
  const [done, setDone] = useState(new Set());
  const [saveState, setSaveState] = useState("");
  const [error, setError] = useState("");
  const saveTimer = useRef(null);

  // Every visit reads the record fresh (it may have changed since the last one)
  useEffect(() => {
    let live = true;
    Promise.allSettled([api.getMyRecord(), api.getMyPlan()]).then(([r, p]) => {
      if (!live) return;
      if (r.status === "fulfilled") setRecord(r.value);
      if (p.status === "fulfilled") {
        setMine(p.value);
        setMode("record");
        if (p.value.next_term) setPicked(loadPicks(p.value.next_term));
        return;
      }
      setMode("manual");
      Promise.all([api.getStudyPlans(), api.getLastStudyProgress()])
        .then(([list, last]) => { if (!live) return; setPlans(list); if (last?.plan_id) setPlanId(last.plan_id); })
        .catch(() => live && setError("Could not load the study plans."));
    });
    return () => { live = false; };
  }, []);

  // Manual mode: the chosen plan and the user's saved ticks for it
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

  // Esc: close the course card first, then go back to the chat
  // (not while another dialog, such as the campus map or chat search, is on top)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      if (cardKey) setCardKey(null);
      else onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cardKey, onClose]);

  const fromRecord = mode === "record" && mine;
  const activeTab = fromRecord ? tab : "plan";

  const changeTab = useCallback((id) => {
    setTab(id);
    setCardKey(null);
    store.set(TAB_KEY, id);
    bodyRef.current?.scrollTo({ top: 0 });
  }, []);

  const showPlan = (statusFilter) => {
    setPlanView("list");
    setFilter(statusFilter);
    changeTab("plan");
  };

  const courses = useMemo(() => {
    if (fromRecord) return mine.plan.courses;
    return plan ? plan.courses.filter((c) => !c.track || c.track === track) : [];
  }, [fromRecord, mine, plan, track]);

  const statuses = useMemo(() => {
    if (!fromRecord) return manualStatuses(courses, done);
    return new Map(Object.entries(mine.statuses).map(([k, s]) => [k, { ...s, withCourses: s.with_courses }]));
  }, [fromRecord, mine, courses, done]);

  const counts = {};
  let creditsDone = 0;
  for (const c of courses) {
    const s = statuses.get(c.key)?.status;
    counts[s] = (counts[s] || 0) + 1;
    if (s === "done") creditsDone += c.credits || 0;
  }
  const filters = (fromRecord ? RECORD_FILTERS : MANUAL_FILTERS)
    .filter((f) => f.id === "all" || f.id === filter || counts[f.id]);
  const passedKeys = useMemo(
    () => (fromRecord ? new Set(courses.filter((c) => statuses.get(c.key)?.status === "done").map((c) => c.key)) : done),
    [fromRecord, courses, statuses, done],
  );
  const bottlenecks = fromRecord ? courses.filter((c) => statuses.get(c.key)?.bottleneck) : [];
  const nextTerm = fromRecord ? mine.next_term : null;
  const cardCourse = fromRecord && cardKey ? courses.find((c) => c.key === cardKey) : null;

  // ── manual mode: ticks, saved shortly after the last change ──
  const save = (nextDone, nextTrack) => {
    clearTimeout(saveTimer.current);
    setSaveState("Saving…");
    saveTimer.current = setTimeout(() => {
      api.saveStudyProgress(planId, [...nextDone], nextTrack || null)
        .then(() => setSaveState("Saved"))
        .catch(() => setSaveState("Not saved, check your connection"));
    }, 500);
  };
  const toggle = (key) => {
    const next = new Set(done);
    next.has(key) ? next.delete(key) : next.add(key);
    setDone(next);
    save(next, track);
  };

  // ── next-term planner picks ──
  const changePicks = (next) => {
    setPicked(next);
    if (!nextTerm) return;
    const isSuggestion = nextTerm.candidates.every((c) => c.suggested === next.has(c.key));
    store.set(PICKS_KEY(nextTerm.term), isSuggestion ? null : JSON.stringify([...next]));
  };
  const resetPicks = () => nextTerm && changePicks(new Set(nextTerm.candidates.filter((c) => c.suggested).map((c) => c.key)));

  // ── Ask Mosaed: the question fits the tab ──
  const ask = (q) => { if (onAsk && !busy) onAsk(q); };
  const pickedCourses = nextTerm ? nextTerm.candidates.filter((c) => picked.has(c.key)) : [];
  const action = (() => {
    if (!fromRecord) {
      if (!plan) return null;
      const finished = courses.filter((c) => done.has(c.key) && c.code).map(courseLabel);
      return {
        label: "Ask what to take next",
        q: finished.length
          ? `I am a student in the ${plan.name} (catalog ${plan.catalog_year}). I have completed: ${finished.join(", ")}. Which courses can I take next?`
          : `I am starting the ${plan.name} (catalog ${plan.catalog_year}). Which courses should I take first?`,
      };
    }
    if (activeTab === "next" && nextTerm) {
      return {
        label: "Ask about this plan",
        q: pickedCourses.length
          ? `I'm planning to register these courses for ${nextTerm.term}: ${pickedCourses.map(courseLabel).join(", ")} ` +
            `(${pickedCourses.reduce((s, c) => s + c.credits, 0)} credit hours). Is this a good plan for me, based on my record?`
          : `Which courses should I register for ${nextTerm.term}?`,
      };
    }
    if (activeTab === "transcript") {
      return { label: "Ask about my grades", q: "Looking at my transcript, which courses pull my CGPA down the most, and what can I do about it?" };
    }
    return { label: "Ask what to register next", q: "Based on my record and my study plan, which courses should I register next semester?" };
  })();

  const masters = plans.filter((p) => p.level === "masters");
  const bachelors = plans.filter((p) => p.level !== "masters");
  const shownPlan = fromRecord ? mine.plan : plan;

  return (
    <section
      className={`${styles.page} ${entering ? styles.entering : ""}`}
      aria-label="My degree"
      onAnimationEnd={(e) => e.target === e.currentTarget && setEntering(false)}
    >
      {/* ── Header ── */}
      <header className={styles.head}>
        <div className={styles.who}>
          <p className={styles.eyebrow}>My degree</p>
          {mode === null ? (
            <>
              <div className={`${styles.skel} ${styles.skelTitle}`} />
              <div className={`${styles.skel} ${styles.skelLine}`} />
            </>
          ) : fromRecord ? (
            <>
              <h1 className={styles.name}>{record?.name || mine.plan.name}</h1>
              <p className={styles.meta}>
                <span>{mine.plan.name}</span>
                {record?.student_id && <span>{record.student_id}</span>}
                <span>{mine.summary.current_term}</span>
              </p>
            </>
          ) : (
            <>
              <h1 className={styles.name}>Study plan</h1>
              <p className={styles.meta}><span>Tick the courses you have completed; your progress is saved to your account</span></p>
            </>
          )}
        </div>
        <div className={styles.headSide}>
          {fromRecord && (
            <span className={styles.demoTag} title="Made-up data standing in for the university's student system">Simulated record</span>
          )}
          <button className={styles.closeBtn} onClick={onClose} aria-label="Back to the chat">
            <IconChat size={15} /> Chat <kbd className={styles.closeKey}>Esc</kbd>
          </button>
        </div>
      </header>

      {/* ── Tabs (record) or plan picker (manual) ── */}
      <div className={styles.bar}>
        {fromRecord ? (
          <nav className={styles.tabs} role="tablist" aria-label="Sections">
            {TABS.filter((t) => t.id !== "next" || nextTerm).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ""}`}
                onClick={() => changeTab(t.id)}
              >
                {t.label}
                {t.id === "plan" && bottlenecks.length > 0 && <span className={styles.tabDot} aria-label="needs attention" />}
              </button>
            ))}
          </nav>
        ) : mode === "manual" ? (
          <div className={styles.pickers}>
            <select className={styles.select} value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Program">
              <option value="">Choose your program…</option>
              <optgroup label="Master's">
                {masters.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.catalog_year})</option>)}
              </optgroup>
              <optgroup label="Bachelor's">
                {bachelors.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.catalog_year})</option>)}
              </optgroup>
            </select>
            {plan && plan.tracks.length > 0 && (
              <select className={styles.select} value={track} onChange={(e) => { setTrack(e.target.value); save(done, e.target.value); }} aria-label="Track">
                {plan.tracks.map((t) => <option key={t} value={t}>{t.replace(/-/g, " ")}</option>)}
              </select>
            )}
            {saveState && <span className={styles.saveState}>{saveState}</span>}
          </div>
        ) : <div className={styles.tabs} />}
        {action && onAsk && (
          <button className={styles.ask} onClick={() => ask(action.q)} disabled={busy}>
            <IconChat size={15} /> {action.label}
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className={styles.body} ref={bodyRef}>
        {mode === null && (
          <div className={styles.loading} aria-busy="true" aria-label="Loading">
            <div className={`${styles.skel} ${styles.skelBlock}`} />
            <div className={styles.skelRow}>
              <div className={`${styles.skel} ${styles.skelCard}`} />
              <div className={`${styles.skel} ${styles.skelCard}`} />
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {mode === "manual" && !plan && !error && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Choose your program to see its study plan</p>
            <p className={styles.emptyText}>
              Tick the courses you have finished and the plan shows what you can take next, with prerequisites.
            </p>
          </div>
        )}

        {fromRecord && activeTab === "overview" && (
          <div className={styles.content}>
            <StudiesOverview
              record={record}
              summary={mine.summary}
              courses={courses}
              statuses={statuses}
              bottlenecks={bottlenecks}
              nextTerm={nextTerm}
              picked={picked}
              onOpenCourse={setCardKey}
              onShowPlan={showPlan}
              onTab={changeTab}
              onAsk={onAsk ? ask : null}
              busy={busy}
              animate={entering}
            />
          </div>
        )}

        {shownPlan && activeTab === "plan" && (
          <div className={planView === "map" ? styles.contentWide : styles.content}>
            {!shownPlan.has_prerequisites && (
              <p className={styles.notice}>
                This study plan file has no prerequisite data, so every remaining course is shown as available.
                Check prerequisites with your advisor.
              </p>
            )}
            {!fromRecord && (
              <p className={styles.manualSummary}>
                <b>{creditsDone}</b>{plan.total_credit_hours ? ` of ${plan.total_credit_hours}` : ""} credit hours completed ·{" "}
                {counts.available || 0} can take now · {counts.locked || 0} locked
              </p>
            )}
            <div className={styles.toolbar}>
              <div className={styles.segment} role="tablist" aria-label="View">
                {[["map", "Map"], ["list", "List"]].map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={planView === id}
                    className={`${styles.segBtn} ${planView === id ? styles.segActive : ""}`}
                    onClick={() => setPlanView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {planView === "list" && (
                <div className={styles.filters} role="tablist" aria-label="Filter courses">
                  {filters.map((f) => (
                    <button
                      key={f.id}
                      role="tab"
                      aria-selected={filter === f.id}
                      className={`${styles.filter} ${filter === f.id ? styles.filterActive : ""}`}
                      onClick={() => setFilter(f.id)}
                    >
                      {f.label}
                      {f.id !== "all" && <span className={styles.filterCount}>{counts[f.id] || 0}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {planView === "map" ? (
              <StudyPlanMap
                courses={courses}
                statuses={statuses}
                done={passedKeys}
                onToggle={fromRecord ? null : toggle}
                onSelect={fromRecord ? setCardKey : null}
                selected={cardKey}
              />
            ) : (
              <PlanList
                courses={courses}
                statuses={statuses}
                fromRecord={Boolean(fromRecord)}
                filter={filter}
                done={done}
                onToggle={toggle}
                onSelect={setCardKey}
                selected={cardKey}
              />
            )}
          </div>
        )}

        {fromRecord && activeTab === "next" && nextTerm && (
          <div className={styles.content}>
            <NextTermPlanner next={nextTerm} picked={picked} onChange={changePicks} onReset={resetPicks} onOpenCourse={setCardKey} />
            <p className={styles.foot}>
              A suggestion from your record and the study plan, assuming you pass this term's courses. Your changes are
              kept in this browser. Confirm with your academic advisor before registering.
            </p>
          </div>
        )}

        {fromRecord && activeTab === "transcript" && record && (
          <div className={styles.content}>
            <StudiesTranscript record={record} courses={courses} onOpenCourse={setCardKey} />
          </div>
        )}
      </div>

      {cardCourse && (
        <CourseCard
          key={cardCourse.key}
          course={cardCourse}
          courses={courses}
          statuses={statuses}
          onClose={() => setCardKey(null)}
          onSelect={setCardKey}
          onAsk={onAsk ? ask : null}
          disabled={busy}
        />
      )}
    </section>
  );
}
