import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Reads persisted session on first load.
  // localStorage survives browser restarts ("keep me signed in");
  // sessionStorage is cleared when the tab closes (default, no checkbox).
  const [user, setUser] = useState(() => {
    try {
      const remembered = localStorage.getItem("auth_remember") === "true";
      const stored = remembered
        ? localStorage.getItem("auth_user")
        : sessionStorage.getItem("auth_user");
      // Clear stale localStorage tokens when the user did not opt into persistence.
      if (!remembered) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
      }
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((token, userData, remember = false) => {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem("auth_token", token);
    storage.setItem("auth_user", JSON.stringify(userData));
    if (remember) {
      localStorage.setItem("auth_remember", "true");
    } else {
      localStorage.removeItem("auth_remember");
    }
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_remember");
    sessionStorage.removeItem("auth_token");
    sessionStorage.removeItem("auth_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function getToken() {
  const remembered = localStorage.getItem("auth_remember") === "true";
  return remembered
    ? localStorage.getItem("auth_token")
    : sessionStorage.getItem("auth_token");
}
