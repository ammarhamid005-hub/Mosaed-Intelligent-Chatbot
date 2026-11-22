import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { bottleneckText } from "./planText";
import styles from "./StudyPlanMap.module.css";

// Study plan drawn like the official flowchart: one column per term, grouped by year,
// one box per course, arrows from each prerequisite to the course that needs it.
// Manual mode: click a box to mark it completed. Record mode: click it for details.

const YEAR_COLORS = ["#E8833A", "#7FB24A", "#3FA7C9", "#D9534F", "#8E6CC0", "#5C7A8A"];

function yearOf(group) {
  let m = group.match(/^Year (\d+)/);
  if (m) return Number(m[1]);
  m = group.match(/^Semester (\d+)/);
  if (m) return Math.ceil(Number(m[1]) / 2);
  return null;
}

function termLabel(group) {
  const m = group.match(/^Year \d+ · (.+)$/);
  return m ? m[1] : group;
}

// Hover text for a box: what the record says, or what is still needed.
function boxTitle(info, readOnly, course) {
  const warn = bottleneckText(info, course);
  const base = boxStatusTitle(info, readOnly);
  return warn ? `${base}\n${warn}` : base;
}

function boxStatusTitle(info, readOnly) {
  const last = info.attempts?.at(-1);
  if (info.status === "done") return info.grade ? `Passed · grade ${info.grade}${info.term ? ` · ${info.term}` : ""}` : "Completed";
  if (info.status === "progress") return `Registered for ${info.term}${info.retake ? " (retake)" : ""}`;
  if (info.status === "retake") return last ? `Not passed (${last.grade}, ${last.term}): register it again` : "Register it again";
  if (info.needs?.length) return `Needs: ${info.needs.join("; ")}`;
  return readOnly ? "You can register this course" : "Click to mark as completed";
}

