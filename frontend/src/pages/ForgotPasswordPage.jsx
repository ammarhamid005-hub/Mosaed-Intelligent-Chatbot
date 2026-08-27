import { useState } from "react";
import { api } from "../services/api";
import styles from "./AuthPage.module.css";

export default function ForgotPasswordPage({ onBack }) {
  // Three-step flow: collect email → enter code + new password → confirmation.
  const [step, setStep] = useState("request"); // "request" | "reset" | "done"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(""); // shown from API response
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  /* ── Step 1: request code ── */
  const handleRequest = async (ev) => {
    ev.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors({ email: "Enter a valid email." });
      return;
    }
    setLoading(true);
    setServerError("");
    try {
      const data = await api.forgotPassword(email);
      // Dev mode only: the API echoes the code back so testers don't need email delivery.
      if (data.code) setDevCode(data.code);
      setStep("reset");
    } catch (err) {
      setServerError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 2: submit new password ── */
  const handleReset = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (!code.trim()) e.code = "Enter the 6-digit code.";
    if (password.length < 8) e.password = "Password must be at least 8 characters.";
    if (password !== confirm) e.confirm = "Passwords do not match.";
    if (Object.keys(e).length) { setErrors(e); return; }

    setLoading(true);
    setServerError("");
    try {
      await api.resetPassword(email, code, password);
      setStep("done");
    } catch (err) {
      setServerError(err.message || "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  const field = (name, label, type, value, onChange, placeholder) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input
        className={`${styles.input} ${errors[name] ? styles.inputError : ""}`}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(ev) => { onChange(ev.target.value); setErrors((e) => ({ ...e, [name]: "" })); setServerError(""); }}
      />
      {errors[name] && <span className={styles.error}>{errors[name]}</span>}
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {step === "request" && (
          <>
            <h1 className={styles.title}>Reset password</h1>
            <p className={styles.subtitle}>Enter your email and we'll send you a reset code.</p>
            {serverError && <div className={styles.serverError}>{serverError}</div>}
            <form onSubmit={handleRequest} noValidate>
              {field("email", "Email", "email", email, setEmail, "you@example.com")}
              <button className={styles.submitBtn} type="submit" disabled={loading}>
                {loading ? <span className={styles.spinner} /> : "Send reset code"}
              </button>
            </form>
          </>
        )}

        {step === "reset" && (
          <>
            <h1 className={styles.title}>Enter new password</h1>
            <p className={styles.subtitle}>Check your server terminal for the 6-digit code.</p>
            {devCode && (
              <div className={styles.devCodeBox}>
                Reset code: <strong>{devCode}</strong>
              </div>
            )}
            {serverError && <div className={styles.serverError}>{serverError}</div>}
            <form onSubmit={handleReset} noValidate>
              {field("code", "Reset code", "text", code, setCode, "123456")}
              {field("password", "New password", "password", password, setPassword, "••••••••")}
              {field("confirm", "Confirm password", "password", confirm, setConfirm, "••••••••")}
              <button className={styles.submitBtn} type="submit" disabled={loading}>
                {loading ? <span className={styles.spinner} /> : "Set new password"}
              </button>
            </form>
          </>
        )}

        {step === "done" && (
          <>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.title}>Password updated</h1>
            <p className={styles.subtitle}>You can now sign in with your new password.</p>
          </>
        )}

        <p className={styles.switchText}>
          <button className={styles.switchLink} onClick={onBack}>← Back to sign in</button>
        </p>
      </div>
    </div>
  );
}
