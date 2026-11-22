import { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { api } from "./services/api";
import ChatPage from "./pages/ChatPage";
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import MicrosoftLoginPage from "./pages/MicrosoftLoginPage";

// Client-side router: a single `view` string replaces a URL-based router
// because the app is a single-page experience with no deep-link requirements.
export default function App() {
  const { isAuthenticated } = useAuth();
  const [view, setView] = useState("landing");
  // "password" = original email/password screens, "microsoft" = university Microsoft sign-in.
  // Switched by AUTH_MODE in the backend .env; if the backend can't be reached, fall back to password.
  const [authConfig, setAuthConfig] = useState(null);

  useEffect(() => {
    api.authConfig().then(setAuthConfig).catch(() => setAuthConfig({ mode: "password" }));
  }, []);

  if (!isAuthenticated) {
    if (!authConfig) return null;
    const microsoft = authConfig.mode === "microsoft";

    if (microsoft && view !== "devlogin") {
      return <MicrosoftLoginPage config={authConfig} onDevLogin={() => setView("devlogin")} onBack={() => setView("landing")} />;
    }

    if (view === "devlogin") return <LoginPage devOnly onBack={() => setView("landing")} />;
    if (view === "forgot") return <ForgotPasswordPage onBack={() => setView("landing")} />;
    // The first page is the sign-in page; "Create account" switches it in place
    return <LandingPage onForgot={() => setView("forgot")} />;
  }

  return <ChatPage />;
}