// onToggle = null: read-only (the plan is filled in from the student record);
// onSelect then opens a course's details and `selected` outlines that course.
export default function StudyPlanMap({ courses, statuses, done, onToggle, onSelect, selected }) {
  const readOnly = !onToggle;
  const wrapRef = useRef(null);
  const boxRefs = useRef(new Map());
  const [edges, setEdges] = useState([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState(null);
  useEffect(() => setHover(null), [courses]);

  // Columns: terms in plan order, then groups without a term (electives, thesis…)
  const order = [];
  for (const c of courses) if (!order.includes(c.group)) order.push(c.group);
  const timed = order.filter((g) => yearOf(g) !== null);
  const untimed = order.filter((g) => yearOf(g) === null);
  const columns = [...timed, ...untimed].map((g) => ({
    group: g,
    year: yearOf(g),
    items: courses.filter((c) => c.group === g),
  }));
  const years = [];
  for (const col of columns) {
    const key = col.year ?? "other";
    const last = years.at(-1);
    if (last && last.key === key) last.span += 1;
    else years.push({ key, span: 1, credits: 0 });
    years.at(-1).credits += col.items.reduce((s, c) => s + (c.credits || 0), 0);
  }

  // Prerequisite links between courses of this plan (first box of a code is the target).
  const keyOfCode = new Map();
  for (const c of courses) if (c.code && !keyOfCode.has(c.code)) keyOfCode.set(c.code, c.key);
  const links = [];
  for (const c of courses) {
    for (const cond of c.prerequisites || []) {
      for (const code of cond.codes) {
        const from = keyOfCode.get(code);
        if (from && from !== c.key) links.push({ from, to: c.key, coreq: cond.coreq });
      }
    }
  }
  const linkSig = links.map((l) => `${l.from}>${l.to}`).join("|") + courses.length;

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    const pos = (key) => {
      const el = boxRefs.current.get(key);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top };
    };
    const out = [];
    for (const l of links) {
      const a = pos(l.from), b = pos(l.to);
      if (!a || !b) continue;
      const ya = (a.t + a.b) / 2, yb = (b.t + b.b) / 2;
      let d;
      if (b.l > a.r + 4) {
        const dx = Math.max(24, (b.l - a.r) / 2);
        d = `M${a.r},${ya} C${a.r + dx},${ya} ${b.l - dx},${yb} ${b.l},${yb}`;
      } else {
        // same column (or backwards): loop out on the right side
        const x = Math.max(a.r, b.r) + 14;
        d = `M${a.r},${ya} C${x},${ya} ${x},${yb} ${b.r},${yb}`;
      }
      out.push({ ...l, d });
    }
    setEdges(out);
    setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
  }, [linkSig]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const related = (key) =>
    hover && (key === hover || links.some((l) => (l.from === hover && l.to === key) || (l.to === hover && l.from === key)));

  return (
    <div className={styles.scroller}>
      <div
        className={styles.grid}
        ref={wrapRef}
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(132px, 1fr))` }}
      >
        {years.map((y, i) => (
          <div
            key={`y-${i}`}
            className={styles.yearHead}
            style={{ gridColumn: `span ${y.span}`, "--year": y.key === "other" ? "#8A96A0" : YEAR_COLORS[(y.key - 1) % YEAR_COLORS.length] }}
          >
            {y.key === "other" ? "Other" : `Year ${y.key}`}
          </div>
        ))}
        {columns.map((col) => (
          <div key={`t-${col.group}`} className={styles.termHead}>{col.year ? termLabel(col.group) : col.group}</div>
        ))}
        {columns.map((col) => {
          const color = col.year ? YEAR_COLORS[(col.year - 1) % YEAR_COLORS.length] : "#8A96A0";
          return (
            <div key={`c-${col.group}`} className={styles.column}>
              {col.items.map((c) => {
                const info = statuses.get(c.key) || {};
                const st = info.status;
                const dim = hover && !related(c.key);
                return (
                  <button
                    type="button"
                    key={c.key}
                    ref={(el) => (el ? boxRefs.current.set(c.key, el) : boxRefs.current.delete(c.key))}
                    className={`${styles.box} ${styles[st]} ${dim ? styles.dim : ""} ${readOnly && !onSelect ? styles.readOnly : ""} ${selected === c.key ? styles.selected : ""}`}
                    style={{ "--year": color }}
                    onClick={readOnly ? (onSelect ? () => onSelect(c.key) : undefined) : () => onToggle(c.key)}
                    onMouseEnter={() => setHover(c.key)}
                    onMouseLeave={() => setHover(null)}
                    title={boxTitle(info, readOnly, c)}
                    aria-pressed={readOnly ? undefined : done.has(c.key)}
                  >
                    {info.bottleneck && <span className={styles.flag} aria-label="Do not leave for later">!</span>}
                    <span className={styles.boxTitle}>{info.filled_by || c.title}</span>
                    <span className={styles.boxMeta}>
                      {c.code || "—"} ({c.credits}cr)
                      {st === "done" && <span className={styles.mark}> {info.grade || "✓"}</span>}
                      {st === "progress" && <span className={styles.mark}> · now</span>}
                      {st === "retake" && <span className={styles.mark}> · retake</span>}
                      {st === "locked" && <span className={styles.mark}> 🔒</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {years.map((y, i) => (
          <div key={`f-${i}`} className={styles.yearFoot} style={{ gridColumn: `span ${y.span}` }}>
            {y.credits} credit hours
          </div>
        ))}

        <svg className={styles.links} width={size.w} height={size.h} aria-hidden="true">
          <defs>
            <marker id="sp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="var(--muted)" />
            </marker>
            <marker id="sp-arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="var(--green)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const hi = hover && (e.from === hover || e.to === hover);
            return (
              <path
                key={i}
                d={e.d}
                fill="none"
                stroke={hi ? "var(--green)" : "var(--muted)"}
                strokeOpacity={hover && !hi ? 0.15 : hi ? 1 : 0.55}
                strokeWidth={hi ? 1.8 : 1.1}
                strokeDasharray={e.coreq ? "2 3" : "5 4"}
                markerEnd={hi ? "url(#sp-arrow-hi)" : "url(#sp-arrow)"}
              />
            );
          })}
        </svg>
      </div>
      {readOnly ? (
        <p className={styles.legend}>
          Filled = passed (with your grade) · thick outline = this term · amber = retake · plain = you can register it ·
          dashed 🔒 = a prerequisite is missing · ! = later courses wait for it · arrows go from a prerequisite to the
          course that needs it (dotted = can be taken together) · hover a course to highlight its links, click it for details
        </p>
      ) : (
        <p className={styles.legend}>
          Click a course to mark it completed · arrows go from a prerequisite to the course that needs it
          (dotted = can be taken together) · hover a course to highlight its links · ✓ done · 🔒 prerequisite missing
        </p>
      )}
    </div>
  );
}
