import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import MapPage from "./MapPage";
import ChatInput from "../components/ChatInput";
import SearchModal from "../components/SearchModal";
import SchedulePanel from "../components/SchedulePanel";
import StudiesPage from "./StudiesPage";import { IconStudyPlan, IconThesis, IconCalendar, IconMap, IconClock } from "../components/icons";
import { api } from "../services/api";
import { justSignedIn } from "../utils/entrance";
import { loadScheduleIndex, asksForSchedule, isFollowUp, findPerson } from "../utils/schedules";
import styles from "./ChatPage.module.css";

// Starter questions shown under the chat bar before the first message.
const STARTERS = [
  { icon: <IconStudyPlan size={15} />, title: "Plan my semester", question: "Which courses should I register for next semester?" },
  { icon: <IconThesis size={15} />, title: "Thesis steps", question: "What are the steps to submit and defend my Master's thesis?" },
  { icon: <IconCalendar size={15} />, title: "Key dates", question: "When are the final exams this semester?" },
  { icon: <IconMap size={15} />, title: "Find a place", question: "Where is building A9 on campus?" },
  { icon: <IconClock size={15} />, title: "Office hours", question: "How can I find an instructor's office hours?" },
];

// "My degree" (#degree) and the campus map (#map) are pages in place of the chat, so the
// browser's back button returns to the chat and a reload keeps the page open.
const PAGE_HASHES = { "#degree": "degree", "#map": "map" };
const viewFromHash = () => PAGE_HASHES[window.location.hash] ?? "chat";

