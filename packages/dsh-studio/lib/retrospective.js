// src/shared/retrospective.ts
function buildWorkshopRetrospective(workshop, tasks) {
  const actionDone = workshop.actionItems.filter(
    (item) => item.status === "done"
  ).length;
  const openActions = workshop.actionItems.filter((item) => item.status !== "done").map((item) => item.text);
  const linkedTaskId = workshop.linkedTaskId ?? workshop.actionItems.find((item) => item.taskId !== null)?.taskId ?? null;
  const linkedTask = linkedTaskId === null ? null : tasks.find((task) => task.id === linkedTaskId) ?? null;
  const decision = workshop.decision.trim() || workshop.minutes?.decisionDraft.trim() || workshop.synthesis.trim() || "\uFF08\u672A\u5F62\u6210\u51B3\u7B56\uFF09";
  const openQuestions = workshop.minutes?.openQuestions ?? [];
  const markdown = [
    `# \u4F1A\u8BAE\u590D\u76D8\uFF1A${workshop.title}`,
    "",
    `- \u72B6\u6001\uFF1A${workshop.status}`,
    `- \u51B3\u7B56\uFF1A${decision}`,
    `- \u884C\u52A8\u9879\uFF1A${actionDone}/${workshop.actionItems.length}`,
    `- \u5173\u8054\u4EFB\u52A1\uFF1A${linkedTask === null ? "\u65E0" : `${linkedTask.number} ${linkedTask.title} (${linkedTask.status})`}`,
    `- \u6750\u6599\u5FEB\u7167\uFF1A${workshop.materials.length}`,
    "",
    "## \u672A\u5B8C\u6210\u884C\u52A8\u9879",
    "",
    openActions.length === 0 ? "\uFF08\u65E0\uFF09" : openActions.map((item) => `- ${item}`).join("\n"),
    "",
    "## \u672A\u51B3\u95EE\u9898",
    "",
    openQuestions.length === 0 ? "\uFF08\u65E0\uFF09" : openQuestions.map((item) => `- ${item}`).join("\n")
  ].join("\n");
  return {
    title: workshop.title,
    decision,
    actionDone,
    actionTotal: workshop.actionItems.length,
    openActions,
    openQuestions,
    linkedTask,
    materialCount: workshop.materials.length,
    markdown
  };
}
export {
  buildWorkshopRetrospective
};
