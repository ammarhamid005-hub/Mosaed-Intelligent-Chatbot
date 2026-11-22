// Instructor timetables, read from the campus map's office directories (the door timetables
// photographed in buildings A9 and A11). The chat opens a schedule panel when a question asks
// for someone's schedule / office hours and names a person who has one.

const DIRECTORIES = [
  { building: "A9", url: "/campus-map/A9-office-directory.json" },
  { building: "A11", url: "/campus-map/A11-office-directory.json" },
];

export const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Words that are not part of how people refer to someone by name.
const TITLES = new Set(["dr", "prof", "professor", "mr", "mrs", "ms", "eng", "al", "el", "bin", "ibn"]);

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s'-]/g, " ");
const words = (s) => norm(s).split(/[\s'-]+/).filter((w) => w.length > 1 && !TITLES.has(w));

let indexPromise = null;

// -> [{ id, name, department, email, building, room, schedule, first, last }]
export function loadScheduleIndex() {
  if (!indexPromise) {
    indexPromise = Promise.all(DIRECTORIES.map((d) =>
      fetch(d.url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((dir) => ({ ...d, dir })),
    )).then((dirs) => {
      const people = [];
      for (const { building, dir } of dirs) {
        for (const [room, entry] of Object.entries(dir?.rooms || {})) {
          for (const p of entry.people || []) {
            const s = p.schedule;
            if (!p.name || !s || !((s.activities || []).length || (s.officeHours || []).length)) continue;
            const w = words(p.name);
            people.push({
              id: `${room}:${p.name}`,
              name: p.name,
              department: p.department,
              email: p.email,
              building,
              room,
              schedule: s,
              first: w[0],
              last: w[w.length - 1],
            });
          }
        }
      }
      return people;
    }).catch(() => { indexPromise = null; return []; });
  }
  return indexPromise;
}

const SCHEDULE_INTENT = /\b(schedule|timetable|time ?table|office hours?|available|availability|free time|when (is|are|can|does|do)|classes|lectures?|teaching|teaches|courses? (does|do))\b/i;

export function asksForSchedule(text) {
  return SCHEDULE_INTENT.test(text || "");
}

// A short follow-up that reuses the previous question's topic:
// "how about Manar?", "what about Dr. Kiran", "and Afyouni?", "same for Dr. Naveed", "Manar?"
const FOLLOW_UP = /^\s*(and|also|how about|what about|what of|same for|and what about|ok,? (how|what) about)\b/i;

export function isFollowUp(text) {
  const t = (text || "").trim();
  return FOLLOW_UP.test(t) || t.split(/\s+/).length <= 4;
}

// Best single person named in `text` ("Dr. Imad", "Imad Afyouni", "Afyouni's office hours").
// Returns null when nobody, or more than one person equally, matches.
export function findPerson(text, people) {
  if (!text || !people?.length) return null;
  const t = ` ${norm(text)} `;
  const has = (w) => w && w.length >= 3 && new RegExp(`\\b${w}\\b`).test(t);
  const firstCount = new Map();
  for (const p of people) firstCount.set(p.first, (firstCount.get(p.first) || 0) + 1);

  let best = null, bestScore = 0, tie = false;
  for (const p of people) {
    let score = 0;
    if (t.includes(` ${words(p.name).join(" ")} `)) score = 3;          // full name
    else if (has(p.first) && has(p.last)) score = 3;
    else if (has(p.last) && !firstCount.has(p.last)) score = 2;         // family name (not also someone's first name)
    else if (has(p.first) && firstCount.get(p.first) === 1) score = 1;  // unique first name ("Dr. Imad")
    if (score > bestScore) { best = p; bestScore = score; tie = false; }
    else if (score && score === bestScore && best?.id !== p.id) tie = true;
  }
  return bestScore && !tie ? best : null;
}

// Ask the chat page to slide the schedule panel in for this person.
export function openSchedule(person) {
  window.dispatchEvent(new CustomEvent("mosaed:open-schedule", { detail: { person } }));
}

const toMin = (hhmm) => {
  const [h, m] = (hhmm || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};

// Timetable entries per day, with overlapping entries placed side by side (lane / lanes).
export function layoutWeek(schedule) {
  const source = (schedule.activities || []).length ? schedule.activities : schedule.officeHours || [];
  const entries = source
    .filter((e) => e.from && e.to && WEEK.includes(e.day))
    .map((e) => ({
      ...e,
      start: toMin(e.from),
      end: toMin(e.to),
      office: /office hours?/i.test(e.title || ""),
    }));

  // Monday–Friday always; weekend days only if something is on them.
  const days = WEEK.filter((d, i) => (i >= 1 && i <= 5) || entries.some((e) => e.day === d));
  const byDay = {};
  for (const day of days) {
    const list = entries.filter((e) => e.day === day).sort((a, b) => a.start - b.start || b.end - a.end);
    // group entries that overlap in time, then give each a lane inside its group
    let group = [], groupEnd = -1;
    const flush = () => {
      const lanes = [];
      for (const e of group) {
        let lane = lanes.findIndex((end) => end <= e.start);
        if (lane === -1) { lane = lanes.length; lanes.push(e.end); } else lanes[lane] = e.end;
        e.lane = lane;
      }
      for (const e of group) e.lanes = lanes.length;
      group = [];
    };
    for (const e of list) {
      if (group.length && e.start >= groupEnd) flush();
      group.push(e);
      groupEnd = Math.max(groupEnd, e.end);
    }
    if (group.length) flush();
    byDay[day] = list;
  }

  const starts = entries.map((e) => e.start), ends = entries.map((e) => e.end);
  const from = Math.floor(Math.min(8 * 60, ...starts) / 60) * 60;
  const to = Math.ceil(Math.max(17 * 60, ...ends) / 60) * 60;
  return { days, byDay, from, to };
}

// Current weekday and minutes in the campus time zone (the timetables are UAE local time).
function campusNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dubai", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { day: parts.weekday, min: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Whether office hours are on now, or when the next ones are.
// -> { now: true, until } | { now: false, day, from, to, inDays } | null
export function officeStatus(schedule, date = new Date()) {
  const slots = (schedule.officeHours || []).filter((e) => e.from && e.to && WEEK.includes(e.day));
  if (!slots.length) return null;
  const { day, min } = campusNow(date);
  const today = WEEK.indexOf(day);
  const current = slots.find((e) => e.day === day && toMin(e.from) <= min && min < toMin(e.to));
  if (current) return { now: true, until: current.to };
  for (let inDays = 0; inDays < 8; inDays++) {
    const d = WEEK[(today + inDays) % 7];
    const next = slots
      .filter((e) => e.day === d && (inDays > 0 || toMin(e.from) > min))
      .sort((a, b) => toMin(a.from) - toMin(b.from))[0];
    if (next) return { now: false, day: d, from: next.from, to: next.to, inDays };
  }
  return null;
}

// Short sentence for officeStatus(): "In office hours until 12:30", "Next office hours tomorrow at 11:00".
export function officeStatusText(status) {
  if (!status) return "No office hours posted";
  if (status.now) return `In office hours now, until ${status.until}`;
  const when = status.inDays === 0 ? "today" : status.inDays === 1 ? "tomorrow" : status.day;
  return `Next office hours ${when} at ${status.from}`;
}

export function campusToday(date = new Date()) {
  return campusNow(date).day;
}

// One line per day for the office-hours summary: { day: "Monday", slots: ["11:00–12:30", "15:00–17:00"] }.
export function officeHourLines(schedule) {
  const lines = [];
  [...(schedule.officeHours || [])]
    .filter((e) => e.from && e.to)
    .sort((a, b) => WEEK.indexOf(a.day) - WEEK.indexOf(b.day) || toMin(a.from) - toMin(b.from))
    .forEach((e) => {
      const last = lines[lines.length - 1];
      const slot = `${e.from}–${e.to}`;
      if (last && last.day === e.day) last.slots.push(slot);
      else lines.push({ day: e.day, slots: [slot] });
    });
  return lines;
}
