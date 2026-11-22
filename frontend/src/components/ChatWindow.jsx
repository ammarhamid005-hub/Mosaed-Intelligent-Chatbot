import { Fragment, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import styles from "./ChatWindow.module.css";

// Within this distance of the bottom counts as "at the bottom", so a small nudge of the
// wheel doesn't stop the chat from following the answer.
const STICK_PX = 120;

export default function ChatWindow({ messages, isLoading, isEmpty }) {
  const bottomRef = useRef(null);
  const windowRef = useRef(null);
  const innerRef = useRef(null);
  // Follow the bottom while an answer types out, until the reader scrolls up to read.
  const stick = useRef(true);
  const { isDark } = useTheme();
  const { user } = useAuth();
  const logo = isDark ? "/mosaed-logo-dark.png" : "/mosaed-logo.png";
  const firstName = user?.name ? user.name.split(" ")[0] : "";
  const heading = firstName ? `Hey ${firstName}, how can I help you today?` : "How can I help you today?";

  // A new message (sent or received) always brings the view down and re-attaches it.
  useEffect(() => {
    stick.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // As the answer grows line by line, keep its newest line in view while attached.
  // Instant (not smooth) jumps, because the text grows every frame and smooth scrolls would lag behind.
  useEffect(() => {
    const win = windowRef.current, inner = innerRef.current;
    if (!win || !inner) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) win.scrollTop = win.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // Scrolling up detaches; scrolling back near the bottom re-attaches. Only an upward move
  // detaches, so our own smooth scroll down (which passes far-from-bottom positions) never does.
  const lastTop = useRef(0);
  const onScroll = () => {
    const win = windowRef.current;
    if (!win) return;
    const nearBottom = win.scrollHeight - win.scrollTop - win.clientHeight < STICK_PX;
    if (nearBottom) stick.current = true;
    else if (win.scrollTop < lastTop.current - 2) stick.current = false;
    lastTop.current = win.scrollTop;
  };

  return (
    <div className={styles.window} id="chat-window" ref={windowRef} onScroll={onScroll}>

      {/* Landing hero — fades out when messages appear */}
      <div className={`${styles.empty} ${!isEmpty ? styles.emptyHidden : ""}`}
        aria-hidden={!isEmpty}>
        <img src={logo} alt="Mosaed" className={styles.emptyLogo} data-enter="logo" />
        {/* one span per word, so the welcome animation can bring the words in one after another */}
        <h2 className={styles.emptyHeading}>
          {heading.split(" ").map((w, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span data-enter="word" style={{ "--i": i }}>{w}</span>
            </Fragment>
          ))}
        </h2>
      </div>

      {/* Scrollable messages */}
      <div className={styles.inner} ref={innerRef}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id || msg.tempId} message={msg} />
        ))}

        {/* Sits where the answer's first line will start, so the answer replaces it in place */}
        {isLoading && (
          <div className={styles.thinking} role="status" aria-live="polite">
            <span className={styles.thinkingText}>Thinking</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
