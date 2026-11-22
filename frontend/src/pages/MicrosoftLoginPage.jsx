import { useState } from "react";
import styles from "./AuthPage.module.css";

function MicrosoftLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

// Single sign-in screen for AUTH_MODE=microsoft: one button, no password, no separate sign-up.
// The real Microsoft sign-in is not connected yet, so the button only explains that.
export default function MicrosoftLoginPage({ config, onDevLogin, onBack }) {
  const [serverError, setServerError] = useState("");

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome to Mosaed</h1>
        <p className={styles.subtitle}>Sign in with your University of Sharjah email (@{config.allowed_domain})</p>

        {serverError && <div className={styles.serverError}>{serverError}</div>}

        <button className={styles.submitBtn} onClick={() => setServerError("Microsoft sign-in is not configured yet.")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <MicrosoftLogo /> Continue with Microsoft
        </button>

        {config.dev_login && (
          <p className={styles.switchText}>
            <button className={styles.switchLink} onClick={onDevLogin}>Developer login (email and password)</button>
          </p>
        )}
        <p className={styles.switchText}>
          <button className={styles.switchLink} onClick={onBack}>Back</button>
        </p>
      </div>
    </div>
  );
}
