import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import ChatInput from "../components/ChatInput";
import SearchModal from "../components/SearchModal";
import { api } from "../services/api";
import styles from "./ChatPage.module.css";

export default function ChatPage() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  const isEmpty = messages.length === 0 && !isLoading;

  // Ctrl/Cmd+K toggles the session search modal (standard command-palette shortcut).
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    api.getMessages(activeSessionId)
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [activeSessionId]);

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
  };

  const handleSelectSession = (id) => {
    setActiveSessionId(id);
    setError(null);
  };

  const handleDeleteSession = async (id) => {
    try {
      await api.deleteSession(id);
      if (activeSessionId === id) handleNewChat();
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError("Could not delete session.");
    }
  };

  const handleSend = async (question) => {
    setError(null);
    // Optimistic UI: show the user's message immediately without waiting for the server.
    const tempUserMsg = { tempId: `u-${Date.now()}`, role: "user", content: question };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const result = await api.sendMessage(activeSessionId, question);
      if (!activeSessionId) {
        setActiveSessionId(result.session_id);
        await fetchSessions();
      } else {
        fetchSessions();
      }
      // `animate: true` triggers the typewriter effect in MessageBubble.
      setMessages((prev) => [...prev, {
        id: result.message_id,
        role: "assistant",
        content: result.answer,
        animate: true,
      }]);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setMessages((prev) => prev.filter((m) => m !== tempUserMsg));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className={styles.layout}>
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNewChat={handleNewChat}
          onDelete={handleDeleteSession}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          onSearch={() => setSearchOpen(true)}
        />
        <div className={styles.main}>
          <div className={styles.bgCanvas} aria-hidden="true">
            <div className={`${styles.blob} ${styles.blob1}`} />
            <div className={`${styles.blob} ${styles.blob2}`} />
            <div className={`${styles.blob} ${styles.blob3}`} />
          </div>
          <Header />
          <ChatWindow messages={messages} isLoading={isLoading} isEmpty={isEmpty} />
          <div className={`${styles.inputWrap} ${isEmpty ? styles.inputCentered : styles.inputBottom}`}>
            {error && <div className={styles.error} role="alert">{error}</div>}
            <ChatInput onSend={handleSend} disabled={isLoading} />
          </div>
        </div>
      </div>

      {searchOpen && (
        <SearchModal
          sessions={sessions}
          onSelect={(id) => { handleSelectSession(id); setSearchOpen(false); }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  );
}
