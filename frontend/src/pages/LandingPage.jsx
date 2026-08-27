import { useEffect } from "react";
import styles from "./LandingPage.module.css";

const ArrowIcon = () => (
  <svg className={styles.arr} viewBox="0 0 14 14" fill="none">
    <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function LandingPage({ onLogin, onSignup }) {
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === "Enter") onLogin(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onLogin]);

  // Updates CSS custom properties used by the button's radial-gradient spotlight effect.
  const trackMouse = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--hx", (e.clientX - r.left) + "px");
    e.currentTarget.style.setProperty("--hy", (e.clientY - r.top) + "px");
  };

  return (
    <div className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.orb} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orbB}`} aria-hidden="true" />

      <main className={styles.main}>
        <div className={styles.lockup} aria-label="University of Sharjah and Mosaed">
          <img
            className={`${styles.lockupLogo} ${styles.uosLogo}`}
            src="/uos-logo.png"
            alt="University of Sharjah"
          />
          <span className={styles.lockupX} aria-hidden="true">×</span>
          <img
            className={`${styles.lockupLogo} ${styles.mosaedLogo}`}
            src="/mosaed-logo.png"
            alt="Mosaed"
          />
        </div>

        <h1 className={styles.wordmark}>Mosaed</h1>
        <p className={styles.tagline}>
          The right <span className={styles.hl}>Mosaed</span> for master's students at the University of Sharjah.
        </p>

        <div className={styles.cta}>
          <button
            className={`${styles.btn} ${styles.primary}`}
            onMouseMove={trackMouse}
            onClick={onLogin}
          >
            Log in <ArrowIcon />
          </button>
          <button
            className={`${styles.btn} ${styles.ghost}`}
            onMouseMove={trackMouse}
            onClick={onSignup}
          >
            Sign up <ArrowIcon />
          </button>
        </div>
      </main>

      <footer className={styles.footer}>
        <div>© 2026 Mosaed · University of Sharjah</div>
        <div className={styles.footerLinks}>
          <a href="#">Privacy</a>
          <a href="#">Help</a>
          <a href="#">العربية</a>
        </div>
      </footer>
    </div>
  );
}