export default function ChatPage() {
  const [view, setView] = useState(viewFromHash);
  // Where the map should show: { hash, n }. null until the map is first opened; after that
  // the map page stays mounted (hidden) so its 3D model is loaded only once.
  const [mapPlace, setMapPlace] = useState(() => (viewFromHash() === "map" ? { hash: "", n: 0 } : null));
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  // Instructor schedule panel. The person stays set while the panel slides closed.
  const [schedulePerson, setSchedulePerson] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // True while the conversation is about someone's schedule, so a short follow-up
  // ("how about Manar?") opens the next person's timetable too.
  const scheduleTopic = useRef(false);

  const isEmpty = messages.length === 0 && !isLoading;

  // Right after sign-in the page builds itself in (sidebar, greeting, chat bar, starters), then the
  // flag comes off so nothing replays. Not when a saved session opens the app.
  const [entrance, setEntrance] = useState(justSignedIn);
  useEffect(() => {
    if (!entrance) return;
    const t = setTimeout(() => setEntrance(false), 1900);
    return () => clearTimeout(t);
  }, [entrance]);

  useEffect(() => {
    const onHash = () => {
      const v = viewFromHash();
      if (v === "map") setMapPlace((p) => p ?? { hash: "", n: 0 });
      setView(v);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openPage = (hash) => {
    if (window.location.hash !== hash) window.location.hash = hash.slice(1); // hashchange shows it
  };
  const openDegree = () => openPage("#degree");
  const openChat = useCallback(() => {
    if (PAGE_HASHES[window.location.hash]) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setView("chat");
  }, []);

  // "Show on map" buttons, the schedule panel and the sidebar ask for the map with this event
  // (utils/mapLinks openMap). An empty hash opens the map where it was left.
  useEffect(() => {
    const onOpenMap = (e) => {
      const hash = e.detail?.hash || "";
      setMapPlace((p) => (hash || !p ? { hash, n: (p?.n ?? 0) + 1 } : p));
      openPage("#map");
    };
    window.addEventListener("mosaed:open-map", onOpenMap);
    return () => window.removeEventListener("mosaed:open-map", onOpenMap);
  }, []);

  const showSchedule = useCallback((person) => {
    setSchedulePerson(person);
    setScheduleOpen(true);
  }, []);

  // "View schedule" buttons under answers (MessageBubble) ask for the panel with this event.
  useEffect(() => {
    const onOpen = (e) => e.detail?.person && showSchedule(e.detail.person);
    const onEsc = (e) => {
      // Esc closes the panel unless a dialog (map, search, tool panel) is open on top of it
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) setScheduleOpen(false);
    };
    window.addEventListener("mosaed:open-schedule", onOpen);
    document.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mosaed:open-schedule", onOpen);
      document.removeEventListener("keydown", onEsc);
    };
  }, [showSchedule]);

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
    openChat();
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
    scheduleTopic.current = false;
  };

  const handleSelectSession = (id) => {
    openChat();
    setActiveSessionId(id);
    setError(null);
    scheduleTopic.current = false;
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

    // Asking for an instructor's schedule slides their timetable in beside the chat, right away
    // when the question names them, otherwise once the answer does ("what are his office hours?").
    // A short follow-up keeps the topic of the question before it ("how about Manar?").
    const wantsSchedule = asksForSchedule(question) || (scheduleTopic.current && isFollowUp(question));
    scheduleTopic.current = wantsSchedule;
    let scheduleShown = false;
    if (wantsSchedule) {
      loadScheduleIndex().then((people) => {
        const person = findPerson(question, people);
        if (person) { scheduleShown = true; showSchedule(person); }
      });
    }

    try {
      const result = await api.sendMessage(activeSessionId, question);
      if (wantsSchedule && !scheduleShown) {
        loadScheduleIndex().then((people) => {
          const person = findPerson(result.answer, people);
          if (person && !scheduleShown) showSchedule(person);
        });
      }
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
        sources: result.sources || [],
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
      <div className={`${styles.layout} ${entrance ? styles.entrance : ""}`}>
        <div className={styles.bgCanvas} aria-hidden="true" data-enter="glow">
          <div className={`${styles.blob} ${styles.blob1}`} />
          <div className={`${styles.blob} ${styles.blob2}`} />
        </div>
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNewChat={handleNewChat}
          onDelete={handleDeleteSession}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          onSearch={() => setSearchOpen(true)}
          onAsk={(q) => { openChat(); handleSend(q); }}
          busy={isLoading}
          onOpenDegree={openDegree}
          degreeActive={view === "degree"}
          mapActive={view === "map"}
        />
        <div className={styles.main}>
          {/* The chat stays mounted (hidden) while a page is open, so it comes back as it was */}
          <div className={`${styles.chatArea} ${view !== "chat" ? styles.chatHidden : ""}`} aria-hidden={view !== "chat"}>
            <ChatWindow messages={messages} isLoading={isLoading} isEmpty={isEmpty} />
            <div className={`${styles.inputWrap} ${isEmpty ? styles.inputCentered : styles.inputBottom}`}>
              {error && <div className={styles.error} role="alert">{error}</div>}
              <ChatInput onSend={handleSend} disabled={isLoading} showDisclaimer={!isEmpty} />
            </div>
            <div className={`${styles.starters} ${!isEmpty ? styles.startersHidden : ""}`} aria-hidden={!isEmpty}>
              {STARTERS.map((s, i) => (
                <button
                  key={s.title}
                  className={styles.starter}
                  data-enter="chip"
                  style={{ "--i": i }}
                  onClick={() => handleSend(s.question)}
                  disabled={isLoading || !isEmpty}
                  tabIndex={isEmpty ? 0 : -1}
                  title={s.question}
                >
                  <span className={styles.starterIcon}>{s.icon}</span>
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          {view === "degree" && (
            <StudiesPage
              onAsk={(q) => { openChat(); handleSend(q); }}
              busy={isLoading}
              onClose={openChat}
            />
          )}

          {mapPlace && <MapPage visible={view === "map"} place={mapPlace} onClose={openChat} />}
        </div>

        {/* Instructor schedule: grows in from the right and pushes the chat to the left */}
        <div
          className={`${styles.sidePanel} ${scheduleOpen ? styles.sidePanelOpen : ""}`}
          aria-hidden={!scheduleOpen}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && !scheduleOpen) setSchedulePerson(null);
          }}
        >
          <div className={styles.sidePanelInner}>
            <SchedulePanel person={schedulePerson} onClose={() => setScheduleOpen(false)} />
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
