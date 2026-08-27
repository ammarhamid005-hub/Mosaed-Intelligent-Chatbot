import { useState, useEffect, useRef } from "react";
import styles from "./SearchModal.module.css";

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const ChatIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M2 2.5h11a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H9l-2 2-2-2H2a.5.5 0 0 1-.5-.5V3A.5.5 0 0 1 2 2.5z"
      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
);

function relativeDate(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Past week";
  if (diffDays <= 30) return "Past month";
  return "Past year";
}

export default function SearchModal({ sessions, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = sessions.filter((s) =>
    s.title.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const item = listRef.current?.children[activeIdx];
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Full keyboard navigation: Escape closes, arrows move highlight, Enter selects.
  const handleKey = (e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && filtered[activeIdx]) {
      onSelect(filtered[activeIdx].id);
      onClose();
    }
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>

        <div className={styles.searchRow}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search chats and projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.results} ref={listRef}>
          {filtered.length === 0 ? (
            <p className={styles.empty}>No chats found</p>
          ) : (
            filtered.map((s, i) => (
              <div
                key={s.id}
                className={`${styles.item} ${i === activeIdx ? styles.itemActive : ""}`}
                onClick={() => { onSelect(s.id); onClose(); }}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className={styles.chatIcon}><ChatIcon /></span>
                <span className={styles.title}>{s.title}</span>
                <span className={styles.date}>{relativeDate(s.updated_at)}</span>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
