import { useState, useEffect, useRef } from "react";
import styles from "./CalendarWidget.module.css";

const SEMESTERS = ["Fall 2026/2027", "Spring 2026/2027", "Summer 2026/2027"];

const EVENTS = {
  "Fall 2026/2027": [
    { start: "2026-08-17", end: "2026-08-17", label: "Return of Academic Staff" },
    { start: "2026-08-17", end: "2026-08-20", label: "New Students Orientation Week" },
    { start: "2026-08-24", end: "2026-08-24", label: "Classes begin" },
    { start: "2026-08-27", end: "2026-08-27", label: "Last day for Add/Drop" },
    { start: "2026-10-12", end: "2026-10-22", label: "Midterm exams" },
    { start: "2026-10-29", end: "2026-10-29", label: "Last day for dropping without 'F'" },
    { start: "2026-11-19", end: "2026-11-19", label: "Last day for withdrawal from semester" },
    { start: "2026-12-01", end: "2026-12-01", label: "Martyr's Day" },
    { start: "2026-12-02", end: "2026-12-03", label: "UAE National Day" },
    { start: "2026-12-03", end: "2026-12-03", label: "Classes end" },
    { start: "2026-12-05", end: "2026-12-15", label: "Final exams" },
    { start: "2026-12-16", end: "2026-12-17", label: "Last day — Incomplete Exams" },
    { start: "2026-12-16", end: "2027-01-10", label: "Students' winter break" },
  ],
  "Spring 2026/2027": [
    { start: "2027-01-04", end: "2027-01-04", label: "Return of Academic Staff" },
    { start: "2027-01-04", end: "2027-01-07", label: "New Students Orientation Week" },
    { start: "2027-01-11", end: "2027-01-11", label: "Classes begin" },
    { start: "2027-01-14", end: "2027-01-14", label: "Last day for Add/Drop" },
    { start: "2027-03-08", end: "2027-03-11", label: "Eid Al-Fitr" },
    { start: "2027-03-15", end: "2027-03-25", label: "Midterm Exam" },
    { start: "2027-04-01", end: "2027-04-01", label: "Last day for dropping without 'F'" },
    { start: "2027-04-05", end: "2027-04-08", label: "Spring Break" },
    { start: "2027-04-15", end: "2027-04-15", label: "Last day for withdrawal from semester" },
    { start: "2027-04-29", end: "2027-04-29", label: "Classes end" },
    { start: "2027-05-01", end: "2027-05-11", label: "Final exams" },
    { start: "2027-05-12", end: "2027-05-13", label: "Last day — Incomplete Exams" },
  ],
  "Summer 2026/2027": [
    { start: "2027-05-15", end: "2027-05-19", label: "Eid Al-Adha Holidays" },
    { start: "2027-05-31", end: "2027-05-31", label: "Classes begin" },
    { start: "2027-06-01", end: "2027-06-01", label: "Last day for Add/Drop" },
    { start: "2027-06-06", end: "2027-06-06", label: "Alhijiri New Year" },
    { start: "2027-06-14", end: "2027-06-14", label: "Last working day (no Summer teaching)" },
    { start: "2027-07-01", end: "2027-07-01", label: "Last day for dropping without 'F'" },
    { start: "2027-07-08", end: "2027-07-08", label: "Summer classes end" },
    { start: "2027-07-10", end: "2027-07-15", label: "Final exams" },
    { start: "2027-08-16", end: "2027-08-17", label: "Last day — Incomplete Exams" },
    { start: "2027-08-16", end: "2027-08-16", label: "Return of academic staff" },
    { start: "2027-08-23", end: "2027-08-23", label: "Classes begin (2027/2028)" },
  ],
};

// Hardcoded to a demo date so the calendar shows meaningful "current/upcoming"
// badges regardless of when the app is run. Replace with new Date() for production.
function todayStr() {
  //return new Date().toISOString().slice(0, 10);
  return "2026-08-28";
}

function getStatus(start, end) {
  const t = todayStr();
  if (end < t) return "past";
  if (start <= t) return "current";
  return "upcoming";
}

function formatRange(start, end) {
  const parse = (s) => {
    const [y, m, d] = s.split("-");
    return new Date(+y, +m - 1, +d);
  };
  const short = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const long = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const s = parse(start);
  const e = parse(end);
  if (start === end) return long(s);
  return `${short(s)} – ${long(e)}`;
}

function getActiveSemester() {
  const t = todayStr();
  for (const sem of SEMESTERS) {
    if (EVENTS[sem].some((ev) => ev.end >= t)) return sem;
  }
  return SEMESTERS[SEMESTERS.length - 1];
}

function getNextIdx(events) {
  for (let i = 0; i < events.length; i++) {
    if (getStatus(events[i].start, events[i].end) === "upcoming") return i;
  }
  return -1;
}

const CalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export default function CalendarWidget() {
  const [open, setOpen] = useState(false);
  const [activeSem, setActiveSem] = useState(getActiveSemester);
  const wrapperRef = useRef(null);

  const todayDisplay = new Date().toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  });

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onEsc);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const events = EVENTS[activeSem];
  const nextIdx = getNextIdx(events);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        className={`${styles.calBtn} ${open ? styles.calBtnActive : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Academic Calendar 2026/2027"
        aria-label="Open academic calendar"
        aria-expanded={open}
      >
        <CalIcon />
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Academic Calendar">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Academic Calendar 2026/2027</span>
            <span className={styles.panelToday}>{todayDisplay}</span>
          </div>

          <div className={styles.tabs} role="tablist">
            {SEMESTERS.map((sem) => (
              <button
                key={sem}
                role="tab"
                aria-selected={activeSem === sem}
                className={`${styles.tab} ${activeSem === sem ? styles.tabActive : ""}`}
                onClick={() => setActiveSem(sem)}
              >
                {sem.split(" ")[0]}
              </button>
            ))}
          </div>

          <div className={styles.eventList}>
            {events.map((ev, i) => {
              const status = getStatus(ev.start, ev.end);
              const isNext = i === nextIdx;
              const isCurrent = status === "current";
              return (
                <div
                  key={i}
                  className={[
                    styles.eventRow,
                    styles[status],
                    isNext ? styles.next : "",
                  ].join(" ")}
                >
                  <span className={styles.eventDot} />
                  <div className={styles.eventInfo}>
                    <span className={styles.eventLabel}>{ev.label}</span>
                    <span className={styles.eventDate}>{formatRange(ev.start, ev.end)}</span>
                  </div>
                  {isCurrent && <span className={styles.nowBadge}>Now</span>}
                  {isNext && <span className={styles.nextBadge}>Next</span>}
                </div>
              );
            })}
          </div>

          <p className={styles.note}>* Holidays and graduation dates are subject to change.</p>
        </div>
      )}
    </div>
  );
}
