import {
  ALLOWED_TRANSITIONS,
  canTransition,
  isTaskPriority,
  isTaskStatus,
} from "../../shared/types.js";
import { StudioStoreError, newId, type StoreContext } from "./core.js";
import type {
  CreateTaskInput,
  StudioState,
  Task,
  TaskStatus,
  UpdateTaskInput,
} from "../../shared/types.js";
import {
  normalizeAcceptance,
  normalizeEvidence,
  optionalText,
  requiredText,
  textList,
} from "./inputs.js";
import { findTask, pickProject, resolveRoleId } from "./lookups.js";

function nextTaskNumber(state: StudioState, projectId: string): string {
  let max = 0;
  for (const task of state.tasks) {
    if (task.projectId !== projectId) continue;
    const match = /^T-(\d+)$/u.exec(task.number ?? "");
    if (match !== null) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `T-${String(max + 1).padStart(4, "0")}`;
}

function normalizeDependsOn(
  state: StudioState,
  projectId: string,
  taskId: string | null,
  value: string[] | undefined,
): string[] {
  if (value === undefined) return [];
  const unique = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
  for (const dependencyId of unique) {
    if (dependencyId === taskId) {
      throw new StudioStoreError("dependency_cycle", "任务不能依赖自己", 409);
    }
    const dependency = state.tasks.find(
      (item) => item.id === dependencyId && item.projectId === projectId,
    );
    if (dependency === undefined) {
      throw new StudioStoreError(
        "dependency_not_found",
        `依赖任务 ${dependencyId} 不存在或不属于当前项目`,
        404,
      );
    }
  }
  if (taskId !== null) {
    const visiting = new Set<string>();
    const visit = (currentId: string): boolean => {
      if (currentId === taskId) return true;
      if (visiting.has(currentId)) return false;
      visiting.add(currentId);
      const current = state.tasks.find((item) => item.id === currentId);
      if (current === undefined) return false;
      return current.dependsOn.some((next) => visit(next));
    };
    for (const dependencyId of unique) {
      if (visit(dependencyId)) {
        throw new StudioStoreError(
          "dependency_cycle",
          "任务依赖会形成循环",
          409,
        );
      }
    }
  }
  return unique;
}

export async function createTask(
  ctx: StoreContext,input: CreateTaskInput): Promise<Task> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const at = ctx.now();
      const ownerRoleId = resolveRoleId(
        state,
        project.id,
        input.ownerRoleId,
        "ownerRoleId",
      );
      const reviewerRoleId = resolveRoleId(
        state,
        project.id,
        input.reviewerRoleId,
        "reviewerRoleId",
      );
      const milestoneId = input.milestoneId ?? null;
      if (
        milestoneId !== null &&
        !state.milestones.some(
          (milestone) =>
            milestone.id === milestoneId && milestone.projectId === project.id,
        )
      ) {
        throw new StudioStoreError("milestone_not_found", "里程碑不存在", 404);
      }
      const task: Task = {
        id: newId("task"),
        projectId: project.id,
        number: nextTaskNumber(state, project.id),
        title: requiredText(input.title, "title", 160),
        goal: optionalText(input.goal, "goal", 2000),
        status: "backlog",
        priority: isTaskPriority(input.priority) ? input.priority : "P1",
        ownerRoleId,
        reviewerRoleId,
        acceptance: normalizeAcceptance(input.acceptance ?? []),
        evidence: [],
        branch: optionalText(input.branch, "branch", 160) || null,
        verifyCommand:
          optionalText(input.verifyCommand, "verifyCommand", 500) || null,
        module: optionalText(input.module, "module", 120) || null,
        contractRef:
          optionalText(input.contractRef, "contractRef", 300) || null,
        requirementRefs: textList(input.requirementRefs, "requirementRefs", 30),
        timeoutSeconds: input.timeoutSeconds ?? null,
        riskTier: input.riskTier ?? "normal",
        kind: input.kind === "fix" ? "fix" : "new",
        diagnosis: optionalText(input.diagnosis, "diagnosis", 4000),
        plan: optionalText(input.plan, "plan", 4000),
        integration: input.integration === true,
        dependsOn: normalizeDependsOn(
          state,
          project.id,
          null,
          input.dependsOn,
        ),
        milestoneId,
        originTaskId:
          optionalText(input.originTaskId, "originTaskId", 120) || null,
        docsSynced: false,
        createdAt: at,
        updatedAt: at,
      };
      state.tasks.push(task);
      ctx.recordEvent(state, {
        type: "task.created",
        at,
        projectId: project.id,
        taskId: task.id,
        payload: { title: task.title, priority: task.priority },
      });
      state.updatedAt = at;
      await ctx.save();
      return structuredClone(task);
    });
  }

