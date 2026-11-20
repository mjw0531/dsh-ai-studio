// src/shared/search.ts
function searchStudio(data, rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  if (query === "") return [];
  const match = (...values) => values.some((value) => (value ?? "").toLowerCase().includes(query));
  const hits = [];
  for (const task of data.tasks) {
    if (!match(task.number, task.title, task.goal)) continue;
    hits.push({
      kind: "task",
      id: task.id,
      title: `${task.number} ${task.title}`,
      subtitle: task.goal || task.status,
      tab: "tasks"
    });
  }
  for (const workshop of data.workshops) {
    if (!match(workshop.title, workshop.topic, workshop.decision)) continue;
    hits.push({
      kind: "meeting",
      id: workshop.id,
      title: workshop.title,
      subtitle: workshop.topic || workshop.status,
      tab: "meeting"
    });
  }
  for (const decision of data.decisions) {
    if (!match(decision.title, decision.context, decision.decision)) continue;
    hits.push({
      kind: "decision",
      id: decision.id,
      title: decision.title,
      subtitle: decision.context || decision.status,
      tab: "boardroom"
    });
  }
  for (const module of data.modules) {
    if (!match(module.name, module.responsibility, module.contractText)) continue;
    hits.push({
      kind: "module",
      id: module.id,
      title: module.name,
      subtitle: module.responsibility,
      tab: "knowledge"
    });
  }
  for (const milestone of data.milestones) {
    if (!match(milestone.title, milestone.goal)) continue;
    hits.push({
      kind: "milestone",
      id: milestone.id,
      title: milestone.title,
      subtitle: milestone.goal || milestone.status,
      tab: "tasks"
    });
  }
  const docPaths = [
    data.project?.prdPath,
    data.project?.invariantsPath,
    data.project?.modulesPath
  ];
  for (const docPath of docPaths) {
    if (docPath === null || docPath === void 0) continue;
    if (!match(docPath)) continue;
    hits.push({
      kind: "doc",
      id: docPath,
      title: docPath,
      subtitle: "\u9879\u76EE\u6587\u6863",
      tab: "knowledge"
    });
  }
  return hits.slice(0, 20);
}
export {
  searchStudio
};
