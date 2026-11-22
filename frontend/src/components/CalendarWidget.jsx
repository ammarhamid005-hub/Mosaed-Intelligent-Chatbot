import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import NavItem, { sidePanelPosition } from "./NavItem";
import { IconCalendar, IconClose } from "./icons";
import styles from "./CalendarWidget.module.css";

// Academic calendar: a side panel beside the sidebar. It lists the chosen semester as an
// agenda grouped by month, opened at today, with the next date counted down.

const YEAR = "2026/27";
const SEMESTERS = ["Fall", "Spring", "Summer"];

const EVENTS = {
  Fall: [
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
  Spring: [
    { start: "2027-01-04", end: "2027-01-04", label: "Return of Academic Staff" },
    { start: "2027-01-04", end: "2027-01-07", label: "New Students Orientation Week" },
    { start: "2027-01-11", end: "2027-01-11", label: "Classes begin" },
    { start: "2027-01-14", end: "2027-01-14", label: "Last day for Add/Drop" },
    { start: "2027-03-08", end: "2027-03-11", label: "Eid Al-Fitr" },
    { start: "2027-03-15", end: "2027-03-25", label: "Midterm exams" },
    { start: "2027-04-01", end: "2027-04-01", label: "Last day for dropping without 'F'" },
    { start: "2027-04-05", end: "2027-04-08", label: "Spring Break" },
    { start: "2027-04-15", end: "2027-04-15", label: "Last day for withdrawal from semester" },
    { start: "2027-04-29", end: "2027-04-29", label: "Classes end" },
    { start: "2027-05-01", end: "2027-05-11", label: "Final exams" },
    { start: "2027-05-12", end: "2027-05-13", label: "Last day — Incomplete Exams" },
  ],
  Summer: [
    { start: "2027-05-15", end: "2027-05-19", label: "Eid Al-Adha Holidays" },
    { start: "2027-05-31", end: "2027-05-31", label: "Classes begin" },
    { start: "2027-06-01", end: "2027-06-01", label: "Last day for Add/Drop" },
    { start: "2027-06-06", end: "2027-06-06", label: "Alhijiri New Year" },
    { start: "2027-06-14", end: "2027-06-14", label: "Last working day (no Summer teaching)" },
    { start: "2027-07-01", end: "2027-07-01", label: "Last day for dropping without 'F'" },
    { start: "2027-07-08", end: "2027-07-08", label: "Summer classes end" },
    { start: "2027-07-10", end: "2027-07-15", label: "Final exams" },
    { start: "2027-08-16", end: "2027-08-16", label: "Return of Academic Staff" },
    { start: "2027-08-16", end: "2027-08-17", label: "Last day — Incomplete Exams" },
    { start: "2027-08-23", end: "2027-08-23", label: "Classes begin (2027/2028)" },
  ],
};

// ── Dates (all local, as YYYY-MM-DD strings so they compare as text) ──
const parse = (s) => {
  const [y, m, d] = s.split("-");
  return new Date(+y, +m - 1, +d);
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const fmt = (s, opts) => parse(s).toLocaleDateString("en-GB", opts);
const weekday = (s) => fmt(s, { weekday: "short" });
const dayMonth = (s) => fmt(s, { day: "numeric", month: "short" });
const monthName = (s) => fmt(s, { month: "long", year: "numeric" });

const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

function statusOf(ev, today) {
  if (ev.end < today) return "past";
  if (ev.start <= today) return "current";
  return "upcoming";
}

function untilText(days) {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
}

// The semester the student is in now: the first one with something still ahead or ongoing
function activeSemester(today) {
  return SEMESTERS.find((s) => EVENTS[s].some((ev) => ev.end >= today)) ?? SEMESTERS[SEMESTERS.length - 1];
}

// The next date across the whole year, with the semester it belongs to
function nextEvent(today) {
  for (const sem of SEMESTERS) {
    const ev = EVENTS[sem].find((e) => e.start > today);
    if (ev) return { sem, ev };
  }
  return null;
}

function byMonth(events) {
  const groups = [];
  for (const ev of [...events].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))) {
    const key = ev.start.slice(0, 7);
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
    groups.at(-1).items.push(ev);
  }
  return groups;
}

const PANEL_W = 360;
const PANEL_H = 560;

