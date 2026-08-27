import { useState } from "react";
import { api } from "../services/api";
import styles from "./FeedbackButtons.module.css";

export default function FeedbackButtons({ messageId }) {
  const [voted, setVoted] = useState(null); // "positive" | "negative" | null

  // Guard against double-votes: once voted, the buttons are disabled and ignored.
  const handleVote = async (rating) => {
    if (voted) return;
    try {
      await api.submitFeedback(messageId, rating);
      setVoted(rating);
    } catch {
      // silently fail — feedback is non-critical
    }
  };

  return (
    <div className={styles.container}>
      <button
        className={`${styles.btn} ${voted === "positive" ? styles.active : ""}`}
        onClick={() => handleVote("positive")}
        disabled={!!voted}
        title="Helpful"
        aria-label="Mark as helpful"
      >
        👍
      </button>
      <button
        className={`${styles.btn} ${voted === "negative" ? styles.activeNeg : ""}`}
        onClick={() => handleVote("negative")}
        disabled={!!voted}
        title="Not helpful"
        aria-label="Mark as not helpful"
      >
        👎
      </button>
      {voted && (
        <span className={styles.thanks}>
          {voted === "positive" ? "Thanks!" : "Got it."}
        </span>
      )}
    </div>
  );
}
