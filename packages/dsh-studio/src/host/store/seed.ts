import { randomUUID } from "node:crypto";

import { STUDIO_SCHEMA_VERSION } from "../../shared/types.js";
import type {
  AcceptanceItem,
  Project,
  Role,
  StudioState,
  Task,
  TaskPriority,
  TaskStatus,
} from "../../shared/types.js";
import { defaultTriggerRules } from "./inputs.js";

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function createSeedState(now: () => Date): StudioState {
    const at = nowIso(now);
    const project: Project = {
      id: "proj-demo",
      name: "示例项目",
      description:
        "用一条最小链路验证工作台：任务、角色、验收和状态机。",
      tokenBudget: null,
      repoPath: null,
      prdPath: null,
      invariantsPath: null,
      modulesPath: null,
      triggerRules: defaultTriggerRules(),
      stage: "development",
      createdAt: at,
      updatedAt: at,
    };
    const role = (
      id: string,
      name: string,
      title: string,
      mission: string,
      responsibilities: string[],
      decisionRights: string[] = [],
    ): Role => ({
      id,
      projectId: project.id,
      name,
      title,
      mission,
      responsibilities,
      nonGoals: [],
      decisionRights,
      providerProfileId: null,
      model: null,
      executor: "dsh",
      tokenBudget: null,
      dailyTokenBudget: null,
      createdAt: at,
      updatedAt: at,
    });
    const roles: Role[] = [
      role(
        "role-lead",
        "Lead",
        "制作人 / 调度",
        "把目标变成可执行的任务图，并保持交付节奏。",
        ["拆任务", "派单", "跟踪阻塞", "组织复盘"],
        ["任务优先级", "派单对象"],
      ),
      role(
        "role-architect",
        "Architect",
        "架构师",
        "守住架构完整性与接口契约。",
        ["写 ADR", "定契约", "技术裁决", "评审高风险变更"],
        ["技术方案", "接口契约"],
      ),
      role(
        "role-builder",
        "Builder",
        "开发工程师",
        "交付可运行的功能实现和测试。",
        ["实现功能", "修复缺陷", "补测试", "维护构建"],
      ),
      role(
        "role-verifier",
        "Verifier",
        "QA / 验收",
        "独立验证产物，守住质量门。",
        ["跑测试", "复现缺陷", "检查验收标准", "记录证据"],
        ["验收结论"],
      ),
    ];
    const acceptance = (
      ...texts: string[]
    ): AcceptanceItem[] =>
      texts.map((text, index) => ({
        id: `acc-demo-${String(index)}-${randomUUID().slice(0, 4)}`,
        text,
        done: false,
      }));
    const task = (
      id: string,
      title: string,
      goal: string,
      status: TaskStatus,
      priority: TaskPriority,
      ownerRoleId: string,
      reviewerRoleId: string,
      items: AcceptanceItem[],
      branch: string | null = null,
    ): Task => ({
      id,
      projectId: project.id,
      title,
      goal,
      status,
      priority,
      ownerRoleId,
      reviewerRoleId,
      acceptance: items,
      evidence: [],
      branch,
      verifyCommand: null,
      module: null,
      contractRef: null,
      requirementRefs: [],
      timeoutSeconds: null,
      riskTier: "normal",
      kind: "new",
      diagnosis: "",
      plan: "",
      integration: false,
      originTaskId: null,
      docsSynced: false,
      createdAt: at,
      updatedAt: at,
    });
    const tasks: Task[] = [
      task(
        "task-001",
        "确定项目范围与验收标准",
        "写清楚这一版做什么、不做什么，以及可验证的验收口径。",
        "done",
        "P0",
        "role-lead",
        "role-architect",
        acceptance("范围文档已评审", "非目标清单已确认", "验收口径已对齐").map(
          (item) => ({ ...item, done: true }),
        ),
      ),
      task(
        "task-002",
        "搭建项目骨架",
        "建立最小可运行结构，并确保测试命令可以执行。",
        "review",
        "P0",
        "role-architect",
        "role-verifier",
        acceptance("结构可运行", "测试命令可执行", "构建可重复").map(
          (item, index) => ({ ...item, done: index < 2 }),
        ),
        "task/002-skeleton",
      ),
      task(
        "task-003",
        "实现第一个功能",
        "完成一条可演示的功能链路，并补上边界测试。",
        "running",
        "P0",
        "role-builder",
        "role-architect",
        acceptance("功能可演示", "边界有测试", "无阻断缺陷").map(
          (item, index) => ({ ...item, done: index === 0 }),
        ),
        "task/003-first-feature",
      ),
      task(
        "task-004",
        "建立验证与记录基线",
        "每次合并都能跑同一套验证，并记录结果。",
        "ready",
        "P1",
        "role-verifier",
        "role-lead",
        acceptance("验证命令可重复", "结果有持久化记录"),
      ),
      task(
        "task-005",
        "首轮验收问题清单",
        "按验收标准走一遍，记录阻断、重要和建议问题。",
        "backlog",
        "P1",
        "role-lead",
        "role-verifier",
        acceptance("至少走完 1 条完整链路", "问题按阻断/重要/建议分级"),
      ),
    ];
    return {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      companyName: "AI工作室",
      createdAt: at,
      updatedAt: at,
      activeProjectId: project.id,
      projects: [project],
      stageGates: [],
      freezes: [],
      requirementDecisions: [],
      freezeChangeRequests: [],
      triggers: [],
      threads: [],
      workshops: [],
      providerProfiles: [],
      prototypeDemos: [],
      roles,
      modules: [],
      tasks,
      mergeProposals: [],
      runs: [],
      branches: tasks
        .filter((task) => task.branch !== null)
        .map((task) => ({
          id: `branch-${task.id}`,
          projectId: task.projectId,
          taskId: task.id,
          name: task.branch as string,
          goal: task.goal,
          roleId: task.ownerRoleId,
          contractKeys: [],
          status: task.status === "review" ? "review" as const : "open" as const,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })),
      contractChanges: [],
      decisions: [],
      verifications: [],
      reviews: [],
      events: [
        {
          id: "evt-demo",
          type: "studio.seeded",
          at,
          actor: "system",
          projectId: project.id,
          taskId: null,
          payload: { message: "演示项目已创建" },
        },
      ],
    };
  }