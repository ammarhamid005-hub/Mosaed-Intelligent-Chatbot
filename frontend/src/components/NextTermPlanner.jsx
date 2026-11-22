import styles from "./NextTermPlanner.module.css";

// "Next term" view of the Study Plan panel: a suggested registration for next term that
// the student can change. The backend (student_records.next_term_plan) lists every course
// that will be open, assuming this term's courses are passed, ranked and with reasons;
// the suggestion fills the usual load. Courses that must be taken together stay together.

// Add a course, plus a partner for every "take together" condition not met yet.
export function addWithPartners(picked, key, byKey) {
  const next = new Set(picked);
  next.add(key);
  for (const opts of byKey.get(key)?.with_options || []) {
    if (!opts.some((o) => next.has(o))) {
      const partner = opts.find((o) => byKey.has(o));
      if (partner) next.add(partner);
    }
  }
  return next;
}

// Remove a course, and every picked course that can no longer be taken without it.
export function removeWithDependents(picked, key, byKey) {
  const next = new Set(picked);
  next.delete(key);
  let changed = true;
  while (changed) {
    changed = false;
    for (const k of next) {
      const broken = (byKey.get(k)?.with_options || []).some((opts) => !opts.some((o) => next.has(o)));
      if (broken) { next.delete(k); changed = true; }
    }
  }
  return next;
}

export default function NextTermPlanner({ next, picked, onChange, onOpenCourse, onReset }) {
  const cands = next.candidates;
  const byKey = new Map(cands.map((c) => [c.key, c]));
  const total = cands.filter((c) => picked.has(c.key)).reduce((s, c) => s + (c.credits || 0), 0);
  const target = next.target_credits || 0;
  const over = target && total > target;
  const isSuggestion = cands.every((c) => c.suggested === picked.has(c.key));
  const firstOther = cands.findIndex((c) => !c.suggested);

  const toggle = (key) => onChange(picked.has(key) ? removeWithDependents(picked, key, byKey) : addWithPartners(picked, key, byKey));

  if (!cands.length) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing left to register for {next.term}</p>
          <p className={styles.emptyText}>
            Every remaining course in your plan is passed or in progress this term. Check with your advisor
            or supervisor what comes next (for example the thesis defense).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.term}>{next.term}</p>
          <p className={styles.assume} title={next.assumes_passing.join("\n")}>
            {next.assumes_passing.length
              ? `Assumes you pass this term's ${next.assumes_passing.length === 1 ? "course" : `${next.assumes_passing.length} courses`}`
              : "Based on the courses you have passed"}
          </p>
        </div>
        <div className={styles.load}>
          <p className={styles.loadText}>
            <b className={over ? styles.over : undefined}>{total}</b>
            <span> / {target} credit hours</span>
          </p>
          <div className={styles.meter} aria-hidden="true">
            <span
              className={over ? styles.meterOver : undefined}
              style={{ transform: `scaleX(${target ? Math.min(1, total / target) : 0})` }}
            />
          </div>
          <p className={styles.loadSub}>
            {over
              ? "More than your usual load: check the limit with your advisor"
              : next.target_source === "plan" ? "The plan's usual term load" : "Your load this term"}
          </p>
        </div>
      </div>

      {!isSuggestion && (
        <div className={styles.changed}>
          <span>You changed the suggestion.</span>
          <button className={styles.reset} onClick={onReset}>Back to the suggestion</button>
        </div>
      )}

      <ul className={styles.list}>
        {cands.map((c, i) => {
          const on = picked.has(c.key);
          const urgent = c.status === "retake" || c.critical;
          return (
            <li key={c.key}>
              {i === firstOther && (
                <p className={styles.divider}>{firstOther === 0 ? "Open next term" : "Also open next term"}</p>
              )}
              <div className={`${styles.row} ${on ? styles.rowOn : ""}`}>
                <label className={styles.pick}>
                  <input type="checkbox" checked={on} onChange={() => toggle(c.key)} />
                  <span className={styles.text}>
                    <span className={styles.name}>
                      {!c.slot && <span className={styles.code}>{c.code}</span>} {c.title}
                    </span>
                    {c.reasons.length > 0 && (
                      <span className={styles.reasons}>
                        {c.reasons.map((r, j) => (
                          <span key={j} className={j === 0 && urgent ? styles.reasonUrgent : undefined}>{r}</span>
                        ))}
                      </span>
                    )}
                    {c.with_courses.length > 0 && (
                      <span className={styles.quiet}>Taken together with {c.with_courses.join("; ")}</span>
                    )}
                    {c.notes.length > 0 && <span className={styles.quiet}>Also requires: {c.notes.join("; ")}</span>}
                  </span>
                </label>
                <span className={styles.side}>
                  <span className={styles.credits}>{c.credits} cr</span>
                  <button
                    className={styles.info}
                    onClick={() => onOpenCourse(c.key)}
                    aria-label={`Details: ${c.title}`}
                    title="Course details"
                  >
                    i
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
