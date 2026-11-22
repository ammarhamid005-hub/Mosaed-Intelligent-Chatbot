import { useMemo } from "react";
import { layoutWeek, officeHourLines, officeStatus, officeStatusText, campusToday } from "../utils/schedules";
import { loadMapIndex, openMap } from "../utils/mapLinks";
import { IconClose, IconMap, IconClock } from "./icons";
import styles from "./SchedulePanel.module.css";

// Weekly timetable of one instructor, shown in the panel that slides in beside the chat.
const HOUR_PX = 56;

const IconMail = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

// "Dr. Imad Afyouni" -> ["Dr.", "Imad Afyouni"], so the title can sit smaller than the name.
const splitTitle = (name) => {
  const m = name.match(/^(Dr\.?|Prof\.?|Professor|Mr\.?|Mrs\.?|Ms\.?|Eng\.?)\s+(.*)$/i);
  return m ? [m[1], m[2]] : ["", name];
};

const hourLabel = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:00`;

export default function SchedulePanel({ person, onClose }) {
  const week = useMemo(() => (person ? layoutWeek(person.schedule) : null), [person]);
  if (!person || !week) return null;

  const { days, byDay, from, to } = week;
  const hours = [];
  for (let m = from; m < to; m += 60) hours.push(m);
  const office = officeHourLines(person.schedule);
  const status = officeStatus(person.schedule);
  const today = campusToday();
  const s = person.schedule;
  const term = [s.term, s.academicYear].filter(Boolean).join(" ");
  const [honorific, plainName] = splitTitle(person.name);

  const showOffice = async () => {
    if (person.building === "A9") {
      const index = await loadMapIndex();
      openMap(index?.doorToModel?.[person.room] || "A9");
    } else {
      openMap(person.building);
    }
  };

  return (
    <aside className={styles.panel} role="complementary" aria-label={`${person.name} schedule`}>
      <header className={styles.head}>
        <div className={styles.who}>
          <h2 className={styles.name}>
            {honorific && <span className={styles.honorific}>{honorific}</span>}
            {plainName}
          </h2>
          <dl className={styles.facts}>
            {person.department && <div><dt>Department</dt><dd>{person.department}</dd></div>}
            <div><dt>Office</dt><dd>{person.room}</dd></div>
            {term && <div><dt>Term</dt><dd>{term}</dd></div>}
          </dl>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close schedule" title="Close (Esc)">
          <kbd className={styles.closeKey} aria-hidden="true">Esc</kbd>
          <IconClose size={16} />
        </button>
      </header>

      <div className={styles.actions}>
        <button className={styles.action} onClick={showOffice}>
          <IconMap size={16} /> Show office on map
        </button>
        {person.email && (
          <a className={styles.action} href={`mailto:${person.email}`}>
            <IconMail /> Email
          </a>
        )}
      </div>

      {office.length > 0 && (
        <section className={styles.officeWrap}>
          <h3 className={styles.sectionTitle}>Office hours</h3>
          <div className={styles.office}>
            {/* The answer to "when can I see them?" comes first */}
            <div className={`${styles.status} ${status?.now ? styles.statusNow : ""}`}>
              {status?.now
                ? <span className={styles.liveDot} aria-hidden="true" />
                : <IconClock size={15} />}
              <span className={styles.statusText}>{officeStatusText(status)}</span>
              {status && !status.now && <span className={styles.statusRange}>until {status.to}</span>}
            </div>
            <ul className={styles.days}>
              {office.map((o) => (
                <li key={o.day} className={o.day === today ? styles.dayToday : ""}>
                  <span className={styles.dayName}>{o.day}</span>
                  <span className={styles.slots}>
                    {o.slots.map((slot) => <span key={slot} className={styles.slot}>{slot}</span>)}
                  </span>
                  {o.day === today && <span className={styles.todayTag}>Today</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className={styles.weekWrap}>
        <div className={styles.weekHead}>
          <h3 className={styles.sectionTitle}>Weekly timetable</h3>
          <div className={styles.legend}>
            <span><i className={`${styles.swatch} ${styles.swatchOffice}`} />Office hours</span>
            <span><i className={styles.swatch} />Classes</span>
          </div>
        </div>

        <div className={styles.grid} style={{ "--days": days.length }}>
          <div className={styles.corner} />
          {days.map((d) => <div key={d} className={styles.dayHead}>{d.slice(0, 3)}</div>)}

          <div className={styles.times} style={{ height: hours.length * HOUR_PX }}>
            {hours.map((m) => (
              <span key={m} style={{ top: ((m - from) / 60) * HOUR_PX }}>{hourLabel(m)}</span>
            ))}
          </div>

          {days.map((d) => (
            <div key={d} className={styles.dayCol} style={{ height: hours.length * HOUR_PX }}>
              {hours.map((m) => (
                <div key={m} className={styles.hourLine} style={{ top: ((m - from) / 60) * HOUR_PX }} />
              ))}
              {byDay[d].map((e, i) => (
                <div
                  key={i}
                  className={`${styles.event} ${e.office ? styles.eventOffice : ""}`}
                  style={{
                    top: ((e.start - from) / 60) * HOUR_PX + 1,
                    height: ((e.end - e.start) / 60) * HOUR_PX - 3,
                    left: `calc(${(e.lane / e.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / e.lanes}% - 4px)`,
                  }}
                  title={`${e.title} · ${e.day} ${e.from}–${e.to}`}
                >
                  <span className={styles.eventTitle}>{e.title}</span>
                  <span className={styles.eventTime}>{e.from}–{e.to}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <p className={styles.note}>
        From the timetable posted on the office door{term ? ` (${term})` : ""}. Times can change, so check with the instructor before visiting.
      </p>
    </aside>
  );
}
