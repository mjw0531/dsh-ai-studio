import type { TaskStatus } from "./types.js";

export interface SavedTaskView {
  id: string;
  name: string;
  query: string;
  status: TaskStatus | "all";
  milestoneId: string | "all";
}

const MAX_VIEWS = 20;

export function parseSavedTaskViews(raw: string | null): SavedTaskView[] {
  if (raw === null || raw.trim() === "") return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is SavedTaskView =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { name?: unknown }).name === "string" &&
        typeof (item as { query?: unknown }).query === "string" &&
        typeof (item as { status?: unknown }).status === "string" &&
        typeof (item as { milestoneId?: unknown }).milestoneId === "string",
    )
    .slice(0, MAX_VIEWS);
}

export function addSavedTaskView(
  views: SavedTaskView[],
  view: SavedTaskView,
): SavedTaskView[] {
  const clean = views.filter(
    (item) => item.id !== view.id && item.name !== view.name,
  );
  return [view, ...clean].slice(0, MAX_VIEWS);
}
