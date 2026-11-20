import type { Task, Workshop } from "./types.js";

export interface WorkshopRetrospective {
  title: string;
  decision: string;
  actionDone: number;
  actionTotal: number;
  openActions: string[];
  openQuestions: string[];
  linkedTask: Task | null;
  materialCount: number;
  markdown: string;
}

export function buildWorkshopRetrospective(
  workshop: Workshop,
  tasks: Task[],
): WorkshopRetrospective {
  const actionDone = workshop.actionItems.filter(
    (item) => item.status === "done",
  ).length;
  const openActions = workshop.actionItems
    .filter((item) => item.status !== "done")
    .map((item) => item.text);
  const linkedTaskId =
    workshop.linkedTaskId ??
    workshop.actionItems.find((item) => item.taskId !== null)?.taskId ??
    null;
  const linkedTask =
    linkedTaskId === null
      ? null
      : tasks.find((task) => task.id === linkedTaskId) ?? null;
  const decision =
    workshop.decision.trim() ||
    workshop.minutes?.decisionDraft.trim() ||
    workshop.synthesis.trim() ||
    "（未形成决策）";
  const openQuestions = workshop.minutes?.openQuestions ?? [];
  const markdown = [
    `# 会议复盘：${workshop.title}`,
    "",
    `- 状态：${workshop.status}`,
    `- 决策：${decision}`,
    `- 行动项：${actionDone}/${workshop.actionItems.length}`,
    `- 关联任务：${linkedTask === null ? "无" : `${linkedTask.number} ${linkedTask.title} (${linkedTask.status})`}`,
    `- 材料快照：${workshop.materials.length}`,
    "",
    "## 未完成行动项",
    "",
    openActions.length === 0 ? "（无）" : openActions.map((item) => `- ${item}`).join("\n"),
    "",
    "## 未决问题",
    "",
    openQuestions.length === 0 ? "（无）" : openQuestions.map((item) => `- ${item}`).join("\n"),
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
    markdown,
  };
}
