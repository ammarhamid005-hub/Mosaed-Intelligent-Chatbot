import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import {
  styles, AuthShell, Field, PasswordInput, PasswordRules, SubmitButton, fieldState, passwordProblem,
  EMAIL_RE, STUDENT_EMAIL_RE, PersonIcon, MailIcon, CheckIcon, LEAVE_MS,
} from "../components/AuthKit";
import { markSignedIn } from "../utils/entrance";

// The first page: sign in, or create an account, in one card on the moving brand-colour field.
// mode "signin" | "signup"; the switch at the top of the card changes it in place.

export default function LandingPage({ initialMode = "signin", onForgot }) {
  const { login } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [moved, setMoved] = useState(false); // true once the user has switched at least once
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0); // counts failed submits, to replay the error shake
  const [leaving, setLeaving] = useState(false);
  const firstField = useRef(null);
  const signup = mode === "signup";

  // Switching modes clears the messages and puts the cursor in the first field
  // (not on first load, where it would open the keyboard on phones)
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    setErrors({});
    setServerError("");
    firstField.current?.focus();
  }, [mode]);

  const set = (field) => (ev) => {
    setForm((f) => ({ ...f, [field]: ev.target.value }));
    setErrors((e) => ({ ...e, [field]: "" }));
    setServerError("");
  };

  function validate() {
    const e = {};
    const email = form.email.trim();
    if (signup) {
      if (!form.name.trim()) e.name = "Enter your full name.";
      else if (form.name.trim().length < 2) e.name = "Your name needs at least 2 characters.";
      if (!email) e.email = "Enter your student email.";
      else if (!STUDENT_EMAIL_RE.test(email)) e.email = "Use your student email: StudentID@sharjah.ac.ae";
      const p = passwordProblem(form.password);
      if (p) e.password = p;
      if (!form.confirm) e.confirm = "Type the password again.";
      else if (form.confirm !== form.password) e.confirm = "The passwords don't match.";
    } else {
      if (!email) e.email = "Enter your email.";
      else if (!EMAIL_RE.test(email)) e.email = "That doesn't look like an email address.";
      if (!form.password) e.password = "Enter your password.";
    }
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); setAttempt((n) => n + 1); return; }
    setLoading(true);
    try {
      const data = signup
        ? await api.signup(form.name.trim(), form.email.trim(), form.password)
        : await api.login(form.email.trim(), form.password);
      // the card passes away first, then the chat builds itself in (see ChatPage)
      setLeaving(true);
      markSignedIn();
      setTimeout(() => login(data.access_token, data.user, signup ? false : keepSignedIn), LEAVE_MS);
    } catch (err) {
      setServerError(err.message || (signup ? "We couldn't create your account. Please try again." : "Sign-in failed. Please try again."));
      setLoading(false);
    }
  }

  const { invalid, described, wrap } = fieldState(errors, attempt);
  const emailOk = signup && STUDENT_EMAIL_RE.test(form.email.trim());

  return (
    <AuthShell animated={moved} leaving={leaving} labelledBy="auth-title">
      <h1 id="auth-title" className={styles.title}>
        {signup ? "Create your Mosaed account" : "Welcome to Mosaed"}
      </h1>

      <div className={`${styles.segment} ${signup ? styles.segRight : ""}`} role="tablist" aria-label="Sign in or create an account">
        {/* the white thumb slides under the chosen option */}
        <span className={styles.segThumb} aria-hidden="true" />
        <button type="button" role="tab" aria-selected={!signup}
          className={`${styles.segBtn} ${!signup ? styles.segActive : ""}`} onClick={() => { setMoved(true); setMode("signin"); }}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={signup}
          className={`${styles.segBtn} ${signup ? styles.segActive : ""}`} onClick={() => { setMoved(true); setMode("signup"); }}>
          Create account
        </button>
      </div>

      {serverError && <div className={styles.serverError} role="alert">{serverError}</div>}

      {/* the fields slide in from the side of the option chosen: Create account (right) comes in
          from the right, Sign in (left) from the left. Not on first load. */}
      <form key={mode} className={`${styles.form} ${moved ? (signup ? styles.fromRight : styles.fromLeft) : ""}`}
        onSubmit={submit} noValidate>
        {signup && (
          <Field id="name" label="Full name" error={errors.name}>
            <div className={wrap("name")}>
              <span className={styles.lead}><PersonIcon /></span>
              <input id="name" ref={firstField} className={styles.input} type="text" autoComplete="name"
                placeholder="Your full name" value={form.name} onChange={set("name")}
                aria-invalid={invalid("name") || undefined} aria-describedby={described("name")} />
            </div>
          </Field>
        )}

        <Field id="email" label={signup ? "Student email" : "Email"} error={errors.email}>
          <div className={wrap("email")}>
            <span className={styles.lead}><MailIcon /></span>
            <input id="email" ref={signup ? undefined : firstField} className={styles.input} type="email"
              autoComplete={signup ? "email" : "username"} inputMode="email"
              placeholder={signup ? "U1234567@sharjah.ac.ae" : "you@sharjah.ac.ae"}
              value={form.email} onChange={set("email")}
              aria-invalid={invalid("email") || undefined} aria-describedby={described("email")} />
            {emailOk && (
              <span className={styles.tick}>
                <CheckIcon />
                <span className={styles.srOnly}>Student email looks right</span>
              </span>
            )}
          </div>
        </Field>

        <Field id="password" label="Password" error={errors.password}
          aside={!signup && onForgot && (
            <button type="button" className={styles.linkBtn} onClick={onForgot}>Forgot password?</button>
          )}>
          <PasswordInput id="password" value={form.password} onChange={set("password")}
            placeholder={signup ? "Choose a password" : "Your password"}
            autoComplete={signup ? "new-password" : "current-password"} invalid={invalid("password")}
            wrapClass={wrap("password")} describedBy={signup ? "password-rules" : undefined} />
          {signup && <PasswordRules id="password-rules" password={form.password} />}
        </Field>

        {signup && (
          <Field id="confirm" label="Confirm password" error={errors.confirm}>
            <PasswordInput id="confirm" value={form.confirm} onChange={set("confirm")}
              placeholder="Type it again" autoComplete="new-password" invalid={invalid("confirm")}
              wrapClass={wrap("confirm")} />
          </Field>
        )}

        {!signup && (
          <label className={styles.keep}>
            <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} />
            <span>Keep me signed in</span>
          </label>
        )}

        <SubmitButton loading={loading} label={signup ? "Create account" : "Sign in"}
          busyLabel={signup ? "Creating your account" : "Signing in"} />
      </form>
    </AuthShell>
  );
}