export default function CalendarWidget() {
  const today = todayStr();
  const [open, setOpen] = useState(false);
  const [sem, setSem] = useState(() => activeSemester(today));
  const [pos, setPos] = useState({ top: 64, left: 280 });
  const wrapperRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const tabRefs = useRef({});

  const next = nextEvent(today);

  function close(returnFocus) {
    setOpen(false);
    if (returnFocus) wrapperRef.current?.querySelector("button")?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      const inside = (r) => r.current && r.current.contains(e.target);
      if (!inside(wrapperRef) && !inside(panelRef)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") close(true);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Open the list at today: the month of the first date that is not over yet
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const target = list.querySelector("[data-live]")?.closest("section");
    list.scrollTop = target ? target.offsetTop - list.offsetTop : 0;
  }, [open, sem]);

  function openPanel(e) {
    const p = sidePanelPosition(e.currentTarget, PANEL_H);
    const w = Math.min(PANEL_W, window.innerWidth - 24);
    setPos({ top: p.top, left: Math.max(12, Math.min(p.left, window.innerWidth - w - 12)) });
    setSem(activeSemester(today));
    setOpen((v) => !v);
  }

  function onTabKey(e) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const nextSem = SEMESTERS[(SEMESTERS.indexOf(sem) + step + SEMESTERS.length) % SEMESTERS.length];
    setSem(nextSem);
    tabRefs.current[nextSem]?.focus();
  }

  const groups = byMonth(EVENTS[sem]);
  let liveMarked = false;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <NavItem
        icon={<IconCalendar />}
        label="Academic calendar"
        active={open}
        onClick={openPanel}
        aria-expanded={open}
      />

      {open && createPortal(
        <div className={styles.panel} role="dialog" aria-label="Academic calendar" ref={panelRef}
          style={{ top: pos.top, left: pos.left }}>
          <header className={styles.head}>
            <div className={styles.titles}>
              <h2 className={styles.title}>Academic calendar <span className={styles.year}>{YEAR}</span></h2>
              <p className={styles.today}>
                Today is {parse(today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <button type="button" className={styles.closeBtn} onClick={() => close(true)}
              aria-label="Close calendar" title="Close (Esc)">
              <kbd className={styles.closeKey} aria-hidden="true">Esc</kbd>
              <IconClose size={16} />
            </button>
          </header>

          <div className={styles.segment} role="tablist" aria-label="Semester" onKeyDown={onTabKey}>
            {SEMESTERS.map((s) => (
              <button
                key={s}
                ref={(el) => { tabRefs.current[s] = el; }}
                type="button"
                role="tab"
                aria-selected={sem === s}
                tabIndex={sem === s ? 0 : -1}
                className={`${styles.segBtn} ${sem === s ? styles.segActive : ""}`}
                onClick={() => setSem(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className={styles.list} ref={listRef} role="tabpanel" aria-label={`${sem} ${YEAR}`} tabIndex={0}>
            {groups.map((g) => (
              <section key={g.key} className={styles.month}>
                <h3 className={styles.monthName}>{monthName(g.items[0].start)}</h3>
                <ul className={styles.rows}>
                  {g.items.map((ev) => {
                    const status = statusOf(ev, today);
                    const isNext = next && ev === next.ev;
                    const live = status !== "past" && !liveMarked;
                    if (live) liveMarked = true;
                    const multi = ev.start !== ev.end;
                    return (
                      <li key={ev.start + ev.label} data-live={live || undefined}
                        className={`${styles.row} ${styles[status]} ${isNext ? styles.isNext : ""}`}>
                        <span className={styles.date}>
                          <span className={styles.dayNum}>{+ev.start.slice(8)}</span>
                          <span className={styles.dayName}>{weekday(ev.start)}</span>
                        </span>
                        <span className={styles.body}>
                          <span className={styles.label}>{ev.label}</span>
                          {multi && (
                            <span className={styles.range}>
                              Until {weekday(ev.end)} {dayMonth(ev.end)} · {daysBetween(ev.start, ev.end) + 1} days
                            </span>
                          )}
                        </span>
                        {status === "current" && <span className={styles.tagNow}>Now</span>}
                        {isNext && <span className={styles.tagNext}>{untilText(daysBetween(today, ev.start))}</span>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <p className={styles.note}>Holidays and graduation dates are subject to change.</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