export async function updateTask(
  ctx: StoreContext,taskId: string, input: UpdateTaskInput): Promise<Task> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
      if (task.status === "done") {
        throw new StudioStoreError(
          "task_locked",
          "已完成的任务不能直接修改，请创建一个后续任务",
        );
      }
      const at = ctx.now();
      if (input.title !== undefined) {
        task.title = requiredText(input.title, "title", 160);
      }
      if (input.goal !== undefined) {
        task.goal = optionalText(input.goal, "goal", 2000);
      }
      if (input.priority !== undefined) {
        if (!isTaskPriority(input.priority)) {
          throw new StudioStoreError("invalid_input", "priority 无效");
        }
        task.priority = input.priority;
      }
      if (input.ownerRoleId !== undefined) {
        task.ownerRoleId = resolveRoleId(
          state,
          task.projectId,
          input.ownerRoleId,
          "ownerRoleId",
        );
      }
      if (input.reviewerRoleId !== undefined) {
        task.reviewerRoleId = resolveRoleId(
          state,
          task.projectId,
          input.reviewerRoleId,
          "reviewerRoleId",
        );
      }
      if (input.acceptance !== undefined) {
        task.acceptance = normalizeAcceptance(input.acceptance, task.acceptance);
      }
      if (input.milestoneId !== undefined) {
    if (
      input.milestoneId !== null &&
      !state.milestones.some(
        (milestone) =>
          milestone.id === input.milestoneId &&
          milestone.projectId === task.projectId,
      )
    ) {
      throw new StudioStoreError("milestone_not_found", "里程碑不存在", 404);
    }
    task.milestoneId = input.milestoneId;
  }
  if (input.dependsOn !== undefined) {
        task.dependsOn = normalizeDependsOn(
          state,
          task.projectId,
          task.id,
          input.dependsOn,
        );
      }
      if (input.timeoutSeconds !== undefined) {
        task.timeoutSeconds = input.timeoutSeconds;
      }
      if (input.riskTier !== undefined) {
        task.riskTier = input.riskTier;
      }
      if (input.evidence !== undefined) {
        task.evidence = normalizeEvidence(input.evidence, task.evidence, at);
      }
      if (input.branch !== undefined) {
        task.branch = optionalText(input.branch, "branch", 160) || null;
      }
      if (input.verifyCommand !== undefined) {
        task.verifyCommand =
          optionalText(input.verifyCommand, "verifyCommand", 500) || null;
      }
      if (input.module !== undefined) {
        task.module = optionalText(input.module, "module", 120) || null;
      }
      if (input.contractRef !== undefined) {
        task.contractRef =
          optionalText(input.contractRef, "contractRef", 300) || null;
      }
      if (input.requirementRefs !== undefined) {
        task.requirementRefs = textList(
          input.requirementRefs,
          "requirementRefs",
          30,
        );
      }
      if (input.kind !== undefined) {
        task.kind = input.kind === "fix" ? "fix" : "new";
      }
      if (input.diagnosis !== undefined) {
        task.diagnosis = optionalText(input.diagnosis, "diagnosis", 4000);
      }
      if (input.plan !== undefined) {
        task.plan = optionalText(input.plan, "plan", 4000);
      }
      if (input.integration !== undefined) {
        task.integration = input.integration === true;
      }
      if (input.docsSynced !== undefined) {
        task.docsSynced = input.docsSynced === true;
      }
      task.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "task.updated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { fields: Object.keys(input) },
      });
      await ctx.save();
      return structuredClone(task);
    });
  }

