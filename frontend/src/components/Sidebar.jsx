import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { openMap } from "../utils/mapLinks";
import NavItem, { SidebarContext } from "./NavItem";
import ThesisRoadmap from "./ThesisRoadmap";
import CalendarWidget from "./CalendarWidget";
import {
  IconNewChat, IconSearch, IconPanelLeft, IconMap, IconTrash, IconDegree,
  IconSun, IconMoon, IconLogout, IconChevronUpDown,
} from "./icons";
import styles from "./Sidebar.module.css";

// ── Date grouping ─────────────────────────────────────────────────────────────
function groupSessions(sessions) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);
  const groups = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const s of sessions) {
    const d = new Date(s.updated_at);
    if (d >= startOfToday) groups.Today.push(s);
    else if (d >= startOfYesterday) groups.Yesterday.push(s);
    else if (d >= startOfWeek) groups["Previous 7 days"].push(s);
    else groups.Older.push(s);
  }
  return groups;
}

// Falls back to the email prefix if the user has no display name set.
function getInitials(user) {
  const name = user?.name || user?.email || "U";
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function SessionRow({ session, isActive, onSelect, onDelete }) {
  return (
    <div
      className={`${styles.sessionRow} ${isActive ? styles.sessionActive : ""}`}
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(session.id)}
    >
      <span className={styles.sessionTitle}>{session.title}</span>
      <button
        className={styles.deleteBtn}
        onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
        aria-label={`Delete "${session.title}"`}
        title="Delete chat"
      >
        <IconTrash size={14} />
      </button>
    </div>
  );
}

export default function Sidebar({
  sessions, activeSessionId,
  onSelect, onNewChat, onDelete,
  isOpen, onToggle, onSearch,
  onAsk, busy,
  onOpenDegree, degreeActive, mapActive,
}) {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const menuRef = useRef(null);      // profile button area
  const menuPanelRef = useRef(null); // the menu itself (drawn in <body>)
  // Simulated student record (demo accounts); null for normal accounts. Only used here to
  // hide the Thesis Roadmap for bachelor's students; "My degree" loads its own copy.
  const [record, setRecord] = useState(null);

  useEffect(() => {
    if (!user) { setRecord(null); return; }
    api.getMyRecord().then(setRecord).catch(() => setRecord(null));
  }, [user]);

  useEffect(() => {
    function onOutside(e) {
      const inside = (r) => r.current && r.current.contains(e.target);
      if (!inside(menuRef) && !inside(menuPanelRef)) setMenuOpen(false);
    }
    function onEsc(e) { if (e.key === "Escape") setMenuOpen(false); }
    if (menuOpen) {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onEsc);
    }
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  const logoSrc = isDark ? "/mosaed-logo-dark-transparent.png" : "/mosaed-logo-light-transparent.png";
  const groups = groupSessions(sessions);
  const collapsed = !isOpen;

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      {/* data-enter / --i: the welcome animation after sign-in (ChatPage.module.css) */}
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`} data-enter="sidebar">

        <div className={styles.top} data-enter="side-item" style={{ "--i": 0 }}>
          <div className={styles.brand}>
            <img src={logoSrc} alt="" className={styles.brandMark} />
            <span className={styles.brandName}>Mosaed</span>
          </div>
          <button
            className={styles.iconBtn}
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconPanelLeft />
          </button>
        </div>

        <div className={styles.group} data-enter="side-item" style={{ "--i": 1 }}>
          <NavItem variant="primary" icon={<IconNewChat />} label="New chat" onClick={onNewChat} />
          <NavItem icon={<IconSearch />} label="Search chats" onClick={onSearch} shortcut="Ctrl K" />
        </div>

        <div className={styles.group} data-enter="side-item" style={{ "--i": 2 }}>
          <span className={styles.groupLabel}>Your studies</span>
          {/* Student record + study plan, as one page in place of the chat */}
          <NavItem
            icon={<IconDegree />}
            label="My degree"
            active={degreeActive}
            onClick={onOpenDegree}
            aria-current={degreeActive ? "page" : undefined}
          />
          {/* The Thesis Roadmap is for Master's students: hidden when the record says Bachelor's */}
          {record?.level !== "bachelors" && <ThesisRoadmap onAsk={onAsk} disabled={busy} />}
          <CalendarWidget />
          {/* The 3D campus map, as a page in place of the chat */}
          <NavItem
            icon={<IconMap />}
            label="Campus map"
            active={mapActive}
            onClick={() => openMap("")}
            aria-current={mapActive ? "page" : undefined}
          />
        </div>

        <div className={styles.history} data-enter="side-item" style={{ "--i": 3 }}>
          {sessions.length > 0 && Object.entries(groups).map(([groupName, items]) =>
            items.length === 0 ? null : (
              <div key={groupName} className={styles.historyGroup}>
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
          {sessions.length === 0 && (
            <p className={styles.emptyHint}>Your chats will appear here.</p>
          )}
        </div>

        {user && (
          <div className={styles.foot} ref={menuRef} data-enter="side-item" style={{ "--i": 4 }}>
            {/* Drawn in <body> so the sidebar's rounded, clipped edges cannot cut it off */}
            {menuOpen && menuPos && createPortal(
              <div className={styles.menu} role="menu" ref={menuPanelRef} style={menuPos}>
                <div className={styles.menuHead}>
                  <p className={styles.menuName}>{user.name || user.email}</p>
                  <p className={styles.menuSub}>{user.email}</p>
                </div>
                <button className={styles.menuItem} role="menuitem" onClick={toggleTheme}>
                  {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
                  {isDark ? "Light mode" : "Dark mode"}
                </button>
                <div className={styles.menuDivider} />
                <button
                  className={`${styles.menuItem} ${styles.menuDanger}`}
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); logout(); }}
                >
                  <IconLogout size={16} /> Log out
                </button>
              </div>,
              document.body,
            )}
            <button
              className={styles.profile}
              onClick={(e) => {
                // Expanded: open above the profile row, same width. Collapsed: open beside the rail.
                const r = e.currentTarget.getBoundingClientRect();
                const side = e.currentTarget.closest("aside").getBoundingClientRect();
                setMenuPos(collapsed
                  ? { left: side.right + 10, bottom: window.innerHeight - r.bottom, width: 240 }
                  : { left: r.left, bottom: window.innerHeight - r.top + 6, width: r.width });
                setMenuOpen((v) => !v);
              }}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              title={collapsed ? (user.name || user.email) : undefined}
            >
              <span className={styles.avatar}>{getInitials(user)}</span>
              <span className={styles.who}>
                <span className={styles.whoName}>{user.name || user.email}</span>
                <span className={styles.whoSub}>University of Sharjah</span>
              </span>
              <span className={styles.chev}><IconChevronUpDown size={16} /></span>
            </button>
          </div>
        )}
      </aside>
    </SidebarContext.Provider>
  );
}
