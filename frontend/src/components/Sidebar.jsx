import { useTheme } from "../context/ThemeContext";
import styles from "./Sidebar.module.css";

// ── Icons ────────────────────────────────────────────────────────────────────
const HamburgerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const ChatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 2h10a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H8l-2 2-2-2H2a.5.5 0 0 1-.5-.5v-6A.5.5 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M11.5 3.5l-.7 8a.5.5 0 0 1-.5.5H3.7a.5.5 0 0 1-.5-.5l-.7-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Date grouping ─────────────────────────────────────────────────────────────
// Buckets sessions by recency so the sidebar matches the ChatGPT-style layout.
function groupSessions(sessions) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);
  const groups = { Today: [], Yesterday: [], "This week": [], Older: [] };
  for (const s of sessions) {
    const d = new Date(s.updated_at);
    if (d >= startOfToday) groups.Today.push(s);
    else if (d >= startOfYesterday) groups.Yesterday.push(s);
    else if (d >= startOfWeek) groups["This week"].push(s);
    else groups.Older.push(s);
  }
  return groups;
}

// ── Session row ───────────────────────────────────────────────────────────────
function SessionRow({ session, isActive, onSelect, onDelete }) {
  return (
    <div
      className={`${styles.sessionRow} ${isActive ? styles.sessionActive : ""}`}
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(session.id)}
    >
      <span className={styles.sessionIcon}><ChatIcon /></span>
      <span className={styles.sessionTitle}>{session.title}</span>
      <button
        className={styles.deleteBtn}
        onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
        aria-label="Delete"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar({
  sessions, activeSessionId,
  onSelect, onNewChat, onDelete,
  isOpen, onToggle, onSearch,
}) {
  const { isDark } = useTheme();
  const logoSrc = isDark ? "/mosaed-logo-dark-transparent.png" : "/mosaed-logo-light-transparent.png";

  const groups = groupSessions(sessions);

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}>

      {/* Top: brand + hamburger */}
      <div className={styles.sideTop}>
        <div className={styles.brand}>
          <img src={logoSrc} alt="Mosaed" className={styles.brandMark} />
          <span className={styles.brandName}>Mosaed</span>
        </div>
        <button className={styles.iconBtn} onClick={onToggle} aria-label="Toggle sidebar">
          <HamburgerIcon />
        </button>
      </div>

      {/* Actions */}
      <div className={styles.sideActions}>
        <button className={`${styles.sideItem} ${styles.primary}`} onClick={onNewChat}>
          <span className={styles.ic}><PlusIcon /></span>
          <span className={styles.label}>New chat</span>
        </button>
        <button className={styles.sideItem} onClick={onSearch}>
          <span className={styles.ic}><SearchIcon /></span>
          <span className={styles.label}>Search chats</span>
        </button>
      </div>

      {/* Scrollable session list */}
      <div className={styles.sideScroll}>
        {Object.entries(groups).map(([groupName, items]) =>
          items.length === 0 ? null : (
            <div key={groupName} className={styles.chatGroup}>
              <span className={styles.groupLabel}>{groupName}</span>
              {items.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  isActive={s.id === activeSessionId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div className={styles.sideFoot}>
        <span className={styles.footText}>University of Sharjah</span>
      </div>
    </aside>
  );
}
