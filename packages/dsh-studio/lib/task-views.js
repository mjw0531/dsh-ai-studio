// src/shared/task-views.ts
var MAX_VIEWS = 20;
function parseSavedTaskViews(raw) {
  if (raw === null || raw.trim() === "") return [];
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) => typeof item === "object" && item !== null && typeof item.id === "string" && typeof item.name === "string" && typeof item.query === "string" && typeof item.status === "string" && typeof item.milestoneId === "string"
  ).slice(0, MAX_VIEWS);
}
function addSavedTaskView(views, view) {
  const clean = views.filter(
    (item) => item.id !== view.id && item.name !== view.name
  );
  return [view, ...clean].slice(0, MAX_VIEWS);
}
export {
  addSavedTaskView,
  parseSavedTaskViews
};
