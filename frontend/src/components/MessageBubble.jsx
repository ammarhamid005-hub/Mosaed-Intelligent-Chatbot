import { useState, useEffect, useRef } from "react";
import styles from "./MessageBubble.module.css";

// Typewriter speed: 5 chars every 16 ms ≈ ~300 chars/sec, smooth at 60 fps.
const CHARS_PER_FRAME = 5;
const FRAME_MS = 16;

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const shouldAnimate = !isUser && !!message.animate;

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
    <div className={`${styles.row} ${isUser ? styles.userRow : styles.assistantRow}`}>
      {/* Content */}
      <div className={styles.content}>
        <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.botBubble}`}>
          <span className={styles.text}>
            {displayed}
            {isTyping && <span className={styles.cursor} aria-hidden="true" />}
          </span>
        </div>
      </div>
    </div>
  );
}
