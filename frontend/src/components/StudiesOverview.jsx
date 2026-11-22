import PlanStanding from "./PlanStanding";
import { courseLabel, bottleneckText } from "./planText";
import { IconArrowRight } from "./icons";
import styles from "./StudiesOverview.module.css";

// Overview tab of "My degree": where the student stands, what holds them back, this term,
// next term, the plan at a glance, the record's facts and quick questions for Mosaed.

const QUESTIONS = [
  "What should I register next semester?",
  "Am I on track to graduate? What is left?",
  "What grade do I need this semester to raise my CGPA?",
];

const GLANCE = [
  ["done", "Passed"],
  ["progress", "This term"],
  ["available", "Can take"],
  ["retake", "Retake"],
  ["locked", "Locked"],
];

// The plan course a registered course belongs to (directly, or the elective slot it fills)
function planKeyFor(entry, courses, statuses) {
  const c = courses.find((x) => x.key === entry.key) || courses.find((x) => x.code === entry.code);
  if (c) return c.key;
  return courses.find((x) => statuses.get(x.key)?.filled_by?.startsWith(entry.code))?.key ?? null;
}

export default function StudiesOverview({
  record, summary, courses, statuses, bottlenecks, nextTerm, picked,
  onOpenCourse, onShowPlan, onTab, onAsk, busy, animate,
}) {
  const registered = record?.registered ?? [];
  const nowCredits = registered.reduce((s, r) => s + (r.credits || 0), 0);
  const nextPicks = nextTerm ? nextTerm.candidates.filter((c) => picked.has(c.key)) : [];
  const nextCredits = nextPicks.reduce((s, c) => s + (c.credits || 0), 0);
  const counts = {};
  for (const c of courses) {
    const st = statuses.get(c.key)?.status;
    counts[st] = (counts[st] || 0) + 1;
  }
  const facts = record ? [
    ["Program", record.program],
    ["Study mode", `${record.level === "masters" ? "Master's" : "Bachelor's"} · ${record.study_mode}`],
    ["Admission", record.admission],
    ["Started", record.start_term],
    ["Advisor", record.advisor],
    record.supervisor && ["Thesis supervisor", record.supervisor],
  ].filter(Boolean) : [];

  return (
    <div className={`${styles.stack} ${animate ? styles.enter : ""}`}>
      <PlanStanding summary={summary} animate={animate} />

      {bottlenecks.length > 0 && (
        <div className={styles.alert} role="note">
          <p className={styles.alertTitle}>
            Don't leave {bottlenecks.length === 1 ? "this course" : "these courses"} for later
          </p>
          <ul className={styles.alertList}>
            {bottlenecks.map((c) => (
              <li key={c.key}>
                <button className={styles.alertLink} onClick={() => onOpenCourse(c.key)}>{courseLabel(c)}</button>
                <span>{bottleneckText(statuses.get(c.key), c)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.col}>
          {/* ── This term ── */}
          <section className={styles.card}>
            <header className={styles.cardHead}>
              <h3 className={styles.cardTitle}>This term</h3>
              <span className={styles.cardMeta}>{summary.current_term} · {nowCredits} credit hours</span>
            </header>
            {registered.length === 0 ? (
              <p className={styles.empty}>Nothing registered this term.</p>
            ) : (
              <ul className={styles.rows}>
                {registered.map((r) => {
                  const key = planKeyFor(r, courses, statuses);
                  const retake = key && statuses.get(key)?.retake;
                  return (
                    <li key={r.key + r.code}>
                      <button className={styles.row} onClick={() => key && onOpenCourse(key)} disabled={!key}>
                        <span className={styles.code}>{r.code}</span>
                        <span className={styles.title}>{r.title}</span>
                        {retake && <span className={styles.tagWarn}>Retake</span>}
                        <span className={styles.cr}>{r.credits} cr</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Next term ── */}
          {nextTerm && (
            <section className={styles.card}>
              <header className={styles.cardHead}>
                <h3 className={styles.cardTitle}>Next term</h3>
                <span className={styles.cardMeta}>
                  {nextTerm.term}{nextPicks.length > 0 && ` · ${nextCredits} of ${nextTerm.target_credits} credit hours`}
                </span>
              </header>
              {nextPicks.length === 0 ? (
                <p className={styles.empty}>
                  {nextTerm.candidates.length ? "No courses picked yet." : "Nothing left to register."}
                </p>
              ) : (
                <ul className={styles.rows}>
                  {nextPicks.map((c) => (
                    <li key={c.key}>
                      <button className={styles.row} onClick={() => onOpenCourse(c.key)}>
                        <span className={styles.code}>{c.slot ? "Elective" : c.code}</span>
                        <span className={styles.title}>{c.title}</span>
                        {(c.status === "retake" || c.critical) && <span className={styles.tagWarn}>{c.status === "retake" ? "Retake" : "Key"}</span>}
                        <span className={styles.cr}>{c.credits} cr</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button className={styles.more} onClick={() => onTab("next")}>
                Open the planner <IconArrowRight size={14} />
              </button>
            </section>
          )}
        </div>

        <div className={styles.col}>
          {/* ── Plan at a glance ── */}
          <section className={styles.card}>
            <header className={styles.cardHead}>
              <h3 className={styles.cardTitle}>Your plan at a glance</h3>
              <span className={styles.cardMeta}>{courses.length} courses</span>
            </header>
            <div className={styles.glance}>
              {GLANCE.filter(([id]) => counts[id]).map(([id, label]) => (
                <button key={id} className={`${styles.glanceItem} ${styles["g_" + id]}`} onClick={() => onShowPlan(id)}>
                  <span className={styles.glanceNum}>{counts[id]}</span>
                  <span className={styles.glanceLabel}>{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Record facts ── */}
          {record && (
            <section className={styles.card}>
              <header className={styles.cardHead}>
                <h3 className={styles.cardTitle}>Record</h3>
                <span className={styles.cardMeta}>{record.student_id}</span>
              </header>
              <dl className={styles.facts}>
                {facts.map(([k, v]) => (
                  <div key={k} className={styles.fact}><dt>{k}</dt><dd>{v || "–"}</dd></div>
                ))}
              </dl>
              {record.notes && <p className={styles.notes}>{record.notes}</p>}
            </section>
          )}

          {/* ── Ask Mosaed ── */}
          {onAsk && (
            <section className={styles.card}>
              <header className={styles.cardHead}>
                <h3 className={styles.cardTitle}>Ask Mosaed</h3>
              </header>
              <div className={styles.asks}>
                {QUESTIONS.map((q) => (
                  <button key={q} className={styles.askRow} onClick={() => onAsk(q)} disabled={busy}>
                    <span>{q}</span>
                    <IconArrowRight size={14} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
