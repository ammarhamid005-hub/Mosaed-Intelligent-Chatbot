import { useState, useRef, useEffect } from "react";
import styles from "./ChatInput.module.css";

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  // Auto-resize textarea up to 160 px; beyond that it scrolls internally.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  // Enter submits; Shift+Enter inserts a newline (standard chat convention).
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) handleSubmit(e);
  };

  const hasText = text.trim().length > 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.center}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask Mosaed a question"
          rows={1}
          disabled={disabled}
          aria-label="Chat input"
        />
        <button
          type="submit"
          className={`${styles.sendBtn} ${hasText && !disabled ? styles.sendBtnActive : ""}`}
          disabled={disabled || !hasText}
          aria-label="Send message"
        >
          {disabled ? <span className={styles.spinner} /> : <SendIcon />}
        </button>
      </form>
      </div>
    </div>
  );
}
