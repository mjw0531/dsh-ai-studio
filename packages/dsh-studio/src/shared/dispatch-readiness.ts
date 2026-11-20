import type { Project, Role, Task } from "./types.js";

export interface DispatchCheck {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
}

export interface DispatchDiagnosis {
  ready: boolean;
  checks: DispatchCheck[];
}

export function diagnoseDispatch(input: {
  task: Task;
  project: Project | null;
  roles: Role[];
  tasks: Task[];
}): DispatchDiagnosis {
  const { task, project, roles, tasks } = input;
  const owner = roles.find((role) => role.id === task.ownerRoleId);
  const blockers = task.dependsOn
    .map((id) => tasks.find((item) => item.id === id))
    .filter((item): item is Task => item !== undefined && item.status !== "done");
  const codeMode = project?.repoPath != null;
  const stageOk =
    !codeMode ||
    project?.stage === "prototype" ||
    project?.stage === "development";
  const checks: DispatchCheck[] = [
    {
      id: "status",
      label: "任务处于待规划或可开始",
      ok: task.status === "backlog" || task.status === "ready",
      hint: "从任务状态栏把任务推进到「可开始」。",
    },
    {
      id: "owner",
      label: "已指定负责人角色",
      ok: task.ownerRoleId !== null && owner !== undefined,
      hint: "在任务编辑里选择负责人角色。",
    },
    {
      id: "dependencies",
      label: "前置任务已完成",
      ok: blockers.length === 0,
      hint:
        blockers.length === 0
          ? ""
          : `先完成：${blockers.map((item) => `${item.number} ${item.title}`).join("；")}`,
    },
    {
      id: "fix-plan",
      label: "改修票有诊断和修改计划",
      ok:
        task.kind !== "fix" ||
        task.integration ||
        (task.diagnosis.trim() !== "" && task.plan.trim() !== ""),
      hint: "改修票必须写清根因、修改计划。",
    },
    {
      id: "stage",
      label: "代码项目阶段允许派单",
      ok: stageOk,
      hint: "只有原型或开发阶段能派单；先通过阶段门禁。",
    },
  ];
  return { ready: checks.every((check) => check.ok), checks };
}
