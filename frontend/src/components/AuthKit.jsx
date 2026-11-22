import { useLayoutEffect, useRef, useState } from "react";
import styles from "./AuthKit.module.css";

// The pieces shared by the sign-in page and the reset-password page: the moving colour field,
// the Mosaed × University of Sharjah header, the glass card (which grows and shrinks smoothly to
// its contents), the footer, and the form fields.

export { styles };

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const STUDENT_EMAIL_RE = /^u\d{7}@sharjah\.ac\.ae$/i;

// ── Icons, all on the same 24px grid and 1.75 stroke ──
const Icon = ({ children, size = 17 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const PersonIcon = () => <Icon><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></Icon>;
export const MailIcon = () => <Icon><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M4 8l8 5.5L20 8" /></Icon>;
export const LockIcon = () => <Icon><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Icon>;
export const KeyIcon = () => <Icon><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" /></Icon>;
export const ArrowLeftIcon = () => <Icon size={15}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
const EyeIcon = ({ open }) => (
  <Icon>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {!open && <path d="M4 4l16 16" />}
  </Icon>
);
export const CheckIcon = ({ size = 12, width = 2.4 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={width}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const DotIcon = () => (
  <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor" /></svg>
);

// ── Page shell ──
// `animated` turns on the card's smooth resize; pages switch it on after the first change so the
// first measurement doesn't animate.
// How long the page takes to pass away after a successful sign-in (matches .leaving in the CSS)
export const LEAVE_MS = 420;

export function AuthShell({ animated, leaving, labelledBy, children }) {
  const bodyRef = useRef(null);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`${styles.page} ${leaving ? styles.leaving : ""}`}>
      {/* The colour field: each colour is its own soft layer, drifting slowly on its own path */}
      <div className={styles.field} aria-hidden="true">
        <span className={`${styles.blob} ${styles.blobWhite}`} />
        <span className={`${styles.blob} ${styles.blobInk}`} />
        <span className={`${styles.blob} ${styles.blobGreen}`} />
        <span className={`${styles.blob} ${styles.blobBridge}`} />
        <span className={`${styles.blob} ${styles.blobMint}`} />
      </div>

      <header className={styles.top}>
        {/* partnership lockup: Mosaed × University of Sharjah */}
        <div className={styles.lockup}>
          <span className={styles.markBox}>
            <img className={styles.mark} src="/mosaed-logo-light-transparent.png" alt="Mosaed" />
          </span>
          <svg className={styles.cross} viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
          <img className={styles.uos} src="/uos-logo.png" alt="University of Sharjah" />
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby={labelledBy}>
          <img className={styles.logo} src="/mosaed-logo-light-transparent.png" alt="" />
          {/* the card grows or shrinks smoothly: the outer box follows the measured inner one */}
          <div className={`${styles.sizer} ${animated ? styles.sizerAnimated : ""}`}
            style={height != null ? { height } : undefined}>
            <div ref={bodyRef} className={styles.sizerBody}>{children}</div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© 2026 Mosaed · University of Sharjah</span>
        <nav className={styles.links} aria-label="Footer">
          <a href="#">Privacy</a>
          <a href="#">Help</a>
          <a href="#" lang="ar">العربية</a>
        </nav>
      </footer>
    </div>
  );
}

// ── Fields ──
export function Field({ id, label, error, aside, children }) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>{label}</label>
        {aside}
      </div>
      {children}
      {error && <span id={`${id}-error`} className={styles.error} role="alert">{error}</span>}
    </div>
  );
}

export function PasswordInput({ id, value, onChange, placeholder, autoComplete, invalid, wrapClass, describedBy }) {
  const [shown, setShown] = useState(false);
  return (
    <div className={wrapClass}>
      <span className={styles.lead}><LockIcon /></span>
      <input
        id={id}
        className={styles.input}
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={[invalid ? `${id}-error` : "", describedBy || ""].join(" ").trim() || undefined}
      />
      <button type="button" className={styles.eye} onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
        {/* an open eye offers "show"; a crossed eye offers "hide" */}
        <EyeIcon open={!shown} />
      </button>
    </div>
  );
}

// New-password rules, shown as chips that turn green as each one is met
const PASSWORD_RULES = [
  { label: "8+ characters", test: (p) => p.length >= 8 },
  { label: "A letter", test: (p) => /[a-zA-Z]/.test(p) },
  { label: "A number", test: (p) => /\d/.test(p) },
];

export function passwordProblem(p) {
  if (!p) return "Choose a password.";
  if (p.length < 8) return "Use at least 8 characters.";
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return "Include at least one letter and one number.";
  return "";
}

export function PasswordRules({ id, password }) {
  return (
    <ul id={id} className={styles.rules} aria-label="Password needs">
      {PASSWORD_RULES.map((r) => {
        const met = r.test(password);
        return (
          <li key={r.label} className={`${styles.rule} ${met ? styles.ruleMet : ""}`}>
            {met ? <CheckIcon size={11} width={3} /> : <DotIcon />}
            {r.label}
            {met && <span className={styles.srOnly}>, done</span>}
          </li>
        );
      })}
    </ul>
  );
}

// Field state helpers for a form: red when wrong, and one shake on the press that found it wrong.
// `attempt` counts failed presses; two identical keyframes swap so the shake replays every time.
export function fieldState(errors, attempt) {
  const invalid = (k) => Boolean(errors[k]);
  return {
    invalid,
    described: (k) => (errors[k] ? `${k}-error` : undefined),
    wrap: (k) => [
      styles.inputWrap,
      invalid(k) ? styles.invalid : "",
      invalid(k) && attempt ? (attempt % 2 ? styles.shakeA : styles.shakeB) : "",
    ].join(" "),
  };
}

export function SubmitButton({ loading, label, busyLabel }) {
  return (
    <button type="submit" className={styles.primary} disabled={loading} aria-busy={loading}>
      {loading ? <span className={styles.spinner} aria-label={busyLabel} /> : label}
    </button>
  );
}
