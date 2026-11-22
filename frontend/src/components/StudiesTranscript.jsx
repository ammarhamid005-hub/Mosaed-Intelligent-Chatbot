import styles from "./StudiesTranscript.module.css";

// Transcript tab of "My degree": every term (newest first) with its courses, grades and
// term GPA; this term's registration on top. A failed course says when it was retaken.

const POINTS = { A: 4, "B+": 3.5, B: 3, "C+": 2.5, C: 2, "D+": 1.5, D: 1, F: 0 };

function termGpa(items) {
  let pts = 0, hrs = 0;
  for (const e of items) {
    if (e.grade in POINTS) { pts += POINTS[e.grade] * e.credits; hrs += e.credits; }
  }
  return hrs ? (pts / hrs).toFixed(2) : null;
}

function gradeClass(e) {
  if (e.grade === "F" || (e.grade in POINTS && !e.passed)) return styles.gradeFail;
  if (e.grade === "A") return styles.gradeTop;
  if (!(e.grade in POINTS)) return styles.gradeQuiet;
  return "";
}

function TranscriptRow({ e, courseKey, onOpen, children }) {
  return (
    <li>
      <button className={styles.row} onClick={() => courseKey && onOpen(courseKey)} disabled={!courseKey}>
        <span className={styles.code}>{e.code}</span>
        <span className={styles.title}>{e.title}{children}</span>
        <span className={styles.cr}>{e.credits} cr</span>
        <span className={`${styles.grade} ${e.grade ? gradeClass(e) : styles.gradeNow}`}>{e.grade || "Now"}</span>
      </button>
    </li>
  );
}

export default function StudiesTranscript({ record, courses, onOpenCourse }) {
  const keyOf = (e) =>
    (courses.find((c) => c.key === e.key) || courses.find((c) => c.code === e.code))?.key ?? null;

  const terms = [];
  for (const e of record.transcript) {
    let t = terms.find((x) => x.term === e.term);
    if (!t) { t = { term: e.term, items: [] }; terms.push(t); }
    t.items.push(e);
  }
  // when a failed course was taken again
  const retakenIn = (e, termIndex) => {
    for (let i = termIndex + 1; i < terms.length; i++) {
      if (terms[i].items.some((x) => x.code === e.code)) return terms[i].term;
    }
    return record.registered.some((r) => r.code === e.code) ? `${record.current_term} (this term)` : null;
  };

  const passedHours = record.credit_hours_passed;

  return (
    <div className={styles.wrap}>
      <dl className={styles.summary}>
        <div><dt>CGPA</dt><dd>{record.cgpa != null ? Number(record.cgpa).toFixed(2) : "–"}</dd></div>
        <div><dt>Credit hours passed</dt><dd>{passedHours}{record.total_credit_hours ? <small> / {record.total_credit_hours}</small> : null}</dd></div>
        <div><dt>Courses taken</dt><dd>{record.transcript.length}</dd></div>
        <div><dt>Terms</dt><dd>{terms.length}</dd></div>
      </dl>

      {record.registered.length > 0 && (
        <section className={`${styles.term} ${styles.termNow}`}>
          <header className={styles.termHead}>
            <h3>{record.current_term}</h3>
            <span className={styles.nowTag}>In progress</span>
            <span className={styles.termMeta}>{record.registered.reduce((s, r) => s + (r.credits || 0), 0)} cr</span>
          </header>
          <ul className={styles.rows}>
            {record.registered.map((r) => (
              <TranscriptRow key={r.key + r.code} e={{ ...r, grade: null }} courseKey={keyOf(r)} onOpen={onOpenCourse} />
            ))}
          </ul>
        </section>
      )}

      {[...terms].reverse().map((t) => {
        const idx = terms.indexOf(t);
        const gpa = termGpa(t.items);
        return (
          <section key={t.term} className={styles.term}>
            <header className={styles.termHead}>
              <h3>{t.term}</h3>
              <span className={styles.termMeta}>
                {t.items.reduce((s, e) => s + e.credits, 0)} cr{gpa && <> · Term GPA <b>{gpa}</b></>}
              </span>
            </header>
            <ul className={styles.rows}>
              {t.items.map((e, i) => {
                const failed = e.grade in POINTS && !e.passed;
                const again = failed ? retakenIn(e, idx) : null;
                return (
                  <TranscriptRow key={e.key + i} e={e} courseKey={keyOf(e)} onOpen={onOpenCourse}>
                    {failed && <span className={styles.note}>{again ? `Retaken in ${again}` : "Not retaken yet"}</span>}
                  </TranscriptRow>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className={styles.foot}>
        Term GPA counts every graded course that term. Your CGPA counts only the latest attempt of a retaken course.
      </p>
    </div>
  );
}
