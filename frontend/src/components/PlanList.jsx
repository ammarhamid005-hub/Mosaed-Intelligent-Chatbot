import { STATUS_LABEL, bottleneckText } from "./planText";
import styles from "./PlanList.module.css";

// The study plan as a list, grouped by term. Record mode: read-only rows with a status
// mark (the grade on passed courses); click a row for the course card. Manual mode
// (accounts without a student record): a checkbox per course to tick it as completed.

const courseName = (c) => (c.code ? `${c.code} ${c.title}` : c.title);

// Manual mode only: each course's status from the ticked courses and the prerequisites.
export function manualStatuses(courses, done) {
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

// One line under a course name saying what the record says about it.
function recordDetail(st) {
  const last = st.attempts?.at(-1);
  const failed = st.attempts?.filter((a) => a.grade && !["IP", "P", "W"].includes(a.grade) && a !== last) || [];
  switch (st.status) {
    case "done":
      return [st.filled_by && `Elective: ${st.filled_by}`, `Grade ${st.grade}${st.term ? ` · ${st.term}` : ""}`,
        failed.length > 0 && `after ${failed.map((a) => a.grade).join(", ")}`].filter(Boolean).join(" · ");
    case "progress":
      return [st.filled_by && `Elective: ${st.filled_by}`, `Registered for ${st.term}`, st.retake && "retake"]
        .filter(Boolean).join(" · ");
    case "retake":
      return last ? `Not passed: ${last.grade} in ${last.term}. Register it again.` : "Register it again.";
    default:
      return null;
  }
}

export default function PlanList({ courses, statuses, fromRecord, filter, done, onToggle, onSelect, selected }) {
  const groups = [];
  for (const c of courses) {
    if (filter !== "all" && statuses.get(c.key).status !== filter) continue;
    let g = groups.find((x) => x.name === c.group);
    if (!g) { g = { name: c.group, items: [] }; groups.push(g); }
    g.items.push(c);
  }

  if (!groups.length) return <p className={styles.empty}>No courses here.</p>;

  return (
    <div className={styles.list}>
      {groups.map((g) => (
        <section key={g.name} className={styles.group}>
          <h3 className={styles.groupName}>{g.name}</h3>
          {g.items.map((c) => {
            const st = statuses.get(c.key);
            const detail = fromRecord ? recordDetail(st) : null;
            const warn = fromRecord ? bottleneckText(st, c) : null;
            const body = (
              <>
                {fromRecord ? (
                  <span className={`${styles.mark} ${styles["mark_" + st.status]}`} aria-hidden="true">
                    {st.status === "done" ? st.grade : ""}
                  </span>
                ) : (
                  <input type="checkbox" checked={done.has(c.key)} onChange={() => onToggle(c.key)} />
                )}
                <span className={styles.text}>
                  <span className={styles.name}>
                    {c.code && /^\d+$/.test(c.code) && <span className={styles.code}>{c.code}</span>} {st.filled_by || c.title}
                  </span>
                  {detail && <span className={`${styles.detail} ${st.status === "retake" ? styles.warn : ""}`}>{detail}</span>}
                  {warn && <span className={`${styles.detail} ${styles.warn}`}>{warn}</span>}
                  {st.needs.length > 0 && <span className={styles.detail}>Needs {st.needs.join("; ")}</span>}
                  {st.withCourses.length > 0 && <span className={styles.detail}>Before or together with {st.withCourses.join("; ")}</span>}
                  {!["done", "progress"].includes(st.status) && st.notes.length > 0 && (
                    <span className={styles.quiet}>Also: {st.notes.join("; ")}</span>
                  )}
                </span>
                <span className={styles.side}>
                  <span className={styles.credits}>{c.credits} cr</span>
                  <span className={`${styles.pill} ${styles["pill_" + st.status]}`}>
                    {!fromRecord && st.status === "done" ? "Done" : STATUS_LABEL[st.status]}
                  </span>
                </span>
              </>
            );
            return fromRecord ? (
              <button
                key={c.key}
                type="button"
                className={`${styles.row} ${styles.rowButton} ${styles[st.status]} ${selected === c.key ? styles.selected : ""}`}
                onClick={() => onSelect(c.key)}
              >
                {body}
              </button>
            ) : (
              <label key={c.key} className={`${styles.row} ${styles[st.status]}`}>{body}</label>
            );
          })}
        </section>
      ))}
    </div>
  );
}
