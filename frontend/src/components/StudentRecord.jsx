import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "../services/api";
import styles from "./StudentRecord.module.css";

// "My record": the logged-in student's SIMULATED student record (demo accounts made by
// backend/seed_students.py). Hidden for accounts without a record. The chatbot's agent
// reads the same record through its tools.

const IdIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="11" r="2.5" />
    <path d="M5.5 17c.6-1.8 2-2.8 3.5-2.8s2.9 1 3.5 2.8" />
    <line x1="15" y1="10" x2="19" y2="10" />
    <line x1="15" y1="14" x2="19" y2="14" />
  </svg>
);

const QUESTIONS = [
  "What should I register next semester?",
  "Am I on track to graduate? What is left?",
  "What grade do I need this semester to raise my CGPA?",
];

export default function StudentRecord({ onAsk, disabled }) {
  const [record, setRecord] = useState(null);
  const [open, setOpen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [pos, setPos] = useState({ top: 64, right: 16 });
  const wrapperRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    api.getMyRecord().then(setRecord).catch(() => setRecord(null));
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      const inside = (r) => r.current && r.current.contains(e.target);
      if (!inside(wrapperRef) && !inside(panelRef)) setOpen(false);
    }
    function onEsc(e) { if (e.key === "Escape") setOpen(false); }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onEsc);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (!record) return null;

  const probation = /probation/i.test(record.standing);
  const terms = [];
  for (const t of record.transcript) {
    let g = terms.find((x) => x.term === t.term);
    if (!g) { g = { term: t.term, items: [] }; terms.push(g); }
    g.items.push(t);
  }
  const ask = (q) => {
    if (!onAsk || disabled) return;
    setOpen(false);
    onAsk(q);
  };
  const rows = [
    ["Program", record.program],
    ["Study mode", `${record.level === "masters" ? "Master's" : "Bachelor's"} · ${record.study_mode}`],
    ["Admission", record.admission],
    ["Started", record.start_term],
    ["Advisor", record.advisor],
    record.supervisor && ["Thesis supervisor", record.supervisor],
  ].filter(Boolean);

  return (
    <div ref={wrapperRef}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerActive : ""}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 10, right: Math.max(16, window.innerWidth - r.right) });
          setOpen((v) => !v);
        }}
        title="My student record"
        aria-label="Open my student record"
        aria-expanded={open}
      >
        <IdIcon />
      </button>

      {open && createPortal(
        <div className={styles.panel} role="dialog" aria-label="My student record" ref={panelRef}
          style={{ top: pos.top, right: pos.right, maxHeight: `calc(100vh - ${pos.top + 16}px)` }}>
          <div className={styles.head}>
            <div>
              <p className={styles.name}>{record.name}</p>
              <p className={styles.sub}>{record.student_id} · {record.current_term}</p>
            </div>
            <span className={styles.demoTag} title="Made-up data for the demo, not a real student">Simulated</span>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{record.cgpa ?? "–"}</span>
              <span className={styles.statLabel}>CGPA</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>
                {record.credit_hours_passed}{record.total_credit_hours ? <small>/{record.total_credit_hours}</small> : null}
              </span>
              <span className={styles.statLabel}>Credit hours passed</span>
            </div>
          </div>
          <p className={`${styles.standing} ${probation ? styles.standingWarn : ""}`}>{record.standing}</p>

          <dl className={styles.facts}>
            {rows.map(([k, v]) => (
              <div key={k} className={styles.fact}><dt>{k}</dt><dd>{v || "–"}</dd></div>
            ))}
          </dl>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Registered this term</p>
            {record.registered.length === 0 ? <p className={styles.muted}>Nothing registered.</p> : (
              <ul className={styles.courses}>
                {record.registered.map((c) => (
                  <li key={c.key}><span className={styles.code}>{c.code}</span> {c.title}<span className={styles.cr}>{c.credits} cr</span></li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.section}>
            <button className={styles.toggle} onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript}>
              {showTranscript ? "▾" : "▸"} Transcript ({record.transcript.length} courses)
            </button>
            {showTranscript && terms.map((t) => (
              <div key={t.term}>
                <p className={styles.term}>{t.term}</p>
                <ul className={styles.courses}>
                  {t.items.map((c, i) => (
                    <li key={c.key + i}>
                      <span className={styles.code}>{c.code}</span> {c.title}
                      <span className={`${styles.grade} ${c.passed || ["IP", "P"].includes(c.grade) ? "" : styles.gradeFail}`}>{c.grade}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {record.notes && <p className={styles.notes}>{record.notes}</p>}

          {onAsk && (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Ask Mosaed about your record</p>
              {QUESTIONS.map((q) => (
                <button key={q} className={styles.askBtn} onClick={() => ask(q)} disabled={disabled}>{q}</button>
              ))}
            </div>
          )}
          <p className={styles.foot}>Demo account: this record is made-up data standing in for the university's student system.</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
