import { useState, useRef, useEffect } from "react";
import { IconArrowUp } from "./icons";
import styles from "./ChatInput.module.css";

// Two-row composer: the question on top, the send button underneath.
export default function ChatInput({ onSend, disabled, showDisclaimer = true }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef(null);

  // Auto-resize up to 200 px; beyond that it scrolls.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  // Enter submits; Shift+Enter inserts a newline (standard chat convention).
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) handleSubmit(e);
  };

  const ready = text.trim().length > 0 && !disabled;

  return (
    <div className={styles.wrapper}>
      <div className={styles.center} data-enter="composer">
        <form className={styles.form} onSubmit={handleSubmit} data-focused={focused || undefined}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={disabled ? "Mosaed is answering…" : "Ask anything about your studies…"}
            rows={1}
            disabled={disabled}
            aria-label="Ask Mosaed a question. Enter to send, Shift and Enter for a new line"
          />

          <div className={styles.toolbar}>
            <button
              type="submit"
              className={`${styles.sendBtn} ${ready ? styles.ready : ""}`}
              disabled={!ready}
              aria-label={disabled ? "Mosaed is answering" : "Send"}
              title={ready ? "Send (Enter)" : undefined}
            >
              {disabled ? <span className={styles.spinner} /> : <IconArrowUp size={16} />}
            </button>
          </div>
        </form>
        {showDisclaimer && (
          <p className={styles.disclaimer}>
            Mosaed can make mistakes. Check important details with your advisor or the university website.
          </p>
        )}
      </div>
    </div>
  );
}
