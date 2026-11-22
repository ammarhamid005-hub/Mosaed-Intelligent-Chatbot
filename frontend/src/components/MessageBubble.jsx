import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { loadMapIndex, findMapLinks, openMap } from "../utils/mapLinks";
import { loadScheduleIndex, findPerson, openSchedule, officeStatus, officeStatusText } from "../utils/schedules";
import { IconCalendar, IconPin, IconArrowRight, IconCopy, IconCheck } from "./icons";
import styles from "./MessageBubble.module.css";

// Typewriter speed: 5 chars every 16 ms ≈ ~300 chars/sec, smooth at 60 fps.
const CHARS_PER_FRAME = 5;
const FRAME_MS = 16;

// Collapsed "Sources" line under a bot answer; click the arrow to see where it came from.
function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className={styles.sources}>
      <button
        type="button"
        className={styles.sourcesToggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{sources.length === 1 ? "1 source" : `${sources.length} sources`}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden="true">›</span>
      </button>
      {open && (
        <ol className={styles.sourcesList}>
          {sources.map((s, i) => (
            <li key={s.id || i} className={styles.sourceItem}>
              <div className={styles.sourceTitle} dir="auto">
                {s.title}
                {s.section && <span className={styles.sourceSection}> · {s.section}</span>}
              </div>
              {s.excerpt && <div className={styles.sourceExcerpt} dir="auto">{s.excerpt}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// One action card under an answer: icon tile, what it is, what it does, and an arrow.
function ActionCard({ icon, title, detail, onClick, hint }) {
  return (
    <button type="button" className={styles.action} onClick={onClick} title={hint}>
      <span className={styles.actionIcon}>{icon}</span>
      <span className={styles.actionText}>
        <span className={styles.actionTitle}>{title}</span>
        <span className={styles.actionDetail}>{detail}</span>
      </span>
      <span className={styles.actionArrow} aria-hidden="true"><IconArrowRight size={15} /></span>
    </button>
  );
}

// Follow-ups for what an answer mentions: the instructor's timetable and the places on the map.
function AnswerActions({ text }) {
  const [person, setPerson] = useState(null);
  const [links, setLinks] = useState([]);
  useEffect(() => {
    let alive = true;
    loadScheduleIndex().then((people) => { if (alive) setPerson(findPerson(text, people)); });
    if (/\bA(\d|-P)/.test(text || "")) {
      loadMapIndex().then((index) => { if (alive) setLinks(findMapLinks(text, index)); });
    }
    return () => { alive = false; };
  }, [text]);
  if (!person && links.length === 0) return null;
  return (
    <div className={styles.actions}>
      {person && (
        <ActionCard
          icon={<IconCalendar size={16} />}
          title={person.name}
          detail={officeStatusText(officeStatus(person.schedule))}
          onClick={() => openSchedule(person)}
          hint="Open the weekly timetable"
        />
      )}
      {links.map((l) => (
        <ActionCard
          key={l.label}
          icon={<IconPin size={16} />}
          title={/^A9-/.test(l.label) ? `Room ${l.label}` : l.label}
          detail="Show on the campus map"
          onClick={() => openMap(l.hash)}
          hint={l.title}
        />
      ))}
    </div>
  );
}

// Copy a question to ask it again or elsewhere. Shows "Copied" briefly, then resets.
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Clipboard API blocked (permissions, embedded browsers): fall back to a hidden textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
    }
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button
      type="button"
      className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy question"}
    >
      <span className={styles.copyIcon} key={copied ? "y" : "n"}>
        {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
      </span>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const shouldAnimate = !isUser && !!message.animate;
  // Only messages created in this visit animate in; history loaded from a past chat appears at once.
  const isNew = !!message.tempId || !!message.animate;

  const [displayed, setDisplayed] = useState(shouldAnimate ? "" : message.content);
  const [isTyping, setIsTyping] = useState(shouldAnimate);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!shouldAnimate) return;
    const full = message.content;
    let i = 0;

    intervalRef.current = setInterval(() => {
      i = Math.min(i + CHARS_PER_FRAME, full.length);
      setDisplayed(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(intervalRef.current);
        setIsTyping(false);
      }
    }, FRAME_MS);

    return () => clearInterval(intervalRef.current);
  // Intentionally empty deps: the animation runs once when the bubble mounts.
  // Adding `message.content` would restart the animation on every re-render.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`${styles.row} ${isUser ? styles.userRow : styles.assistantRow} ${isNew ? styles.enter : ""}`}>
      {/* Content */}
      <div className={styles.content}>
        <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.botBubble}`}>
          {isUser ? (
            <span className={styles.text} dir="auto">{displayed}</span>
          ) : (
            <div className={`${styles.text} ${styles.markdown}`} dir="auto">
              <ReactMarkdown>{displayed}</ReactMarkdown>
              {isTyping && <span className={styles.cursor} aria-hidden="true" />}
            </div>
          )}
        </div>
        {isUser && <CopyButton text={message.content} />}
        {!isUser && !isTyping && <AnswerActions text={message.content} />}
        {!isUser && !isTyping && <Sources sources={message.sources} />}
      </div>
    </div>
  );
}