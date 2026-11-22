import { useEffect, useRef, useState } from "react";
import { MAP_PAGE } from "../utils/mapLinks";
import { IconChat, IconExternal } from "../components/icons";
import styles from "./MapPage.module.css";

// The 3D campus map as a page in place of the chat (#map), like "My degree".
// The map itself is its own document (public/campus-map/), shown in a frame that fills the page.
// After the first visit the frame stays loaded (hidden) so the 12 MB model is not fetched again;
// a new place only changes the frame's #hash.
//
// place = { hash, n }: n changes on every request, so asking for the same place again re-centres it.
export default function MapPage({ visible, place, onClose }) {
  const frameRef = useRef(null);
  const [src] = useState(() => MAP_PAGE + (place?.hash ? "#" + place.hash : ""));
  const [entering, setEntering] = useState(true);
  const firstPlace = useRef(place?.n);

  // Every time the page is shown again, replay the short entrance
  useEffect(() => {
    if (visible) setEntering(true);
  }, [visible]);

  // A new place while the map is already loaded: move the map there
  useEffect(() => {
    if (!place || place.n === firstPlace.current || !place.hash) return;
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    try {
      const base = win.location.pathname + win.location.search;
      if (decodeURIComponent(win.location.hash.slice(1)) === place.hash) {
        // same place as the map shows: clear and set again so the map flies back to it
        win.history.replaceState(null, "", base);
      }
      // replace, not assign: the frame shares the tab's history, and a pushed entry would make
      // the browser's Back button step through map places instead of returning to the chat
      win.location.replace(base + "#" + place.hash);
    } catch { /* frame not ready yet; its own load reads the hash from src */ }
  }, [place]);

  // Esc goes back to the chat. Pressed inside the map, the map forwards it (see campus-map.html).
  useEffect(() => {
    if (!visible) return;
    function onKey(e) {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) onClose();
    }
    function onMessage(e) {
      if (e.origin === window.location.origin && e.data?.type === "mosaed:map-escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
    };
  }, [visible, onClose]);

  // Focus the map when the page opens, so keyboard and wheel input go straight to it
  useEffect(() => {
    if (visible) frameRef.current?.focus();
  }, [visible]);

  function openInNewTab() {
    let href = src;
    try { href = frameRef.current.contentWindow.location.href; } catch { /* use src */ }
    window.open(href, "_blank", "noopener");
  }

  return (
    <section
      className={`${styles.page} ${entering && visible ? styles.entering : ""}`}
      hidden={!visible}
      aria-label="Campus map"
      onAnimationEnd={(e) => e.target === e.currentTarget && setEntering(false)}
    >
      <iframe
        ref={frameRef}
        className={styles.frame}
        src={src}
        title="University of Sharjah campus map"
        allow="clipboard-write"
      />

      <div className={styles.controls}>
        <h2 className={styles.title}>Campus map</h2>
        <button type="button" className={styles.iconBtn} onClick={openInNewTab}
          aria-label="Open the map in a new tab" title="Open in a new tab">
          <IconExternal size={15} />
        </button>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Back to the chat">
          <IconChat size={15} /> Chat <kbd className={styles.closeKey}>Esc</kbd>
        </button>
      </div>
    </section>
  );
}
