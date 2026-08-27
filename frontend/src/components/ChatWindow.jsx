import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import styles from "./ChatWindow.module.css";

export default function ChatWindow({ messages, isLoading, isEmpty }) {
  const bottomRef = useRef(null);
  const { isDark } = useTheme();
  const { user } = useAuth();
  const logo = isDark ? "/mosaed-logo-dark.png" : "/mosaed-logo.png";
  const firstName = user?.name ? user.name.split(" ")[0] : "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className={styles.window} id="chat-window">

      {/* Landing hero — fades out when messages appear */}
      <div className={`${styles.empty} ${!isEmpty ? styles.emptyHidden : ""}`}
        aria-hidden={!isEmpty}>
        <img src={logo} alt="Mosaed" className={styles.emptyLogo} />
        <h2 className={styles.emptyHeading}>
          {firstName ? `Hey ${firstName}, how can I help you today?` : "How can I help you today?"}
        </h2>
      </div>

      {/* Scrollable messages */}
      <div className={styles.inner}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id || msg.tempId} message={msg} />
        ))}

        {isLoading && (
          <div className={styles.thinking}>
            <div className={styles.thinkingAvatar}>
              <img src={logo} alt="Mosaed" className={styles.thinkingLogo} />
            </div>
            <div className={styles.thinkingDots}>
              <span className={styles.dot1} />
              <span className={styles.dot2} />
              <span className={styles.dot3} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
