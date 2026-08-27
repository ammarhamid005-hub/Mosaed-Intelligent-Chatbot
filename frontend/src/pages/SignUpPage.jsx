import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import styles from "./AuthPage.module.css";

export default function SignUpPage({ onSwitch }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required.";
    else if (form.name.trim().length < 2) e.name = "Name must be at least 2 characters.";

    if (!form.email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email.";

    if (!form.password) e.password = "Password is required.";
    else if (form.password.length < 8) e.password = "Password must be at least 8 characters.";
    else if (!/[a-zA-Z]/.test(form.password)) e.password = "Password must contain at least one letter.";
    else if (!/\d/.test(form.password)) e.password = "Password must contain at least one number.";

    if (!form.confirm) e.confirm = "Please confirm your password.";
    else if (form.confirm !== form.password) e.confirm = "Passwords do not match.";

    return e;
  };

  const handleChange = (field) => (ev) => {
    setForm((f) => ({ ...f, [field]: ev.target.value }));
    setErrors((e) => ({ ...e, [field]: "" }));
    setServerError("");
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    setLoading(true);
    try {
      const data = await api.signup(form.name.trim(), form.email, form.password);
      login(data.access_token, data.user);
    } catch (err) {
      setServerError(err.message || "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create account</h1>
        <p className={styles.subtitle}></p>

        {serverError && <div className={styles.serverError}>{serverError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label}>Full Name</label>
            <input
              className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
              type="text"
              placeholder="Your full name"
              value={form.name}
              onChange={handleChange("name")}
              autoComplete="name"
            />
            {errors.name && <span className={styles.error}>{errors.name}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange("email")}
              autoComplete="email"
            />
            {errors.email && <span className={styles.error}>{errors.email}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
              type="password"
              placeholder="Min 8 chars, include a number"
              value={form.password}
              onChange={handleChange("password")}
              autoComplete="new-password"
            />
            {errors.password && <span className={styles.error}>{errors.password}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Confirm Password</label>
            <input
              className={`${styles.input} ${errors.confirm ? styles.inputError : ""}`}
              type="password"
              placeholder="Repeat your password"
              value={form.confirm}
              onChange={handleChange("confirm")}
              autoComplete="new-password"
            />
            {errors.confirm && <span className={styles.error}>{errors.confirm}</span>}
          </div>

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? <span className={styles.spinner} /> : "Create Account"}
          </button>
        </form>

        <p className={styles.switchText}>
          Already have an account?{" "}
          <button className={styles.switchLink} onClick={onSwitch}>Sign in</button>
        </p>
      </div>
    </div>
  );
}
