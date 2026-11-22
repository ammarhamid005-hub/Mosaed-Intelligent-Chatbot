import { createContext, useContext } from "react";
import styles from "./NavItem.module.css";

// Sidebar row (icon + label). When the sidebar is collapsed to its icon rail the label is
// hidden and shown as a tooltip instead. The tools (record, study plan, thesis roadmap,
// calendar) render their own NavItem so each keeps its panel logic in one file.

export const SidebarContext = createContext({ collapsed: false });

export default function NavItem({ icon, label, active, onClick, badge, shortcut, variant, ...rest }) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <button
      type="button"
      className={`${styles.item} ${active ? styles.active : ""} ${variant === "primary" ? styles.primary : ""} ${collapsed ? styles.collapsed : ""}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      {...rest}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
      {badge != null && <span className={styles.badge}>{badge}</span>}
      {shortcut && <kbd className={styles.kbd}>{shortcut}</kbd>}
    </button>
  );
}

// Where a tool's panel opens: just right of the sidebar, level with the row that opened it,
// kept inside the window.
export function sidePanelPosition(el, panelHeight = 560) {
  const row = el.getBoundingClientRect();
  const side = el.closest("aside")?.getBoundingClientRect() ?? row;
  const top = Math.max(12, Math.min(row.top - 8, window.innerHeight - panelHeight - 12));
  return { top, left: side.right + 10 };
}
