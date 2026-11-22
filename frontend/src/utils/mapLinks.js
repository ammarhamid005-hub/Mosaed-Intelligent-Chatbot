// Finds campus places (building codes like A7, A9 rooms like A9-109) in a chatbot answer and
// turns them into links to the 3D campus map in public/campus-map/.
//
// The map's links (#<id>) use the 3D model's internal room ids, which differ from the door
// numbers (the office with door A9-126 is "A9-166" in the model, and model id "A9-126" is a
// different office). A9-room-mapping.json gives model id -> door number; we invert it.

export const MAP_PAGE = "/campus-map/campus-map.html";

let indexPromise = null;

export function loadMapIndex() {
  if (!indexPromise) {
    indexPromise = Promise.all([
      fetch("/campus-map/data.json").then((r) => r.json()),
      fetch("/campus-map/A9-room-mapping.json").then((r) => r.json()),
    ]).then(([data, mapping]) => {
      const buildings = Object.fromEntries(data.buildings.map((b) => [b.id, b.name]));
      const doorToModel = {};
      for (const [modelId, m] of Object.entries(mapping)) {
        if (m.number && !doorToModel[m.number]) doorToModel[m.number] = modelId;
        for (const inner of m.inside || []) if (!doorToModel[inner]) doorToModel[inner] = modelId;
      }
      // Ground-floor rooms keep their door number as the model id.
      for (const r of data.rooms) {
        if (r.b === "A9" && r.lv === 0 && /^A9-\d{3}$/.test(r.id) && !doorToModel[r.id]) doorToModel[r.id] = r.id;
      }
      return { buildings, doorToModel };
    }).catch(() => { indexPromise = null; return null; });
  }
  return indexPromise;
}

const ROOM_RE = /\bA9[\s-]?(\d{3}[A-D]?)\b/gi;
const BUILDING_RE = /\b(A-P7|A20|A1\d|A[1-9])\b(?![-\s]?\d)/g;

// -> [{ label, title, hash }] at most `max`, rooms first
export function findMapLinks(text, index, max = 3) {
  if (!text || !index) return [];
  const links = [], seen = new Set();
  const add = (hash, label, title) => {
    if (seen.has(label) || links.length >= max) return;
    seen.add(label);
    links.push({ hash, label, title });
  };
  for (const m of text.matchAll(ROOM_RE)) {
    const door = "A9-" + m[1].toUpperCase();
    const model = index.doorToModel[door];
    if (model) add(model, door, `Room ${door} in building A9`);
    else add("A9", door, `Room ${door} is in building A9 (not placed on the map yet)`);
  }
  const roomsLinked = links.length > 0;
  for (const m of text.matchAll(BUILDING_RE)) {
    const id = m[1];
    if (!index.buildings[id] || (id === "A9" && roomsLinked)) continue;
    add(id, `${id} · ${index.buildings[id].split(" / ")[0]}`, index.buildings[id]);
  }
  return links;
}

// Ask for the campus map page (pages/MapPage, handled in ChatPage) at a building or room;
// an empty hash opens it where it was left.
export function openMap(hash = "") {
  window.dispatchEvent(new CustomEvent("mosaed:open-map", { detail: { hash } }));
}
