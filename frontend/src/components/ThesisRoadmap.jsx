import { useState, useEffect, useRef } from "react";
import styles from "./ThesisRoadmap.module.css";

// Thesis Roadmap for thesis-based Master's students.
// Sources: "Roadmap Master" (College of Graduate Studies, updated 8 January 2026)
// and the Master's Executive Regulations. Keep this text in line with those documents.

const FORM = "https://forms.office.com/Pages/ResponsePage.aspx?id=ui664CVUm02yS_D0hFvPYvF7omSkzlFDoKOGl9hFtS9";

const STEPS = [
  {
    title: "Register your courses",
    when: "First semester",
    who: "Student",
    points: [
      "Full-time: 9–12 credit hours. Part-time: 0–8. Research and teaching assistants: 6–9.",
      "Need fewer or more hours? Apply through E-services (register underloaded/overloaded).",
    ],
    ask: "How many credit hours should I register in my first semester of the master's?",
  },
  {
    title: "Register your thesis proposal",
    when: "Second semester (remedial semesters not counted)",
    who: "Department submits G12A",
    points: [
      "You need a GPA of at least 3.0, all remedial courses completed and the English language requirement met.",
      "The English roadmap also asks for at least one master's-level course in your first semester. The Arabic roadmap says after passing 50% of your courses (about 12 credit hours), so check with your department.",
      "Use the College of Graduate Studies thesis writing template.",
    ],
    forms: [{ code: "G12A", name: "Thesis proposal approval", url: `${FORM}UOUFPWk1BTlQ2TTZNVVY3RlQwNTNYNkJVUS4u` }],
    ask: "What are the conditions to register my thesis proposal?",
  },
  {
    title: "Thesis credits are registered",
    when: "Same semester the proposal is approved",
    who: "Registration Department",
    points: [
      "After the Dean of Graduate Studies approves G12A, 3 thesis credit hours are registered for you.",
    ],
    ask: "When are my thesis credit hours registered?",
  },
  {
    title: "Register the remaining thesis credits",
    when: "Following semester(s)",
    who: "Student",
    points: [
      "Register the remaining 6 thesis credit hours.",
      "Keep re-registering the thesis for zero credit hours every semester until you defend.",
    ],
    ask: "Do I need to register my thesis every semester until the defense?",
  },
  {
    title: "Publish a research paper",
    when: "Before the defense",
    who: "Supervisor submits G21",
    points: [
      "At least one peer-reviewed journal or conference paper, with you as primary author and your supervisor as co-author.",
      "After the paper is accepted or published, your supervisor submits G21. It is the only form the supervisor must submit personally.",
    ],
    forms: [{ code: "G21", name: "Evaluation of published research paper", url: `${FORM}UNTBPR1JGTURGRFJUMEtXN0czVkFHOUhRSS4u` }],
    ask: "What are the publication requirements before my thesis defense?",
  },
  {
    title: "Complete your scientific portfolio",
    when: "Before the defense",
    who: "Student (IDs starting U221 or later)",
    points: ["Also register for an ORCID iD before the defense."],
    links: [
      { name: "Portfolio form", url: "https://www.sharjah.ac.ae/-/media/project/uos/sites/uos/graduate-studies/graduate-studies-documentation/portfolio_msc.docx" },
      { name: "Portfolio circular", url: "https://www.sharjah.ac.ae/en/Research/gs/Documents/portfolio.pdf" },
    ],
    ask: "Do I need a scientific portfolio before my thesis defense?",
  },
  {
    title: "Defend your thesis",
    when: "At least one semester after proposal approval",
    who: "Department submits G16A",
    points: [
      "Before you defend: CGPA of 3.0 or more, all compulsory and elective courses passed, ORCID, portfolio and the published paper.",
      "The department submits G16A at least 3 weeks before the defense date.",
    ],
    forms: [{ code: "G16A", name: "Defense committee nomination", url: `${FORM}URUo1WENIUDhHWFJOV0k2R0tFQ0IwQllUMi4u` }],
    ask: "What do I need before I can defend my master's thesis?",
  },
  {
    title: "Defense decision",
    when: "Within 48 hours after the defense",
    who: "Department submits G17",
    points: [
      "Pass with minor modifications (G17A): up to 3 months to make the changes.",
      "No Pass (G17B): see the results box below. After you address all comments, the department submits G17C.",
    ],
    forms: [
      { code: "G17A", name: "Pass with minor revisions", url: `${FORM}UNEhWVlVJUzdaVlE0QVFXQ04zMEwwTlRTTy4u` },
      { code: "G17B", name: "No-Pass decision", url: `${FORM}URFNBVUlQUEpSVTdPM0lKUVJWOFdGTkNFTi4u&route=shorturl` },
      { code: "G17C", name: "No-Pass comments addressed", url: `${FORM}UN0xSSVg3RjBGRlZUWEE1U0ZEMTI2Vk9PSi4u&route=shorturl` },
    ],
    ask: "What happens if I get a No Pass in my thesis defense?",
  },
  {
    title: "Graduate",
    when: "After the examiners' comments are addressed",
    who: "Department submits G23A",
    points: ["The department recommends awarding the degree once your revised thesis meets the examiners' comments."],
    forms: [{ code: "G23A", name: "Recommendation to award the degree", url: `${FORM}UMjE0S1dHMTlHUzIwNTRYVEdLWlFWNzRSWi4u` }],
    ask: "What happens after I address the examiners' comments on my thesis?",
  },
];

const RouteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
    <path d="M22 10 12 5 2 10l10 5 10-5z" />
    <path d="M6 12v5c3 2 9 2 12 0v-5" />
  </svg>
);

export default function ThesisRoadmap({ onAsk, disabled }) {
  const [open, setOpen] = useState(false);
  const [openStep, setOpenStep] = useState(0);
  const wrapperRef = useRef(null);

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

  const ask = (question) => {
    if (!onAsk || disabled) return;
    setOpen(false);
    onAsk(question);
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerActive : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Thesis Roadmap (Master's)"
        aria-label="Open thesis roadmap"
        aria-expanded={open}
      >
        <RouteIcon />
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Thesis Roadmap">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Thesis Roadmap · Master's</span>
            <span className={styles.panelSub}>9 steps from first semester to graduation</span>
          </div>

          <ol className={styles.steps}>
            {STEPS.map((s, i) => {
              const isOpen = openStep === i;
              return (
                <li key={s.title} className={`${styles.step} ${isOpen ? styles.stepOpen : ""}`}>
                  <button
                    type="button"
                    className={styles.stepHead}
                    onClick={() => setOpenStep(isOpen ? -1 : i)}
                    aria-expanded={isOpen}
                  >
                    <span className={styles.num}>{i + 1}</span>
                    <span className={styles.stepText}>
                      <span className={styles.stepTitle}>{s.title}</span>
                      <span className={styles.stepWhen}>{s.when}</span>
                    </span>
                    {s.forms && <span className={styles.formTag}>{s.forms.map((f) => f.code).join(" · ")}</span>}
                  </button>

                  {isOpen && (
                    <div className={styles.stepBody}>
                      <p className={styles.who}>Who: {s.who}</p>
                      <ul className={styles.points}>
                        {s.points.map((p) => <li key={p}>{p}</li>)}
                      </ul>
                      {s.forms && (
                        <div className={styles.links}>
                          {s.forms.map((f) => (
                            <a key={f.code} href={f.url} target="_blank" rel="noreferrer" className={styles.formLink}>
                              <b>{f.code}</b> {f.name} ↗
                            </a>
                          ))}
                        </div>
                      )}
                      {s.links && (
                        <div className={styles.links}>
                          {s.links.map((l) => (
                            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={styles.formLink}>
                              {l.name} ↗
                            </a>
                          ))}
                        </div>
                      )}
                      {onAsk && (
                        <button type="button" className={styles.askBtn} onClick={() => ask(s.ask)} disabled={disabled}>
                          Ask Mosaed about this step
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className={styles.box}>
            <p className={styles.boxTitle}>Defense results</p>
            <ul className={styles.points}>
              <li>No pass for thesis: submit a revised thesis within 6 months.</li>
              <li>No pass for oral defense (first time): re-defend within 3–6 months, no revised thesis needed.</li>
              <li>No pass for both: submit a revised thesis within 3–6 months.</li>
              <li>A second No Pass of any kind means withdrawal from the program.</li>
            </ul>
          </div>

          <div className={styles.box}>
            <p className={styles.boxTitle}>Running out of time?</p>
            <ul className={styles.points}>
              <li>Maximum duration: 8 semesters full-time, 10 part-time (postponements not counted).</li>
              <li>If it ends before your defense, submit the Extension for Thesis Defense Purposes form through E-services right after your last semester: up to 2 more semesters, fees apply.</li>
            </ul>
          </div>

          <p className={styles.note}>
            Forms other than G21 can be submitted by the admin assistant, program coordinator or supervisor.
            Source: Roadmap for Master's students (updated 8 Jan 2026) and the Master's Executive Regulations.
          </p>
        </div>
      )}
    </div>
  );
}
