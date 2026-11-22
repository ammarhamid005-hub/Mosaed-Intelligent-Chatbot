// Wording shared by the Study Plan list, map, course card and next-term planner.

export const STATUS_LABEL = {
  done: "Passed", progress: "This term", retake: "Retake", available: "Can take", locked: "Locked",
};

export const courseLabel = (c) => (c.code && /^\d+$/.test(c.code) ? `${c.code} ${c.title}` : c.title);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Why a course should not be left for later (backend: student_records.mark_bottlenecks).
// Returns null when the course is not a bottleneck.
export function bottleneckText(info, course) {
  if (!info?.bottleneck) return null;
  const parts = [];
  if (info.status === "retake") parts.push("Failed, so it has to be retaken");
  if (info.blocks) parts.push(`${plural(info.blocks, "later required course waits", "later required courses wait")} for it`);
  if (info.depth >= 3) parts.push(`starts a chain of ${info.depth} terms`);
  if (info.overdue && course?.group) parts.push(`planned for ${course.group}`);
  let text = parts.join(" · ");
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return info.critical ? `${text}. Leaving it for later delays your graduation.` : `${text}.`;
}
