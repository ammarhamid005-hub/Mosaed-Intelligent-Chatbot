import { useEffect, useRef } from "react";
import { STATUS_LABEL, courseLabel, bottleneckText } from "./planText";
import styles from "./CourseCard.module.css";

// Details of one course in the Study Plan panel (record mode): what the record says,
// each prerequisite and whether it is met, which later courses it opens, and why it
// should not be left for later. Opens from the plan map, the list and the next-term planner.

function prereqState(code, keyOfCode, statuses) {
  const key = keyOfCode.get(code);
  if (!key) return { key: null, state: "outside" };
  const st = statuses.get(key)?.status;
  return { key, state: st === "done" ? "met" : st === "progress" ? "now" : "missing" };
}

const ELECTIVE_GROUPS = ["Elective courses", "Other courses"]; // same as student_records.ELECTIVE_GROUPS
const MARK = { met: "✓", now: "•", missing: "✕", outside: "–" };
const MARK_TITLE = { met: "Passed", now: "This term", missing: "Not passed yet", outside: "From earlier study" };

export default function CourseCard({ course: c, courses, statuses, onClose, onSelect, onAsk, disabled }) {
  const ref = useRef(null);
  const info = statuses.get(c.key) || {};
  const byKey = new Map(courses.map((x) => [x.key, x]));
  const keyOfCode = new Map();
  for (const x of courses) if (x.code && !keyOfCode.has(x.code)) keyOfCode.set(x.code, x.key);
  const warn = bottleneckText(info, c);
  const isSlot = !c.code || !/^\d+$/.test(c.code);
  // A course can sit in the plan twice (e.g. the thesis, split over terms): list it once
  const unlocks = [];
  for (const k of info.unlocks || []) {
    const d = byKey.get(k);
    if (d && !unlocks.some((u) => courseLabel(u) === courseLabel(d))) unlocks.push(d);
  }

  // Move focus into the card so Esc and screen readers land here
  useEffect(() => { ref.current?.focus(); }, [c.key]);

  const attempts = (info.attempts || []).filter((a) => a.grade !== "IP");

  // Locked, but every prerequisite not passed yet is one of this term's courses
  const opensNextTerm = (c.prerequisites || []).every((cond) => {
    const opts = cond.codes.map((code) => prereqState(code, keyOfCode, statuses).state);
    return !opts.length || opts.includes("met") || opts.includes("now") || opts.every((s) => s === "outside");
  });

  return (
    <aside ref={ref} tabIndex={-1} className={styles.card} aria-label={`Course details: ${c.title}`}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.meta}>
            {!isSlot && <span>{c.code}</span>}
            <span>{c.credits} credit hours</span>
            <span>{c.group}</span>
          </p>
          <h3 className={styles.title}>{info.filled_by || c.title}</h3>
          {info.filled_by && <p className={styles.slotOf}>Fills the “{c.title}” slot</p>}
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close course details">×</button>
      </header>

      <div className={styles.body}>
        <p className={`${styles.status} ${styles["st_" + info.status]}`}>
          {STATUS_LABEL[info.status] || "—"}
          {info.status === "done" && info.grade && <b>{info.grade}</b>}
          {info.status === "done" && info.term && <span>{info.term}</span>}
          {info.status === "progress" && <span>{info.term}{info.retake ? " · retake" : ""}</span>}
        </p>

        {warn && <p className={styles.warn}>{warn}</p>}

        {info.status === "locked" && opensNextTerm && (
          <p className={styles.quiet}>Opens next term if you pass this term's courses.</p>
        )}

        {(attempts.length > 1 || (attempts.length > 0 && info.status !== "done")) && (
          <section className={styles.section}>
            <h4>Your attempts</h4>
            <ul className={styles.attempts}>
              {attempts.map((a, i) => (
                <li key={i}><b>{a.grade}</b> <span>{a.term}</span></li>
              ))}
            </ul>
          </section>
        )}

        {isSlot && !info.filled_by && (
          <p className={styles.quiet}>Any course from the program's elective list counts here.</p>
        )}

        {(c.prerequisites || []).length > 0 && (
          <section className={styles.section}>
            <h4>Prerequisites</h4>
            <ul className={styles.reqs}>
              {c.prerequisites.map((cond, i) => {
                if (!cond.codes.length) {
                  return <li key={i} className={styles.reqNote}>{cond.text}</li>;
                }
                const opts = cond.codes.map((code) => ({ code, ...prereqState(code, keyOfCode, statuses) }));
                if (opts.every((o) => o.state === "outside")) {
                  return (
                    <li key={i} className={styles.reqNote}>
                      {cond.codes.join(" or ")} <span className={styles.tag}>from earlier study</span>
                    </li>
                  );
                }
                return (
                  <li key={i} className={styles.req}>
                    {opts.map((o, j) => {
                      const target = o.key && byKey.get(o.key);
                      return (
                        <span key={o.code} className={styles.reqOpt}>
                          {j > 0 && <span className={styles.or}>or</span>}
                          <span className={`${styles.reqMark} ${styles["m_" + o.state]}`} title={MARK_TITLE[o.state]}>
                            {MARK[o.state]}
                          </span>
                          {target ? (
                            <button className={styles.link} onClick={() => onSelect(o.key)}>{courseLabel(target)}</button>
                          ) : (
                            <span>{o.code}</span>
                          )}
                        </span>
                      );
                    })}
                    {cond.coreq && <span className={styles.tag}>before or together</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {unlocks.length > 0 && (
          <section className={styles.section}>
            <h4>Opens the way to</h4>
            <ul className={styles.unlocks}>
              {unlocks.map((d) => {
                const st = statuses.get(d.key)?.status;
                return (
                  <li key={d.key}>
                    <span className={styles.unlockName}>
                      <button className={styles.link} onClick={() => onSelect(d.key)}>{courseLabel(d)}</button>
                      {ELECTIVE_GROUPS.includes(d.group) && <span className={styles.tag}>elective</span>}
                    </span>
                    <span className={`${styles.miniPill} ${styles["st_" + st]}`}>{STATUS_LABEL[st]}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {onAsk && (
        <footer className={styles.foot}>
          <button
            className={styles.ask}
            disabled={disabled}
            onClick={() => onAsk(isSlot
              ? `Which elective should I take for the "${c.title}" slot in my study plan?`
              : `Tell me about ${c.code} ${c.title}. Based on my record, when should I take it?`)}
          >
            Ask Mosaed about this course
          </button>
        </footer>
      )}
    </aside>
  );
}
