import styles from "./PlanStanding.module.css";

// "Where you stand" at the top of the Study Plan panel: overall progress, CGPA, whether the
// student is on track with the official plan, and an estimated graduation term.
// All numbers come from the backend (student_records.progress_summary).

const R = 34;
const C = 2 * Math.PI * R;

function paceNote(s) {
  const gap = s.gap_credits;
  switch (s.track_state) {
    case "ahead":
      return { tone: "good", label: "Ahead of plan", detail: `${gap} credit hours ahead of the plan` };
    case "on_track":
      return { tone: "good", label: "On track", detail: `The plan expects about ${s.expected_credits} credit hours by now` };
    case "behind":
      return { tone: "warn", label: "Behind plan", detail: `${-gap} credit hours behind where the plan expects you to be` };
    case "part_time":
      return { tone: "neutral", label: "Part-time", detail: s.pace ? `About ${s.pace} credit hours a term` : "Studying part-time" };
    default:
      return null;
  }
}

// animate = false: draw the ring filled at once (coming back to the tab is not an event)
export default function PlanStanding({ summary: s, animate = true }) {
  const total = s.total_credit_hours;
  const passedPct = total ? Math.min(100, (s.credits_passed / total) * 100) : 0;
  const nowPct = total ? Math.min(100 - passedPct, (s.credits_in_progress / total) * 100) : 0;
  const pace = paceNote(s);
  const termNo = s.terms_done != null ? s.terms_done + 1 : null;

  return (
    <section className={`${styles.card} ${animate ? "" : styles.still}`} aria-label="Where you stand">
      <div className={styles.inner}>
      <div className={styles.top}>
        <svg className={styles.ring} viewBox="0 0 80 80" role="img"
          aria-label={`${Math.round(passedPct)}% of the program completed`}>
          <circle className={styles.track} cx="40" cy="40" r={R} />
          {nowPct > 0 && (
            <circle
              className={styles.arcNow}
              cx="40" cy="40" r={R}
              style={{ "--c": C, "--len": (C * nowPct) / 100, "--rot": `${(passedPct / 100) * 360 - 90}deg` }}
            />
          )}
          <circle
            className={styles.arc}
            cx="40" cy="40" r={R}
            style={{ "--c": C, "--len": (C * passedPct) / 100, "--rot": "-90deg" }}
          />
          <text x="40" y="38" className={styles.pct}>{Math.round(passedPct)}%</text>
          <text x="40" y="52" className={styles.pctSub}>done</text>
        </svg>

        <div className={styles.headline}>
          <p className={styles.credits}>
            <b>{s.credits_passed}</b>
            {total ? <span title={s.total_is_sum ? "Total worked out from the courses in the study plan" : undefined}> of {total} credit hours</span> : " credit hours"}
          </p>
          {s.credits_in_progress > 0 && (
            <p className={styles.now}>
              <span className={styles.nowDot} /> {s.credits_in_progress} more in progress this term
            </p>
          )}
          {pace && (
            <p className={`${styles.pace} ${styles[pace.tone]}`}>
              <span className={styles.paceLabel}>{pace.label}</span>
              <span className={styles.paceDetail}>{pace.detail}</span>
            </p>
          )}
        </div>
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>CGPA</dt>
          <dd className={s.probation ? styles.bad : undefined}>{s.cgpa != null ? s.cgpa.toFixed(2) : "–"}</dd>
          <span className={styles.statSub}>{s.probation ? "Academic probation" : s.cgpa != null ? "Cumulative" : "No grades yet"}</span>
        </div>
        <div className={styles.stat}>
          <dt>Graduation</dt>
          <dd>{s.estimated_graduation || "–"}</dd>
          <span className={styles.statSub} title="Assumes you pass this term's courses and keep your current pace">
            {!s.estimated_graduation ? "Not enough data yet"
              : s.graduation_limited_by === "chain" ? "Set by your prerequisite chain" : "Estimate at your pace"}
          </span>
        </div>
        <div className={styles.stat}>
          <dt>This term</dt>
          <dd>{s.current_term}</dd>
          <span className={styles.statSub}>{termNo ? `Term ${termNo} · ${s.study_mode}` : s.study_mode}</span>
        </div>
      </dl>
      </div>
    </section>
  );
}
