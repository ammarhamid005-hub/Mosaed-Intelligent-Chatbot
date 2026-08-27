import { getToken } from "../context/AuthContext";

// Falls back to an empty base so the Vite dev-proxy handles /api/* rewrites.
const API_BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    // FastAPI wraps error messages in a `detail` field.
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  // 204 No Content (e.g. DELETE) has no body; res.json() would throw.
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Auth
  signup: (name, email, password) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }),

  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  forgotPassword: (email) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (email, code, new_password) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ email, code, new_password }) }),

  // Chat
  sendMessage: (sessionId, question) =>
    request("/chat", { method: "POST", body: JSON.stringify({ session_id: sessionId || null, question }) }),

  // Sessions
  getSessions: () => request("/sessions"),

  createSession: (title = "New Chat") =>
    request("/sessions", { method: "POST", body: JSON.stringify({ title }) }),

  getMessages: (sessionId) => request(`/sessions/${sessionId}/messages`),

  deleteSession: (sessionId) =>
    request(`/sessions/${sessionId}`, { method: "DELETE" }),

  // Feedback
  submitFeedback: (messageId, rating, comment = null) =>
    request("/feedback", { method: "POST", body: JSON.stringify({ message_id: messageId, rating, comment }) }),
};