export async function transitionTask(
  ctx: StoreContext,taskId: string, next: TaskStatus): Promise<Task> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
      if (task.status === next) {
        return structuredClone(task);
      }
      if (!isTaskStatus(next) || !canTransition(task.status, next)) {
        throw new StudioStoreError(
          "invalid_transition",
          `不能从「${task.status}」直接切换到「${String(next)}」`,
          409,
        );
      }
      if (next === "done") {
        if (task.acceptance.length === 0) {
          throw new StudioStoreError(
            "acceptance_required",
            "没有验收标准，不能完成任务",
            409,
          );
        }
        const open = task.acceptance.filter((item) => !item.done);
        if (open.length > 0) {
          throw new StudioStoreError(
            "acceptance_incomplete",
            `还有 ${String(open.length)} 条验收标准未完成`,
            409,
          );
        }
        if (task.evidence.length === 0) {
          throw new StudioStoreError(
            "evidence_required",
            "验收前至少记录一条可复现的证据（命令、测试或 replay）",
            409,
          );
        }
        const project = state.projects.find(
          (item) => item.id === task.projectId,
        );
        const latestCodeRun = [...state.runs]
          .filter(
            (item) =>
              item.taskId === task.id && item.workspacePath !== null,
          )
          .sort((left, right) =>
            right.startedAt.localeCompare(left.startedAt),
          )[0];
        const hasCodeRun = latestCodeRun !== undefined;
        const boundCommit =
          latestCodeRun?.commitSha === null ||
          latestCodeRun?.commitSha === undefined
            ? null
            : latestCodeRun.commitSha;
        const latestReview = [...state.reviews]
          .filter((review) => review.taskId === task.id)
          .sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt),
          )[0];
        const reviewPassed =
          boundCommit === null
            ? state.reviews.some(
                (review) =>
                  review.taskId === task.id &&
                  review.verdict === "pass",
              )
            : latestReview?.verdict === "pass" &&
              latestReview.runId === latestCodeRun?.id;
        const latestVerification = [...state.verifications]
          .filter((verification) => verification.taskId === task.id)
          .sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt),
          )[0];
        const verificationPassed =
          boundCommit === null
            ? latestVerification?.passed === true
            : latestVerification?.passed === true &&
              latestVerification.runId === latestCodeRun?.id;
        const reviewRequired =
          task.riskTier !== "trivial" || !verificationPassed;
        if (
          project?.repoPath !== null &&
          project?.repoPath !== undefined &&
          hasCodeRun &&
          reviewRequired &&
          !reviewPassed
        ) {
          throw new StudioStoreError(
            "review_required",
            boundCommit === null
              ? "代码任务完成前必须有一次通过的独立评审"
              : "当前提交缺少通过的独立评审，请重新评审",
            409,
          );
        }
        const hasDocs =
          project !== undefined &&
          (project.prdPath !== null ||
            project.invariantsPath !== null ||
            project.modulesPath !== null);
        if (hasDocs && !task.docsSynced) {
          throw new StudioStoreError(
            "docs_sync_required",
            "项目已绑定 PRD/INVARIANTS/MODULES，完成前必须确认文档已同步",
            409,
          );
        }
      }
      const from = task.status;
      const at = ctx.now();
      task.status = next;
      task.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "task.transitioned",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { from, to: next },
      });
      if (next === "done") {
        scheduleIntegrationGate(ctx, state, task.projectId, at);
      }
      await ctx.save();
      return structuredClone(task);
    });
  }

export function scheduleIntegrationGate(
    ctx: StoreContext,
    state: StudioState,
    projectId: string,
    at: string,
  ): void {
    const done = state.tasks.filter(
      (item) => item.projectId === projectId && item.status === "done",
    ).length;
    const generated = state.tasks.filter(
      (item) =>
        item.projectId === projectId &&
        item.title.startsWith("集成验收（自动 #"),
    ).length;
    if (Math.floor(done / 3) <= generated) return;
    const lead =
      state.roles.find(
        (role) =>
          role.projectId === projectId &&
          (role.id === "role-lead" || role.title.includes("制作人")),
      ) ?? state.roles.find((role) => role.projectId === projectId);
    const verifier =
      state.roles.find(
        (role) =>
          role.projectId === projectId &&
          (role.id === "role-verifier" || role.title.includes("QA")),
      ) ?? lead;
    if (lead === undefined) return;
    const index = generated + 1;
    const task: Task = {
      id: newId("task"),
      projectId,
      number: nextTaskNumber(state, projectId),
      title: `集成验收（自动 #${String(index)}）`,
      goal: "每 3 个完成任务后的集成 gate：打包当前 build，人玩 10 分钟，记录阻断问题与可继续迭代的判断。",
      status: "backlog",
      priority: "P1",
      ownerRoleId: lead.id,
      reviewerRoleId: verifier?.id ?? lead.id,
      acceptance: [
        {
          id: newId("acc"),
          text: "打包出可运行 build",
          done: false,
        },
        {
          id: newId("acc"),
          text: "人玩 10 分钟并记录阻断问题",
          done: false,
        },
      ],
      evidence: [],
      branch: null,
      verifyCommand: "npm test",
      module: null,
      contractRef: null,
      requirementRefs: [],
      timeoutSeconds: null,
      riskTier: "normal",
      kind: "new",
      diagnosis: "",
      plan: "",
      integration: true,
      dependsOn: [],
      milestoneId: null,
      originTaskId: null,
      docsSynced: false,
      createdAt: at,
      updatedAt: at,
    };
    state.tasks.push(task);
    ctx.recordEvent(state, {
      type: "integration.scheduled",
      at,
      projectId,
      taskId: task.id,
      payload: { index, doneTasks: done },
    });
  }

export async function listTransitions(
  ctx: StoreContext,taskId: string): Promise<TaskStatus[]> {
    return ctx.runExclusive(async () => {
      const task = findTask(ctx.requireState(), taskId);
      return [...ALLOWED_TRANSITIONS[task.status]];
    });
  }

