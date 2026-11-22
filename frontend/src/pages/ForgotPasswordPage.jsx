import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import {
  styles, AuthShell, Field, PasswordInput, PasswordRules, SubmitButton, fieldState, passwordProblem,
  EMAIL_RE, MailIcon, KeyIcon, CheckIcon, ArrowLeftIcon,
} from "../components/AuthKit";

// Reset password, in the same glass card as the sign-in page.
// Three steps: "request" (email) → "reset" (code + new password) → "done".
// Each step slides in from the right, and the card resizes smoothly between them.

export default function ForgotPasswordPage({ onBack }) {
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(""); // development only: the API returns the code
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const firstField = useRef(null);

  // a new step puts the cursor in its first field (not on first load, where it opens the phone keyboard)
  const lastStep = useRef(step);
  useEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    setErrors({});
    setServerError("");
    firstField.current?.focus();
  }, [step]);

  const update = (setter, key) => (ev) => {
    setter(key === "code" ? ev.target.value.replace(/\D/g, "").slice(0, 6) : ev.target.value);
    setErrors((e) => ({ ...e, [key]: "" }));
    setServerError("");
  };

  const fail = (e) => { setErrors(e); setAttempt((n) => n + 1); };

  async function handleRequest(ev) {
    ev.preventDefault();
    const value = email.trim();
    if (!value) return fail({ email: "Enter your email." });
    if (!EMAIL_RE.test(value)) return fail({ email: "That doesn't look like an email address." });
    setLoading(true);
    try {
      const data = await api.forgotPassword(value);
      if (data.code) setDevCode(data.code);
      setStep("reset");
    } catch (err) {
      setServerError(err.message || "We couldn't send the code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(ev) {
    ev.preventDefault();
    const e = {};
    if (code.length !== 6) e.code = "Enter the 6-digit code.";
    const p = passwordProblem(password);
    if (p) e.password = p;
    if (!confirm) e.confirm = "Type the password again.";
    else if (confirm !== password) e.confirm = "The passwords don't match.";
    if (Object.keys(e).length) return fail(e);
    setLoading(true);
    try {
      await api.resetPassword(email.trim(), code, password);
      setStep("done");
    } catch (err) {
      setServerError(err.message || "That code is wrong or has expired.");
    } finally {
      setLoading(false);
    }
  }

  const { invalid, described, wrap } = fieldState(errors, attempt);
  const moved = step !== "request";

  const title = { request: "Reset your password", reset: "Set a new password", done: "Password updated" }[step];

  return (
    <AuthShell animated={moved} labelledBy="reset-title">
      {step === "done" && (
        <span className={styles.doneMark}><CheckIcon size={22} width={2.6} /></span>
      )}
      <h1 id="reset-title" className={styles.title}>{title}</h1>
      <p className={styles.sub}>
        {step === "request" && "Enter your email and we'll send you a 6-digit code."}
        {step === "reset" && <>Enter the code sent to <strong className={styles.subStrong}>{email.trim()}</strong>.</>}
        {step === "done" && "You can now sign in with your new password."}
      </p>

      {serverError && <div className={styles.serverError} role="alert">{serverError}</div>}

      <div key={step} className={moved ? styles.fromRight : undefined}>
        {step === "request" && (
          <form className={styles.form} onSubmit={handleRequest} noValidate>
            <Field id="email" label="Email" error={errors.email}>
              <div className={wrap("email")}>
                <span className={styles.lead}><MailIcon /></span>
                <input id="email" ref={firstField} className={styles.input} type="email" inputMode="email"
                  autoComplete="email" placeholder="you@sharjah.ac.ae" value={email}
                  onChange={update(setEmail, "email")}
                  aria-invalid={invalid("email") || undefined} aria-describedby={described("email")} />
              </div>
            </Field>
            <SubmitButton loading={loading} label="Send code" busyLabel="Sending the code" />
          </form>
        )}

        {step === "reset" && (
          <form className={styles.form} onSubmit={handleReset} noValidate>
            {devCode && (
              <div className={styles.note}>
                Development mode, your code is <strong className={styles.code}>{devCode}</strong>
              </div>
            )}
            <Field id="code" label="Code" error={errors.code}>
              <div className={wrap("code")}>
                <span className={styles.lead}><KeyIcon /></span>
                <input id="code" ref={firstField} className={`${styles.input} ${styles.codeInput}`} type="text"
                  inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6}
                  value={code} onChange={update(setCode, "code")}
                  aria-invalid={invalid("code") || undefined} aria-describedby={described("code")} />
              </div>
            </Field>
            <Field id="password" label="New password" error={errors.password}>
              <PasswordInput id="password" value={password} onChange={update(setPassword, "password")}
                placeholder="Choose a password" autoComplete="new-password" invalid={invalid("password")}
                wrapClass={wrap("password")} describedBy="password-rules" />
              <PasswordRules id="password-rules" password={password} />
            </Field>
            <Field id="confirm" label="Confirm password" error={errors.confirm}>
              <PasswordInput id="confirm" value={confirm} onChange={update(setConfirm, "confirm")}
                placeholder="Type it again" autoComplete="new-password" invalid={invalid("confirm")}
                wrapClass={wrap("confirm")} />
            </Field>
            <SubmitButton loading={loading} label="Set new password" busyLabel="Saving your new password" />
          </form>
        )}

        {step === "done" && (
          <div className={styles.form}>
            <button type="button" ref={firstField} className={styles.primary} onClick={onBack}>Sign in</button>
          </div>
        )}
      </div>

      {step !== "done" && (
        <button type="button" className={`${styles.linkBtn} ${styles.back}`} onClick={onBack}>
          <ArrowLeftIcon /> Back to sign in
        </button>
      )}
    </AuthShell>
  );
}
