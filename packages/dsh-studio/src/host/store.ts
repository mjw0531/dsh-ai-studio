import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ALLOWED_TRANSITIONS,
  MERGE_STATUS_LABELS,
  STUDIO_PLUGIN_VERSION,
  STUDIO_SCHEMA_VERSION,
  canTransition,
  isTaskPriority,
  isTaskStatus,
} from "../shared/types.js";
import type {
  AcceptanceItem,
  AgentReceipt,
  AgentRun,
  AgentRunStatus,
  BootstrapResponse,
  Branch,
  CompanyHealth,
  CompanyProjectSummary,
  CompanyRisk,
  CompanySummary,
  CompanyTotals,
  ContractChange,
  CreateDecisionInput,
  CreateModuleInput,
  DecideDecisionInput,
  Decision,
  IndependentReview,
  Module,
  UpdateModuleInput,
  CreateMergeProposalInput,
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  EvidenceItem,
  MergeProposal,
  MergeRisk,
  OwnerNeed,
  Project,
  Role,
  RoleLoadSummary,
  StudioEvent,
  StudioState,
  StudioStats,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateProjectInput,
  UpdateTaskInput,
  Verification,
} from "../shared/types.js";

export class StudioStoreError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "StudioStoreError";
    this.code = code;
    this.status = status;
  }
}

export interface StudioStoreOptions {
  dataDir?: string;
  now?: () => Date;
}

interface StoreSnapshot {
  state: StudioState;
  warning: string | null;
}

export function defaultStudioDataDir(): string {
  const home = process.env.DSH_HOME?.trim();
  return path.join(
    home !== undefined && home !== "" ? home : path.join(os.homedir(), ".dsh"),
    "studio",
  );
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
  }
  const text = value.trim();
  if (text === "") {
    throw new StudioStoreError("invalid_input", `${field} 不能为空`);
  }
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} 不能超过 ${String(max)} 个字符`,
    );
  }
  return text;
}

function optionalText(value: unknown, field: string, max = 4000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} 不能超过 ${String(max)} 个字符`,
    );
  }
  return text;
}

function optionalTokenBudget(
  value: unknown,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} 必须是非负整数 token 数`,
    );
  }
  return value === 0 ? null : value;
}

function textList(value: unknown, field: string, maxItems = 20): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", `${field} 必须是数组`);
  }
  return value
    .slice(0, maxItems)
    .map((item, index) => requiredText(item, `${field}[${String(index)}]`, 400));
}

function normalizeAcceptance(
  value: unknown,
  existing: AcceptanceItem[] = [],
): AcceptanceItem[] {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "acceptance 必须是数组");
  }
  if (value.length === 0) {
    throw new StudioStoreError(
      "acceptance_required",
      "至少需要一条可验证的验收标准",
    );
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 20).map((raw, index) => {
    if (typeof raw === "string") {
      const text = requiredText(raw, `acceptance[${String(index)}]`, 400);
      return { id: newId("acc"), text, done: false };
    }
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `acceptance[${String(index)}] 必须是字符串或对象`,
      );
    }
    const text = requiredText(
      raw.text,
      `acceptance[${String(index)}].text`,
      400,
    );
    const id =
      typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("acc");
    const previous = byId.get(id);
    return {
      id,
      text,
      done: typeof raw.done === "boolean" ? raw.done : (previous?.done ?? false),
    };
  });
}

function normalizeEvidence(
  value: unknown,
  existing: EvidenceItem[],
  at: string,
): EvidenceItem[] {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "evidence 必须是数组");
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 50).map((raw, index) => {
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `evidence[${String(index)}] 必须是对象`,
      );
    }
    const text = requiredText(raw.text, `evidence[${String(index)}].text`, 800);
    const id =
      typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("ev");
    const previous = byId.get(id);
    return {
      id,
      text,
      createdAt:
        previous?.createdAt ??
        (typeof raw.createdAt === "string" ? raw.createdAt : at),
    };
  });
}

function statsFor(
  tasks: Task[],
  proposals: MergeProposal[] = [],
): StudioStats {
  const stats: StudioStats = {
    total: tasks.length,
    backlog: 0,
    ready: 0,
    running: 0,
    blocked: 0,
    review: 0,
    done: 0,
    acceptanceDone: 0,
    acceptanceTotal: 0,
    mergeReview: 0,
    mergeApproved: 0,
    mergeMerged: 0,
  };
  for (const task of tasks) {
    stats[task.status] += 1;
    stats.acceptanceTotal += task.acceptance.length;
    stats.acceptanceDone += task.acceptance.filter((item) => item.done).length;
  }
  for (const proposal of proposals) {
    if (proposal.status === "review") stats.mergeReview += 1;
    else if (proposal.status === "approved") stats.mergeApproved += 1;
    else if (proposal.status === "merged") stats.mergeMerged += 1;
  }
  return stats;
}

const STALE_TASK_HOURS = 72;
const AGING_MERGE_HOURS = 48;

function hoursSince(iso: string, now: Date): number | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, (now.getTime() - at) / 3_600_000);
}

function latestIso(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestAt = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const at = Date.parse(value);
    if (Number.isNaN(at) || at <= latestAt) continue;
    latest = value;
    latestAt = at;
  }
  return latest;
}

/**
 * Company-level projection: every project, every owner-facing exception, and
 * the aggregate numbers the Owner Dashboard needs. It is derived from the same
 * durable state, so it never becomes a second source of truth.
 */
function buildCompany(state: StudioState, now: Date): CompanySummary {
  const projects: CompanyProjectSummary[] = [];
  const needs: OwnerNeed[] = [];
  const roles: RoleLoadSummary[] = [];
  const risk: CompanyRisk = {
    staleTasks: 0,
    agingMerges: 0,
    missingEvidence: 0,
    blocked: 0,
    unowned: 0,
  };
  const totals: CompanyTotals = {
    projects: 0,
    activeProjects: 0,
    tasks: 0,
    openTasks: 0,
    inReview: 0,
    blocked: 0,
    mergePending: 0,
    merged: 0,
    done: 0,
    acceptanceDone: 0,
    acceptanceTotal: 0,
    runs: 0,
    runningRuns: 0,
    tokensUsed: 0,
    pendingDecisions: 0,
    decidedDecisions: 0,
  };

  for (const project of state.projects) {
    const projectTasks = state.tasks.filter(
      (task) => task.projectId === project.id,
    );
    const projectProposals = state.mergeProposals.filter(
      (proposal) => proposal.projectId === project.id,
    );
    const projectRoles = state.roles.filter(
      (role) => role.projectId === project.id,
    );
    const projectRuns = state.runs.filter(
      (run) => run.projectId === project.id,
    );
    const projectDecisions = state.decisions.filter(
      (decision) => decision.projectId === project.id,
    );
    const roleById = new Map(projectRoles.map((role) => [role.id, role]));
    const stats = statsFor(projectTasks, projectProposals);
    const projectNeeds: OwnerNeed[] = [];
    const openTasks = projectTasks.filter((task) => task.status !== "done");
    const activeTasks = projectTasks.filter(
      (task) => task.status === "running" || task.status === "review",
    );
    const activeRoleIds = new Set(
      activeTasks
        .map((task) => task.ownerRoleId)
        .filter((id): id is string => id !== null),
    );

    for (const task of projectTasks) {
      const owner = task.ownerRoleId === null
        ? null
        : roleById.get(task.ownerRoleId);
      const acceptanceDone = task.acceptance.filter((item) => item.done).length;
      const age = hoursSince(task.updatedAt, now);

      if (task.status === "blocked") {
        risk.blocked += 1;
        totals.blocked += 1;
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-blocked`,
          kind: "task_blocked",
          severity: "critical",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `任务阻塞：${task.title}`,
          detail: "需要解除阻塞、重新规划，或由你决定是否暂停",
          ageHours: age === null ? null : Math.round(age),
        });
      }

      if (task.status === "review" && task.evidence.length === 0) {
        risk.missingEvidence += 1;
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-evidence`,
          kind: "missing_evidence",
          severity: "warning",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `缺证据：${task.title}`,
          detail: "验收前至少需要一条可复现的测试、命令或 replay",
          ageHours: age === null ? null : Math.round(age),
        });
      } else if (task.status === "review") {
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-review`,
          kind: "task_review",
          severity: "warning",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `待验收：${task.title}`,
          detail: `${owner?.name ?? "未指派"} · 验收 ${String(acceptanceDone)}/${String(task.acceptance.length)}`,
          ageHours: age === null ? null : Math.round(age),
        });
      }

      if (
        task.status !== "done" &&
        age !== null &&
        age > STALE_TASK_HOURS
      ) {
        risk.staleTasks += 1;
        if (task.status !== "blocked" && task.status !== "review") {
          projectNeeds.push({
            id: `need-${project.id}-${task.id}-stale`,
            kind: "stale_task",
            severity: "warning",
            projectId: project.id,
            projectName: project.name,
            taskId: task.id,
            proposalId: null,
            title: `任务停滞：${task.title}`,
            detail: `已经 ${String(Math.round(age))} 小时没有更新`,
            ageHours: Math.round(age),
          });
        }
      }

      if (
        task.status !== "done" &&
        task.status !== "backlog" &&
        task.ownerRoleId === null
      ) {
        risk.unowned += 1;
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-unowned`,
          kind: "unowned_task",
          severity: "info",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `无人负责：${task.title}`,
          detail: "任务已进入执行区，但没有负责人",
          ageHours: age === null ? null : Math.round(age),
        });
      }
    }

    for (const proposal of projectProposals) {
      if (proposal.status !== "review" && proposal.status !== "approved") {
        continue;
      }
      const task = projectTasks.find((item) => item.id === proposal.taskId);
      const age = hoursSince(proposal.createdAt, now);
      if (age !== null && age > AGING_MERGE_HOURS) {
        risk.agingMerges += 1;
      }
      projectNeeds.push({
        id: `need-${project.id}-${proposal.id}-merge`,
        kind: proposal.status === "review" ? "merge_review" : "merge_approved",
        severity: "warning",
        projectId: project.id,
        projectName: project.name,
        taskId: proposal.taskId,
        proposalId: proposal.id,
        title:
          proposal.status === "review"
            ? `合并待评审：${task?.title ?? proposal.taskId}`
            : `合并已批准，等待执行：${task?.title ?? proposal.taskId}`,
        detail: `${proposal.branch} → ${proposal.base} · ${proposal.risk}`,
        ageHours: age === null ? null : Math.round(age),
      });
    }

    if (projectRoles.length === 0) {
      projectNeeds.push({
        id: `need-${project.id}-setup`,
        kind: "project_setup",
        severity: "info",
        projectId: project.id,
        projectName: project.name,
        taskId: null,
        proposalId: null,
        title: `项目还没配置角色：${project.name}`,
        detail: "至少需要一个角色，任务才有负责人和验收人",
        ageHours: null,
      });
    } else if (projectTasks.length === 0) {
      projectNeeds.push({
        id: `need-${project.id}-empty`,
        kind: "project_setup",
        severity: "info",
        projectId: project.id,
        projectName: project.name,
        taskId: null,
        proposalId: null,
        title: `项目还没有任务：${project.name}`,
        detail: "创建第一条带验收标准的任务，项目才开始运转",
        ageHours: null,
      });
    }

    const isActive =
      projectTasks.some(
        (task) => task.status !== "backlog" && task.status !== "done",
      ) ||
      projectProposals.some(
        (proposal) =>
          proposal.status === "review" || proposal.status === "approved",
      );
    if (isActive) totals.activeProjects += 1;
    totals.projects += 1;
    totals.tasks += stats.total;
    totals.openTasks += openTasks.length;
    totals.inReview += stats.review;
    totals.mergePending += stats.mergeReview + stats.mergeApproved;
    totals.merged += stats.mergeMerged;
    totals.done += stats.done;
    totals.acceptanceDone += stats.acceptanceDone;
    totals.acceptanceTotal += stats.acceptanceTotal;
    totals.runs += projectRuns.length;
    totals.runningRuns += projectRuns.filter(
      (run) => run.status === "running",
    ).length;
    totals.tokensUsed += projectRuns.reduce(
      (sum, run) => sum + (run.tokens ?? 0),
      0,
    );
    totals.pendingDecisions += projectDecisions.filter(
      (decision) => decision.status === "pending",
    ).length;
    totals.decidedDecisions += projectDecisions.filter(
      (decision) => decision.status !== "pending",
    ).length;

    for (const decision of projectDecisions) {
      if (decision.status !== "pending") continue;
      projectNeeds.push({
        id: `need-decision-${decision.id}`,
        kind: "decision",
        severity: "warning",
        projectId: project.id,
        projectName: project.name,
        taskId: decision.taskId,
        proposalId: null,
        title: `待裁决：${decision.title}`,
        detail:
          decision.recommendation === ""
            ? "需要 Owner 在董事会批准或拒绝"
            : decision.recommendation,
        ageHours: hoursSince(decision.createdAt, now),
      });
    }

    for (const role of projectRoles) {
      const assigned = projectTasks.filter(
        (task) => task.ownerRoleId === role.id,
      );
      const active = assigned.filter(
        (task) => task.status === "running" || task.status === "review",
      ).length;
      const review = assigned.filter((task) => task.status === "review").length;
      const open = assigned.filter((task) => task.status !== "done").length;
      roles.push({
        roleId: role.id,
        roleName: role.name,
        roleTitle: role.title,
        projectId: project.id,
        projectName: project.name,
        activeTasks: active,
        reviewTasks: review,
        openTasks: open,
        state: active >= 3 ? "overloaded" : active >= 1 ? "busy" : "idle",
      });
    }

    const health: CompanyHealth =
      projectNeeds.some((need) => need.severity === "critical")
        ? "critical"
        : projectNeeds.length > 0
          ? "attention"
          : "steady";
    const lastActivityAt = latestIso([
      project.updatedAt,
      ...projectTasks.map((task) => task.updatedAt),
      ...projectProposals.map((proposal) => proposal.updatedAt),
      ...state.events
        .filter((event) => event.projectId === project.id)
        .map((event) => event.at),
    ]);

    projects.push({
      project,
      stats,
      roleCount: projectRoles.length,
      activeRoleCount: activeRoleIds.size,
      openTasks: openTasks.length,
      health,
      lastActivityAt,
      openNeeds: projectNeeds.length,
    });
    needs.push(...projectNeeds);
  }

  const healthRank: Record<CompanyHealth, number> = {
    critical: 0,
    attention: 1,
    steady: 2,
  };
  projects.sort((left, right) => {
    const byHealth = healthRank[left.health] - healthRank[right.health];
    if (byHealth !== 0) return byHealth;
    return (right.lastActivityAt ?? "").localeCompare(
      left.lastActivityAt ?? "",
    );
  });
  const severityRank: Record<OwnerNeed["severity"], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  needs.sort((left, right) => {
    const bySeverity =
      severityRank[left.severity] - severityRank[right.severity];
    if (bySeverity !== 0) return bySeverity;
    return (right.ageHours ?? 0) - (left.ageHours ?? 0);
  });
  roles.sort((left, right) => right.activeTasks - left.activeTasks);

  return {
    totals,
    projects,
    needs: needs.slice(0, 30),
    roles,
    risk,
    recentEvents: [...state.events].slice(-20).reverse(),
    generatedAt: now.toISOString(),
  };
}

function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (value.tokenBudget === null || typeof value.tokenBudget === "number") &&
    (value.repoPath === null || typeof value.repoPath === "string") &&
    (value.prdPath === null ||
      value.prdPath === undefined ||
      typeof value.prdPath === "string") &&
    (value.invariantsPath === null ||
      value.invariantsPath === undefined ||
      typeof value.invariantsPath === "string") &&
    (value.modulesPath === null ||
      value.modulesPath === undefined ||
      typeof value.modulesPath === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isRole(value: unknown): value is Role {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.name === "string" &&
    typeof value.title === "string" &&
    typeof value.mission === "string" &&
    Array.isArray(value.responsibilities) &&
    Array.isArray(value.nonGoals) &&
    Array.isArray(value.decisionRights) &&
    (value.model === null || typeof value.model === "string") &&
    (value.tokenBudget === null || typeof value.tokenBudget === "number") &&
    (value.dailyTokenBudget === null ||
      typeof value.dailyTokenBudget === "number")
  );
}

function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed"
  );
}

function isAgentRun(value: unknown): value is AgentRun {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.taskId === "string" &&
    (value.roleId === null || typeof value.roleId === "string") &&
    (value.branchId === null || typeof value.branchId === "string") &&
    (value.branchName === null || typeof value.branchName === "string") &&
    (value.workspacePath === null || typeof value.workspacePath === "string") &&
    (value.diffStat === null || typeof value.diffStat === "string") &&
    (value.sessionId === null || typeof value.sessionId === "string") &&
    isAgentRunStatus(value.status) &&
    (value.model === null || typeof value.model === "string") &&
    typeof value.prompt === "string" &&
    typeof value.output === "string" &&
    (value.receipt === null || isRecord(value.receipt)) &&
    (value.tokens === null || typeof value.tokens === "number") &&
    (value.budgetWarning === null ||
      typeof value.budgetWarning === "string") &&
    (value.error === null || typeof value.error === "string") &&
    typeof value.startedAt === "string" &&
    (value.endedAt === null || typeof value.endedAt === "string")
  );
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.title === "string" &&
    typeof value.goal === "string" &&
    isTaskStatus(value.status) &&
    isTaskPriority(value.priority) &&
    Array.isArray(value.acceptance) &&
    Array.isArray(value.evidence) &&
    (value.verifyCommand === null ||
      value.verifyCommand === undefined ||
      typeof value.verifyCommand === "string") &&
    (value.module === null ||
      value.module === undefined ||
      typeof value.module === "string") &&
    (value.contractRef === null ||
      value.contractRef === undefined ||
      typeof value.contractRef === "string") &&
    (value.kind === undefined ||
      value.kind === "new" ||
      value.kind === "fix") &&
    (value.integration === undefined ||
      typeof value.integration === "boolean") &&
    (value.originTaskId === null ||
      value.originTaskId === undefined ||
      typeof value.originTaskId === "string") &&
    (value.docsSynced === undefined ||
      typeof value.docsSynced === "boolean") &&
    (value.diagnosis === undefined ||
      typeof value.diagnosis === "string") &&
    (value.plan === undefined || typeof value.plan === "string")
  );
}

function isMergeRisk(value: unknown): value is MergeRisk {
  return value === "low" || value === "medium" || value === "high";
}

function isMergeProposal(value: unknown): value is MergeProposal {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.taskId === "string" &&
    typeof value.branch === "string" &&
    typeof value.base === "string" &&
    typeof value.summary === "string" &&
    isMergeRisk(value.risk) &&
    typeof value.rollback === "string" &&
    (value.status === "review" ||
      value.status === "approved" ||
      value.status === "rejected" ||
      value.status === "merged") &&
    typeof value.reviewNote === "string" &&
    (value.mergeCommit === null || typeof value.mergeCommit === "string") &&
    (value.diffStat === null ||
      value.diffStat === undefined ||
      typeof value.diffStat === "string") &&
    (Array.isArray(value.changedFiles) || value.changedFiles === undefined) &&
    (value.verificationId === null ||
      value.verificationId === undefined ||
      typeof value.verificationId === "string") &&
    (value.postMergeVerificationId === null ||
      value.postMergeVerificationId === undefined ||
      typeof value.postMergeVerificationId === "string") &&
    (value.rollbackCommit === null ||
      value.rollbackCommit === undefined ||
      typeof value.rollbackCommit === "string") &&
    (value.rolledBackAt === null ||
      value.rolledBackAt === undefined ||
      typeof value.rolledBackAt === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.decidedAt === null || typeof value.decidedAt === "string") &&
    (value.mergedAt === null || typeof value.mergedAt === "string")
  );
}

/**
 * Migrate an older on-disk state. v1 had no merge proposals; the collection is
 * additive, so no task or role rewrite is needed.
 */
function isDecisionStatus(value: unknown): value is Decision["status"] {
  return value === "pending" || value === "approved" || value === "rejected";
}

function isDecision(value: unknown): value is Decision {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    (value.taskId === null || typeof value.taskId === "string") &&
    (value.runId === null || typeof value.runId === "string") &&
    typeof value.title === "string" &&
    typeof value.context === "string" &&
    Array.isArray(value.options) &&
    typeof value.recommendation === "string" &&
    (value.reversible === undefined ||
      typeof value.reversible === "boolean") &&
    (value.adrDraft === null ||
      value.adrDraft === undefined ||
      typeof value.adrDraft === "string") &&
    (value.adrPath === null ||
      value.adrPath === undefined ||
      typeof value.adrPath === "string") &&
    isDecisionStatus(value.status) &&
    typeof value.decision === "string" &&
    typeof value.note === "string" &&
    typeof value.decidedBy === "string" &&
    (value.tokenCost === null || typeof value.tokenCost === "number") &&
    typeof value.createdAt === "string" &&
    (value.decidedAt === null || typeof value.decidedAt === "string")
  );
}

function isBranchStatus(value: unknown): value is Branch["status"] {
  return (
    value === "open" ||
    value === "review" ||
    value === "merged" ||
    value === "abandoned"
  );
}

function isBranch(value: unknown): value is Branch {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    (value.taskId === null || typeof value.taskId === "string") &&
    typeof value.name === "string" &&
    typeof value.goal === "string" &&
    (value.roleId === null || typeof value.roleId === "string") &&
    Array.isArray(value.contractKeys) &&
    isBranchStatus(value.status) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isContractChange(value: unknown): value is ContractChange {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.branchId === "string" &&
    (value.taskId === null || typeof value.taskId === "string") &&
    (value.runId === null || typeof value.runId === "string") &&
    typeof value.contract === "string" &&
    typeof value.change === "string" &&
    typeof value.createdAt === "string"
  );
}

function isVerification(value: unknown): value is Verification {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.taskId === "string" &&
    (value.runId === null || typeof value.runId === "string") &&
    typeof value.command === "string" &&
    typeof value.workdir === "string" &&
    typeof value.exitCode === "number" &&
    typeof value.output === "string" &&
    typeof value.passed === "boolean" &&
    typeof value.createdAt === "string"
  );
}

function isReview(value: unknown): value is IndependentReview {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.taskId === "string" &&
    (value.runId === null || typeof value.runId === "string") &&
    (value.reviewerRoleId === null ||
      typeof value.reviewerRoleId === "string") &&
    (value.model === null || typeof value.model === "string") &&
    (value.verdict === "pass" || value.verdict === "fail") &&
    typeof value.summary === "string" &&
    Array.isArray(value.findings) &&
    (value.tokens === null || typeof value.tokens === "number") &&
    typeof value.createdAt === "string"
  );
}

function isModule(value: unknown): value is Module {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.name === "string" &&
    typeof value.responsibility === "string" &&
    (value.contractPath === null ||
      typeof value.contractPath === "string") &&
    typeof value.contractText === "string" &&
    Array.isArray(value.allowedPaths) &&
    Array.isArray(value.forbiddenPaths) &&
    Array.isArray(value.dependsOn) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function migrateState(value: unknown): StudioState {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  let state = value as unknown as StudioState;
  if (state.schemaVersion === 1) {
    state = {
      ...state,
      schemaVersion: 2,
      mergeProposals: [],
    };
  }
  if (state.schemaVersion === 2) {
    state = {
      ...state,
      schemaVersion: 3,
      projects: state.projects.map((project) => ({
        ...project,
        tokenBudget: project.tokenBudget ?? null,
      })),
      roles: state.roles.map((role) => ({
        ...role,
        model: role.model ?? null,
        tokenBudget: role.tokenBudget ?? null,
        dailyTokenBudget: role.dailyTokenBudget ?? null,
      })),
      runs: Array.isArray(
        (state as unknown as { runs?: unknown }).runs,
      )
        ? ((state as unknown as { runs: AgentRun[] }).runs)
        : [],
    };
  }
  if (state.schemaVersion === 3) {
    state = {
      ...state,
      schemaVersion: 4,
      decisions: [],
    };
  }
  if (state.schemaVersion === 4) {
    state = {
      ...state,
      schemaVersion: 5,
      runs: state.runs.map((run) => ({
        ...run,
        branchId: run.branchId ?? null,
      })),
      branches: state.tasks
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
    };
  }
  if (state.schemaVersion === 5) {
    state = {
      ...state,
      schemaVersion: 6,
      projects: state.projects.map((project) => ({
        ...project,
        repoPath: project.repoPath ?? null,
      })),
      runs: state.runs.map((run) => ({
        ...run,
        branchName: run.branchName ?? null,
        workspacePath: run.workspacePath ?? null,
        diffStat: run.diffStat ?? null,
      })),
    };
  }
  if (state.schemaVersion === 6) {
    state = {
      ...state,
      schemaVersion: 7,
      tasks: state.tasks.map((task) => ({
        ...task,
        verifyCommand: task.verifyCommand ?? null,
      })),
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        diffStat: proposal.diffStat ?? null,
        changedFiles: Array.isArray(proposal.changedFiles)
          ? proposal.changedFiles
          : [],
        verificationId: proposal.verificationId ?? null,
      })),
      verifications: Array.isArray(
        (state as unknown as { verifications?: unknown }).verifications,
      )
        ? ((state as unknown as { verifications: Verification[] }).verifications)
        : [],
    };
  }
  if (state.schemaVersion === 7) {
    state = {
      ...state,
      schemaVersion: 8,
      tasks: state.tasks.map((task) => ({
        ...task,
        module: task.module ?? null,
        contractRef: task.contractRef ?? null,
        kind: task.kind ?? "new",
      })),
    };
  }
  if (state.schemaVersion === 8) {
    state = {
      ...state,
      schemaVersion: 9,
      projects: state.projects.map((project) => ({
        ...project,
        prdPath: project.prdPath ?? null,
        invariantsPath: project.invariantsPath ?? null,
        modulesPath: project.modulesPath ?? null,
      })),
      modules: Array.isArray(
        (state as unknown as { modules?: unknown }).modules,
      )
        ? ((state as unknown as { modules: Module[] }).modules)
        : [],
    };
  }
  if (state.schemaVersion === 9) {
    state = {
      ...state,
      schemaVersion: 10,
      tasks: state.tasks.map((task) => ({
        ...task,
        integration: task.integration ?? false,
        originTaskId: task.originTaskId ?? null,
      })),
    };
  }
  if (state.schemaVersion === 10) {
    state = {
      ...state,
      schemaVersion: 11,
      reviews: Array.isArray(
        (state as unknown as { reviews?: unknown }).reviews,
      )
        ? ((state as unknown as { reviews: IndependentReview[] }).reviews)
        : [],
    };
  }
  if (state.schemaVersion === 11) {
    state = {
      ...state,
      schemaVersion: 12,
      tasks: state.tasks.map((task) => ({
        ...task,
        docsSynced: task.docsSynced ?? false,
      })),
      decisions: state.decisions.map((decision) => ({
        ...decision,
        reversible: decision.reversible ?? true,
      })),
    };
  }
  if (state.schemaVersion === 12) {
    state = {
      ...state,
      schemaVersion: 13,
      decisions: state.decisions.map((decision) => ({
        ...decision,
        adrDraft: decision.adrDraft ?? null,
      })),
    };
  }
  if (state.schemaVersion === 13) {
    state = {
      ...state,
      schemaVersion: 14,
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        postMergeVerificationId:
          proposal.postMergeVerificationId ?? null,
      })),
    };
  }
  if (state.schemaVersion === 14) {
    state = {
      ...state,
      schemaVersion: 15,
      decisions: state.decisions.map((decision) => ({
        ...decision,
        adrPath: decision.adrPath ?? null,
      })),
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        rollbackCommit: proposal.rollbackCommit ?? null,
        rolledBackAt: proposal.rolledBackAt ?? null,
      })),
    };
  }
  if (state.schemaVersion === 15) {
    return {
      ...state,
      schemaVersion: STUDIO_SCHEMA_VERSION,
      tasks: state.tasks.map((task) => ({
        ...task,
        diagnosis: task.diagnosis ?? "",
        plan: task.plan ?? "",
      })),
    };
  }
  return state;
}

function assertState(value: unknown): asserts value is StudioState {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  if (value.schemaVersion !== STUDIO_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Studio schema version: ${String(value.schemaVersion)}`,
    );
  }
  if (
    !Array.isArray(value.projects) ||
    !Array.isArray(value.roles) ||
    !Array.isArray(value.modules) ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.mergeProposals) ||
    !Array.isArray(value.runs) ||
    !Array.isArray(value.branches) ||
    !Array.isArray(value.contractChanges) ||
    !Array.isArray(value.decisions) ||
    !Array.isArray(value.verifications) ||
    !Array.isArray(value.reviews) ||
    !Array.isArray(value.events)
  ) {
    throw new Error("Studio state collections are missing");
  }
  if (!value.projects.every(isProject)) {
    throw new Error("Studio state contains an invalid project");
  }
  if (!value.roles.every(isRole)) {
    throw new Error("Studio state contains an invalid role");
  }
  if (!value.modules.every(isModule)) {
    throw new Error("Studio state contains an invalid module");
  }
  if (!value.tasks.every(isTask)) {
    throw new Error("Studio state contains an invalid task");
  }
  if (!value.mergeProposals.every(isMergeProposal)) {
    throw new Error("Studio state contains an invalid merge proposal");
  }
  if (!value.runs.every(isAgentRun)) {
    throw new Error("Studio state contains an invalid agent run");
  }
  if (!value.branches.every(isBranch)) {
    throw new Error("Studio state contains an invalid branch");
  }
  if (!value.contractChanges.every(isContractChange)) {
    throw new Error("Studio state contains an invalid contract change");
  }
  if (!value.verifications.every(isVerification)) {
    throw new Error("Studio state contains an invalid verification");
  }
  if (!value.reviews.every(isReview)) {
    throw new Error("Studio state contains an invalid review");
  }
  if (!value.decisions.every(isDecision)) {
    throw new Error("Studio state contains an invalid decision");
  }
}

export class StudioStore {
  readonly dataDir: string;
  readonly file: string;
  private readonly now: () => Date;
  private state: StudioState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private warning: string | null = null;

  constructor(options: StudioStoreOptions = {}) {
    this.dataDir = options.dataDir ?? defaultStudioDataDir();
    this.file = path.join(this.dataDir, "studio.json");
    this.now = options.now ?? (() => new Date());
  }

  async init(): Promise<void> {
    await this.runExclusive(async () => {
      await this.load();
    });
  }

  getWarning(): string | null {
    return this.warning;
  }

  async bootstrap(projectId?: string): Promise<BootstrapResponse> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, projectId);
      const roles = project === null
        ? []
        : state.roles.filter((role) => role.projectId === project.id);
      const modules = project === null
        ? []
        : state.modules.filter((module) => module.projectId === project.id);
      const tasks = project === null
        ? []
        : state.tasks.filter((task) => task.projectId === project.id);
      const mergeProposals = project === null
        ? []
        : state.mergeProposals.filter(
            (proposal) => proposal.projectId === project.id,
          );
      const runs = project === null
        ? []
        : state.runs
            .filter((run) => run.projectId === project.id)
            .sort((left, right) =>
              right.startedAt.localeCompare(left.startedAt),
            );
      const branches = project === null
        ? []
        : state.branches
            .filter((branch) => branch.projectId === project.id)
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            );
      const contractChanges = project === null
        ? []
        : state.contractChanges.filter(
            (change) => change.projectId === project.id,
          );
      const verifications = project === null
        ? []
        : state.verifications
            .filter((verification) => verification.projectId === project.id)
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            );
      const reviews = project === null
        ? []
        : state.reviews
            .filter((review) => review.projectId === project.id)
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            );
      const decisions = project === null
        ? []
        : state.decisions
            .filter((decision) => decision.projectId === project.id)
            .sort((left, right) => {
              if (left.status !== right.status) {
                if (left.status === "pending") return -1;
                if (right.status === "pending") return 1;
              }
              return right.createdAt.localeCompare(left.createdAt);
            });
      const events = [...state.events]
        .filter((event) => project === null || event.projectId === project.id)
        .slice(-30)
        .reverse();
      const now = this.now();
      return {
        app: {
          pluginVersion: STUDIO_PLUGIN_VERSION,
          dshVersion: "unknown",
          compatibility: {
            status: "unknown",
            testedWith: "0.2.1-rc.2",
            message: "",
          },
          dataDir: this.dataDir,
          schemaVersion: STUDIO_SCHEMA_VERSION,
          serverTime: now.toISOString(),
        },
        projects: [...state.projects],
        activeProjectId: state.activeProjectId,
        project,
        roles,
        modules,
        tasks,
        mergeProposals,
        runs,
        branches,
        contractChanges,
        decisions,
        verifications,
        reviews,
        stats: statsFor(tasks, mergeProposals),
        events,
        company: buildCompany(state, now),
        features: {
          independentPage: true,
          filePersistence: true,
          mergeGovernance: true,
          ownerDashboard: true,
          agentExecution: true,
          decisionBoard: true,
          branchBoard: true,
          codeExecution: true,
          verification: true,
          knowledge: true,
          contractGuard: true,
          independentReview: true,
          mergeExecution: true,
          gitMerge: false,
        },
      };
    });
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const at = nowIso(this.now);
      const project: Project = {
        id: newId("proj"),
        name: requiredText(input.name, "name", 80),
        description: optionalText(input.description, "description", 600),
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        repoPath: optionalText(input.repoPath, "repoPath", 1000) || null,
        prdPath: null,
        invariantsPath: null,
        modulesPath: null,
        createdAt: at,
        updatedAt: at,
      };
      state.projects.push(project);
      state.activeProjectId = project.id;
      this.recordEvent(state, {
        type: "project.created",
        at,
        projectId: project.id,
        payload: { name: project.name },
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(project);
    });
  }

  async updateProject(
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      if (input.repoPath !== undefined) {
        project.repoPath =
          optionalText(input.repoPath, "repoPath", 1000) || null;
      }
      if (input.prdPath !== undefined) {
        project.prdPath =
          optionalText(input.prdPath, "prdPath", 500) || null;
      }
      if (input.invariantsPath !== undefined) {
        project.invariantsPath =
          optionalText(input.invariantsPath, "invariantsPath", 500) || null;
      }
      if (input.modulesPath !== undefined) {
        project.modulesPath =
          optionalText(input.modulesPath, "modulesPath", 500) || null;
      }
      const at = nowIso(this.now);
      project.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "project.updated",
        at,
        projectId: project.id,
        payload: { repoPath: project.repoPath },
      });
      await this.save();
      return structuredClone(project);
    });
  }

  async selectProject(projectId: string): Promise<Project> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      state.activeProjectId = project.id;
      state.updatedAt = nowIso(this.now);
      await this.save();
      return structuredClone(project);
    });
  }

  async getDispatchContext(taskId: string): Promise<{
    task: Task;
    role: Role;
    project: Project;
    module: Module | null;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (
        task.kind === "fix" &&
        (task.diagnosis.trim() === "" || task.plan.trim() === "")
      ) {
        throw new StudioStoreError(
          "plan_required",
          "改修票必须有诊断和修改计划，才能派单",
          409,
        );
      }
      if (task.ownerRoleId === null) {
        throw new StudioStoreError(
          "owner_required",
          "任务没有负责人角色，不能派单",
          409,
        );
      }
      const role = state.roles.find((item) => item.id === task.ownerRoleId);
      const project = state.projects.find(
        (item) => item.id === task.projectId,
      );
      if (role === undefined || project === undefined) {
        throw new StudioStoreError(
          "context_not_found",
          "任务的负责人角色或项目不存在",
          404,
        );
      }
      const module =
        task.module === null
          ? undefined
          : state.modules.find(
              (item) =>
                item.projectId === task.projectId &&
                item.name === task.module,
            );
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        module: module === undefined ? null : structuredClone(module),
      };
    });
  }

  async getReviewContext(taskId: string): Promise<{
    task: Task;
    role: Role;
    project: Project;
    run: AgentRun | null;
    verification: Verification | null;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.reviewerRoleId === null) {
        throw new StudioStoreError(
          "reviewer_required",
          "任务没有验收人角色，不能独立评审",
          409,
        );
      }
      const role = state.roles.find(
        (item) => item.id === task.reviewerRoleId,
      );
      const project = state.projects.find(
        (item) => item.id === task.projectId,
      );
      if (role === undefined || project === undefined) {
        throw new StudioStoreError(
          "context_not_found",
          "验收人角色或项目不存在",
          404,
        );
      }
      const run = [...state.runs]
        .filter(
          (item) =>
            item.taskId === taskId && item.workspacePath !== null,
        )
        .sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        )[0];
      const verification = [...state.verifications]
        .filter((item) => item.taskId === taskId)
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        )[0];
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        run: run === undefined ? null : structuredClone(run),
        verification:
          verification === undefined
            ? null
            : structuredClone(verification),
      };
    });
  }

  async recordReview(
    taskId: string,
    input: {
      reviewerRoleId: string;
      model: string;
      verdict: "pass" | "fail";
      summary: string;
      findings: string[];
      tokens: number | null;
      runId?: string | null;
    },
  ): Promise<IndependentReview> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const at = nowIso(this.now);
      const review: IndependentReview = {
        id: newId("review"),
        projectId: task.projectId,
        taskId,
        runId: input.runId ?? null,
        reviewerRoleId: input.reviewerRoleId,
        model: input.model,
        verdict: input.verdict,
        summary: requiredText(input.summary, "summary", 2000),
        findings: textList(input.findings, "findings", 30),
        tokens: input.tokens,
        createdAt: at,
      };
      state.reviews.push(review);
      if (review.verdict === "pass") {
        const text = `独立评审通过（${input.model}）：${review.summary}`;
        if (!task.evidence.some((item) => item.text === text)) {
          task.evidence.push({ id: newId("ev"), text, createdAt: at });
        }
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type:
          review.verdict === "pass"
            ? "review.passed"
            : "review.failed",
        at,
        projectId: task.projectId,
        taskId,
        payload: { reviewId: review.id, model: review.model },
      });
      await this.save();
      return structuredClone(review);
    });
  }

  async getTaskVerificationContext(taskId: string): Promise<{
    task: Task;
    run: AgentRun | null;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const run = [...state.runs]
        .filter(
          (item) =>
            item.taskId === taskId && item.workspacePath !== null,
        )
        .sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        )[0];
      return {
        task: structuredClone(task),
        run: run === undefined ? null : structuredClone(run),
      };
    });
  }

  async beginRun(
    taskId: string,
    prompt: string,
    workspace?: { path: string; branch: string },
  ): Promise<AgentRun> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status !== "backlog" && task.status !== "ready") {
        throw new StudioStoreError(
          "task_not_dispatchable",
          "只有待规划或可开始的任务可以派单",
          409,
        );
      }
      if (task.ownerRoleId === null) {
        throw new StudioStoreError(
          "owner_required",
          "任务没有负责人角色，不能派单",
          409,
        );
      }
      const role = state.roles.find((item) => item.id === task.ownerRoleId);
      const project = state.projects.find(
        (item) => item.id === task.projectId,
      );
      if (role === undefined || project === undefined) {
        throw new StudioStoreError(
          "context_not_found",
          "任务的负责人角色或项目不存在",
          404,
        );
      }

      const projectSpent = state.runs
        .filter((run) => run.projectId === project.id)
        .reduce((sum, run) => sum + (run.tokens ?? 0), 0);
      if (
        project.tokenBudget !== null &&
        projectSpent >= project.tokenBudget
      ) {
        throw new StudioStoreError(
          "budget_exceeded",
          `项目 token 预算已用尽（${String(projectSpent)} / ${String(
            project.tokenBudget,
          )}）`,
          409,
        );
      }
      const roleSpent = state.runs
        .filter((run) => run.roleId === role.id)
        .reduce((sum, run) => sum + (run.tokens ?? 0), 0);
      if (role.tokenBudget !== null && roleSpent >= role.tokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `角色 token 预算已用尽（${String(roleSpent)} / ${String(
            role.tokenBudget,
          )}）`,
          409,
        );
      }
      const today = nowIso(this.now).slice(0, 10);
      const dailySpent = state.runs
        .filter(
          (run) =>
            run.roleId === role.id && run.startedAt.slice(0, 10) === today,
        )
        .reduce((sum, run) => sum + (run.tokens ?? 0), 0);
      if (
        role.dailyTokenBudget !== null &&
        dailySpent >= role.dailyTokenBudget
      ) {
        throw new StudioStoreError(
          "budget_exceeded",
          `角色今日 token 预算已用尽（${String(dailySpent)} / ${String(
            role.dailyTokenBudget,
          )}）`,
          409,
        );
      }

      const at = nowIso(this.now);
      if (workspace !== undefined) {
        task.branch = workspace.branch;
      }
      const branch = this.ensureBranch(state, task, at);
      const run: AgentRun = {
        id: newId("run"),
        projectId: task.projectId,
        taskId: task.id,
        roleId: role.id,
        branchId: branch.id,
        branchName: workspace?.branch ?? null,
        workspacePath: workspace?.path ?? null,
        diffStat: null,
        sessionId: null,
        status: "queued",
        model: role.model,
        prompt,
        output: "",
        receipt: null,
        tokens: null,
        budgetWarning: null,
        error: null,
        startedAt: at,
        endedAt: null,
      };
      state.runs.push(run);
      task.status = "running";
      task.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.dispatched",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: {
          runId: run.id,
          roleId: role.id,
          model: role.model,
        },
      });
      await this.save();
      return structuredClone(run);
    });
  }

  async attachRunSession(
    runId: string,
    sessionId: string,
    model?: string,
  ): Promise<void> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) return;
      run.sessionId = sessionId;
      if (model !== undefined) run.model = model;
      run.status = "running";
      await this.save();
    });
  }

  async completeRun(
    runId: string,
    input: {
      output: string;
      receipt: AgentReceipt | null;
      tokens: number | null;
      diffStat?: string | null;
    },
  ): Promise<AgentRun> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) {
        throw new StudioStoreError("run_not_found", "Agent Run 不存在", 404);
      }
      const at = nowIso(this.now);
      const task = state.tasks.find((item) => item.id === run.taskId);
      const project = state.projects.find(
        (item) => item.id === run.projectId,
      );
      const role = state.roles.find((item) => item.id === run.roleId);
      const receiptComplete =
        input.receipt !== null &&
        typeof input.receipt.summary === "string" &&
        input.receipt.summary.trim() !== "" &&
        Array.isArray(input.receipt.evidence) &&
        input.receipt.evidence.length > 0;
      if (!receiptComplete) {
        run.status = "failed";
        run.output = input.output.slice(0, 30000);
        run.receipt = input.receipt;
        run.tokens = input.tokens;
        run.error =
          "回执不完整：必须包含非空 summary 和至少一条 evidence，任务不能进入 review";
        run.endedAt = at;
        if (task !== undefined && task.status === "running") {
          task.status = "ready";
          task.updatedAt = at;
        }
        if (task !== undefined) {
          this.escalateRepeatedFailure(
            state,
            task,
            at,
            run.error,
            run,
          );
        }
        state.updatedAt = at;
        this.recordEvent(state, {
          type: "agent.failed",
          at,
          projectId: run.projectId,
          taskId: run.taskId,
          payload: {
            runId: run.id,
            error: run.error,
            tokens: run.tokens,
          },
        });
        await this.save();
        return structuredClone(run);
      }
      const spentProject = state.runs
        .filter(
          (item) =>
            item.projectId === run.projectId && item.id !== run.id,
        )
        .reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const spentRole = state.runs
        .filter(
          (item) => item.roleId === run.roleId && item.id !== run.id,
        )
        .reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const warnings: string[] = [];
      if (
        project !== undefined &&
        project.tokenBudget !== null &&
        input.tokens !== null &&
        spentProject + input.tokens > project.tokenBudget
      ) {
        warnings.push(
          `项目 token 预算超出：${String(spentProject + input.tokens)} / ${String(
            project.tokenBudget,
          )}`,
        );
      }
      if (
        role !== undefined &&
        role.tokenBudget !== null &&
        input.tokens !== null &&
        spentRole + input.tokens > role.tokenBudget
      ) {
        warnings.push(
          `角色 token 预算超出：${String(spentRole + input.tokens)} / ${String(
            role.tokenBudget,
          )}`,
        );
      }
      run.status = "succeeded";
      run.output = input.output.slice(0, 30000);
      run.receipt = input.receipt;
      run.tokens = input.tokens;
      run.diffStat = input.diffStat ?? null;
      run.budgetWarning = warnings.length === 0 ? null : warnings.join("；");
      run.endedAt = at;
      if (task !== undefined) {
        if (input.receipt !== null) {
          const existing = new Set(task.evidence.map((item) => item.text));
          for (const text of input.receipt.evidence.slice(0, 10)) {
            if (existing.has(text)) continue;
            task.evidence.push({
              id: newId("ev"),
              text,
              createdAt: at,
            });
          }
          if (task.status === "running") task.status = "review";
        }
        task.updatedAt = at;
      }
      if (input.receipt !== null) {
        let branch =
          run.branchId === null
            ? undefined
            : state.branches.find((item) => item.id === run.branchId);
        if (branch === undefined && task !== undefined) {
          branch = this.ensureBranch(state, task, at);
          run.branchId = branch.id;
        }
        if (branch !== undefined) {
          branch.status = "review";
          branch.updatedAt = at;
          for (const delta of input.receipt.contractDeltas) {
            const contract = delta.contract.trim();
            const change = delta.change.trim();
            if (contract === "" || change === "") continue;
            if (!branch.contractKeys.includes(contract)) {
              branch.contractKeys.push(contract);
            }
            const conflict = state.contractChanges.find(
              (item) =>
                item.projectId === run.projectId &&
                item.contract === contract &&
                item.branchId !== branch.id &&
                item.change !== change,
            );
            if (
              !state.contractChanges.some(
                (item) =>
                  item.branchId === branch.id &&
                  item.contract === contract &&
                  item.change === change,
              )
            ) {
              state.contractChanges.push({
                id: newId("contract"),
                projectId: run.projectId,
                branchId: branch.id,
                taskId: run.taskId,
                runId: run.id,
                contract,
                change,
                createdAt: at,
              });
              this.recordEvent(state, {
                type: "contract.changed",
                at,
                projectId: run.projectId,
                taskId: run.taskId,
                payload: {
                  branchId: branch.id,
                  contract,
                  change,
                  runId: run.id,
                },
              });
            }
            if (conflict === undefined) continue;
            const title = `契约冲突：${contract.slice(0, 160)}`;
            if (
              state.decisions.some(
                (item) => item.runId === run.id && item.title === title,
              )
            ) {
              continue;
            }
            const otherBranch = state.branches.find(
              (item) => item.id === conflict.branchId,
            );
            const decision: Decision = {
              id: newId("dec"),
              projectId: run.projectId,
              taskId: run.taskId,
              runId: run.id,
              title,
              context: `${branch.name}: ${change}\n${
                otherBranch?.name ?? conflict.branchId
              }: ${conflict.change}`,
              options: [
                {
                  label: `采用 ${branch.name} 的变更`,
                  tradeoff: change,
                },
                {
                  label: `采用 ${otherBranch?.name ?? "另一支线"} 的变更`,
                  tradeoff: conflict.change,
                },
              ],
              recommendation:
                "同一契约出现两条不同变更。请由 Owner/Architect 裁决；在裁决前不要合并任意一条支线。",
              reversible: true,
              adrDraft: null,
              adrPath: null,
              status: "pending",
              decision: "",
              note: "",
              decidedBy: "",
              tokenCost: input.tokens,
              createdAt: at,
              decidedAt: null,
            };
            state.decisions.push(decision);
            this.recordEvent(state, {
              type: "decision.escalated",
              at,
              projectId: run.projectId,
              taskId: run.taskId,
              payload: {
                decisionId: decision.id,
                contract,
                branchId: branch.id,
                otherBranchId: conflict.branchId,
                runId: run.id,
              },
            });
          }
        }
      }
      if (input.receipt !== null) {
        for (const proposed of input.receipt.decisions) {
          if (proposed.scope !== "project") continue;
          if (
            state.decisions.some(
              (item) =>
                item.runId === run.id && item.title === proposed.title,
            )
          ) {
            continue;
          }
          const decision: Decision = {
            id: newId("dec"),
            projectId: run.projectId,
            taskId: run.taskId,
            runId: run.id,
            title: proposed.title,
            context: proposed.rationale,
            options: [],
            recommendation: proposed.rationale,
            reversible: true,
            adrDraft: null,
            adrPath: null,
            status: "pending",
            decision: "",
            note: "",
            decidedBy: "",
            tokenCost: input.tokens,
            createdAt: at,
            decidedAt: null,
          };
          state.decisions.push(decision);
          this.recordEvent(state, {
            type: "decision.proposed",
            at,
            projectId: run.projectId,
            taskId: run.taskId,
            payload: {
              decisionId: decision.id,
              runId: run.id,
              title: decision.title,
            },
          });
        }
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.completed",
        at,
        projectId: run.projectId,
        taskId: run.taskId,
        payload: {
          runId: run.id,
          tokens: run.tokens,
          receipt: input.receipt !== null,
          budgetWarning: run.budgetWarning,
        },
      });
      await this.save();
      return structuredClone(run);
    });
  }

  async failRun(runId: string, error: string): Promise<AgentRun> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) {
        throw new StudioStoreError("run_not_found", "Agent Run 不存在", 404);
      }
      const at = nowIso(this.now);
      run.status = "failed";
      run.error = error.slice(0, 4000);
      run.endedAt = at;
      const task = state.tasks.find((item) => item.id === run.taskId);
      if (task !== undefined && task.status === "running") {
        task.status = "ready";
        task.updatedAt = at;
      }
      if (task !== undefined) {
        this.escalateRepeatedFailure(state, task, at, run.error, run);
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.failed",
        at,
        projectId: run.projectId,
        taskId: run.taskId,
        payload: { runId: run.id, error: run.error },
      });
      await this.save();
      return structuredClone(run);
    });
  }

  /**
   * Enforces the module contract boundary after a code run. Changing the
   * contract file or a forbidden path blocks the task and escalates a decision;
   * it never silently rewrites the Agent's worktree.
   */
  async enforceContractScope(
    taskId: string,
    runId: string,
    changedFiles: string[],
  ): Promise<string[]> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const module =
        task.module === null
          ? undefined
          : state.modules.find(
              (item) =>
                item.projectId === task.projectId &&
                item.name === task.module,
            );
      if (module === undefined) return [];
      const normalize = (value: string): string =>
        value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
      const contract = normalize(module.contractPath ?? "");
      const forbidden = module.forbiddenPaths.map(normalize).filter(Boolean);
      const allowed = module.allowedPaths.map(normalize).filter(Boolean);
      const violations = changedFiles
        .map(normalize)
        .filter((file) => {
          if (file === "") return false;
          if (contract !== "" && file === contract) return true;
          if (
            forbidden.some(
              (path) => file === path || file.startsWith(`${path}/`),
            )
          ) {
            return true;
          }
          if (
            allowed.length > 0 &&
            (file.startsWith("src/") || file.startsWith("test/")) &&
            !allowed.some(
              (path) => file === path || file.startsWith(`${path}/`),
            )
          ) {
            return true;
          }
          return false;
        });
      if (violations.length === 0) return [];
      const at = nowIso(this.now);
      task.status = "blocked";
      task.updatedAt = at;
      const title = `契约越界：${task.title.slice(0, 160)}`;
      if (
        !state.decisions.some(
          (item) => item.taskId === task.id && item.title === title,
        )
      ) {
        const run = state.runs.find((item) => item.id === runId);
        state.decisions.push({
          id: newId("dec"),
          projectId: task.projectId,
          taskId: task.id,
          runId,
          title,
          context: `模块「${module.name}」的契约/禁止路径被修改：${violations.join("、")}`,
          options: [
            {
              label: "退回 Architect 修订契约",
              tradeoff: "先确认契约边界是否变化，再重开 ticket",
            },
            {
              label: "撤销越界改动",
              tradeoff: "保留现有契约，要求 Agent 只改允许路径",
            },
          ],
          recommendation:
            "实现者不能直接改契约或禁止路径；需要契约变更时，应由 Architect/Owner 先更新契约，再重新派单。",
          reversible: true,
          adrDraft: null,
          adrPath: null,
          status: "pending",
          decision: "",
          note: "",
          decidedBy: "",
          tokenCost: run?.tokens ?? null,
          createdAt: at,
          decidedAt: null,
        });
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "contract.violated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { runId, module: module.name, violations },
      });
      await this.save();
      return violations;
    });
  }

  async recordVerification(
    taskId: string,
    input: {
      command: string;
      workdir: string;
      exitCode: number;
      output: string;
      passed: boolean;
      runId?: string | null;
    },
  ): Promise<Verification> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const at = nowIso(this.now);
      const run = input.runId
        ? state.runs.find((item) => item.id === input.runId)
        : [...state.runs]
            .filter(
              (item) =>
                item.taskId === taskId && item.workspacePath !== null,
            )
            .sort((left, right) =>
              right.startedAt.localeCompare(left.startedAt),
            )[0];
      const verification: Verification = {
        id: newId("verify"),
        projectId: task.projectId,
        taskId,
        runId: run?.id ?? null,
        command: requiredText(input.command, "command", 500),
        workdir: requiredText(input.workdir, "workdir", 1000),
        exitCode: input.exitCode,
        output: input.output.slice(0, 20000),
        passed: input.passed,
        createdAt: at,
      };
      state.verifications.push(verification);
      if (input.passed) {
        const text = `验证通过：\`${verification.command}\`（exit 0）`;
        if (!task.evidence.some((item) => item.text === text)) {
          task.evidence.push({
            id: newId("ev"),
            text,
            createdAt: at,
          });
        }
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: input.passed ? "verification.passed" : "verification.failed",
        at,
        projectId: task.projectId,
        taskId,
        payload: {
          verificationId: verification.id,
          command: verification.command,
          exitCode: verification.exitCode,
          runId: verification.runId,
        },
      });
      await this.save();
      return structuredClone(verification);
    });
  }

  async getDecisionAdrContext(decisionId: string): Promise<{
    decision: Decision;
    project: Project;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId,
      );
      if (decision === undefined) {
        throw new StudioStoreError(
          "decision_not_found",
          "决策不存在",
          404,
        );
      }
      const project = state.projects.find(
        (item) => item.id === decision.projectId,
      );
      if (project === undefined) {
        throw new StudioStoreError(
          "project_not_found",
          "决策对应的项目不存在",
          404,
        );
      }
      return {
        decision: structuredClone(decision),
        project: structuredClone(project),
      };
    });
  }

  async setDecisionAdrPath(
    decisionId: string,
    adrPath: string,
  ): Promise<Decision> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId,
      );
      if (decision === undefined) {
        throw new StudioStoreError(
          "decision_not_found",
          "决策不存在",
          404,
        );
      }
      const at = nowIso(this.now);
      decision.adrPath = adrPath;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "decision.adr_written",
        at,
        projectId: decision.projectId,
        taskId: decision.taskId,
        payload: { decisionId, adrPath },
      });
      await this.save();
      return structuredClone(decision);
    });
  }

  async createPostMergeDecision(input: {
    taskId: string;
    proposalId: string;
    mergeCommit: string;
    command: string;
    exitCode: number;
    output: string;
  }): Promise<Decision | null> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, input.taskId);
      const title = `合并后回归失败：${task.title.slice(0, 140)}`;
      if (
        state.decisions.some(
          (item) => item.taskId === task.id && item.title === title,
        )
      ) {
        return null;
      }
      const at = nowIso(this.now);
      const decision: Decision = {
        id: newId("dec"),
        projectId: task.projectId,
        taskId: task.id,
        runId: null,
        title,
        context: [
          `合并 ${input.mergeCommit} 后执行回归：${input.command}（exit ${String(input.exitCode)}）`,
          "",
          input.output.slice(0, 6000),
        ].join("\n"),
        options: [
          {
            label: "回滚这次合并",
            tradeoff: `git revert ${input.mergeCommit} 或 git reset --hard ${input.mergeCommit}^`,
          },
          {
            label: "保留合并，修复回归",
            tradeoff: "在主分支上追加修复提交，并重新跑回归",
          },
        ],
        recommendation:
          "合并后回归失败。先看输出定位破坏点；无法快速修复时回滚 merge commit，再重新走提案。",
        reversible: true,
        adrDraft: null,
        adrPath: null,
        status: "pending",
        decision: "",
        note: "",
        decidedBy: "",
        tokenCost: null,
        createdAt: at,
        decidedAt: null,
      };
      state.decisions.push(decision);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "decision.escalated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: {
          decisionId: decision.id,
          proposalId: input.proposalId,
          mergeCommit: input.mergeCommit,
          kind: "post_merge_regression",
        },
      });
      await this.save();
      return structuredClone(decision);
    });
  }

  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      let taskId: string | null = null;
      if (input.taskId !== undefined && input.taskId !== null) {
        const task = this.findTask(state, input.taskId);
        if (task.projectId !== project.id) {
          throw new StudioStoreError(
            "task_not_found",
            "任务不属于当前项目",
            404,
          );
        }
        taskId = task.id;
      }
      const at = nowIso(this.now);
      const decision: Decision = {
        id: newId("dec"),
        projectId: project.id,
        taskId,
        runId: null,
        title: requiredText(input.title, "title", 200),
        context: optionalText(input.context, "context", 4000),
        options: [],
        recommendation: optionalText(
          input.recommendation,
          "recommendation",
          2000,
        ),
        reversible: input.reversible !== false,
        adrDraft: null,
        adrPath: null,
        status: "pending",
        decision: "",
        note: "",
        decidedBy: "",
        tokenCost: null,
        createdAt: at,
        decidedAt: null,
      };
      state.decisions.push(decision);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "decision.created",
        at,
        projectId: project.id,
        taskId,
        payload: { decisionId: decision.id, title: decision.title },
      });
      await this.save();
      return structuredClone(decision);
    });
  }

  async decideDecision(
    decisionId: string,
    input: DecideDecisionInput,
  ): Promise<Decision> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId,
      );
      if (decision === undefined) {
        throw new StudioStoreError(
          "decision_not_found",
          "决策不存在",
          404,
        );
      }
      if (decision.status !== "pending") {
        throw new StudioStoreError(
          "decision_decided",
          "这条决策已经有结论",
          409,
        );
      }
      if (input.status !== "approved" && input.status !== "rejected") {
        throw new StudioStoreError(
          "invalid_input",
          "决策状态只能是 approved 或 rejected",
        );
      }
      if (
        decision.reversible === false &&
        input.status === "approved" &&
        optionalText(input.decision, "decision", 4000) === ""
      ) {
        throw new StudioStoreError(
          "decision_reason_required",
          "不可逆决策批准时必须写明结论和理由",
          409,
        );
      }
      const at = nowIso(this.now);
      decision.status = input.status;
      decision.decision = optionalText(input.decision, "decision", 4000);
      decision.note = optionalText(input.note, "note", 2000);
      decision.decidedBy = "Owner";
      decision.decidedAt = at;
      if (input.status === "approved" && decision.reversible === false) {
        decision.adrDraft = [
          `# ADR: ${decision.title}`,
          "",
          `- 日期：${at.slice(0, 10)}`,
          "- 状态：Accepted",
          "- 不可逆：是",
          "",
          "## 背景",
          decision.context || "（未填写）",
          "",
          "## 决策",
          decision.decision || "（未填写）",
          "",
          "## 理由",
          decision.note || "（未填写）",
          "",
          "## 建议",
          decision.recommendation || "（无）",
          "",
        ].join("\n");
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type:
          input.status === "approved"
            ? "decision.approved"
            : "decision.rejected",
        at,
        projectId: decision.projectId,
        taskId: decision.taskId,
        payload: {
          decisionId: decision.id,
          decision: decision.decision,
          note: decision.note,
        },
      });
      await this.save();
      return structuredClone(decision);
    });
  }

  async createModule(input: CreateModuleInput): Promise<Module> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const name = requiredText(input.name, "name", 120);
      if (
        state.modules.some(
          (module) =>
            module.projectId === project.id && module.name === name,
        )
      ) {
        throw new StudioStoreError(
          "module_exists",
          "同一项目下模块名不能重复",
          409,
        );
      }
      const at = nowIso(this.now);
      const module: Module = {
        id: newId("module"),
        projectId: project.id,
        name,
        responsibility: optionalText(
          input.responsibility,
          "responsibility",
          2000,
        ),
        contractPath:
          optionalText(input.contractPath, "contractPath", 500) || null,
        contractText: optionalText(
          input.contractText,
          "contractText",
          8000,
        ),
        allowedPaths: textList(input.allowedPaths, "allowedPaths", 30),
        forbiddenPaths: textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30,
        ),
        dependsOn: textList(input.dependsOn, "dependsOn", 20),
        createdAt: at,
        updatedAt: at,
      };
      state.modules.push(module);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "module.created",
        at,
        projectId: project.id,
        payload: { moduleId: module.id, name: module.name },
      });
      await this.save();
      return structuredClone(module);
    });
  }

  async updateModule(
    moduleId: string,
    input: UpdateModuleInput,
  ): Promise<Module> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const module = state.modules.find((item) => item.id === moduleId);
      if (module === undefined) {
        throw new StudioStoreError("module_not_found", "模块不存在", 404);
      }
      if (input.responsibility !== undefined) {
        module.responsibility = optionalText(
          input.responsibility,
          "responsibility",
          2000,
        );
      }
      if (input.contractPath !== undefined) {
        module.contractPath =
          optionalText(input.contractPath, "contractPath", 500) || null;
      }
      if (input.contractText !== undefined) {
        module.contractText = optionalText(
          input.contractText,
          "contractText",
          8000,
        );
      }
      if (input.allowedPaths !== undefined) {
        module.allowedPaths = textList(
          input.allowedPaths,
          "allowedPaths",
          30,
        );
      }
      if (input.forbiddenPaths !== undefined) {
        module.forbiddenPaths = textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30,
        );
      }
      if (input.dependsOn !== undefined) {
        module.dependsOn = textList(input.dependsOn, "dependsOn", 20);
      }
      const at = nowIso(this.now);
      module.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "module.updated",
        at,
        projectId: module.projectId,
        payload: { moduleId: module.id },
      });
      await this.save();
      return structuredClone(module);
    });
  }

  async createRole(input: CreateRoleInput): Promise<Role> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const at = nowIso(this.now);
      const role: Role = {
        id: newId("role"),
        projectId: project.id,
        name: requiredText(input.name, "name", 60),
        title: optionalText(input.title, "title", 80),
        mission: optionalText(input.mission, "mission", 600),
        responsibilities: textList(input.responsibilities, "responsibilities"),
        nonGoals: textList(input.nonGoals, "nonGoals"),
        decisionRights: textList(input.decisionRights, "decisionRights"),
        model: optionalText(input.model, "model", 120) || null,
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        dailyTokenBudget: optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget",
        ),
        createdAt: at,
        updatedAt: at,
      };
      state.roles.push(role);
      this.recordEvent(state, {
        type: "role.created",
        at,
        projectId: project.id,
        payload: { roleId: role.id, name: role.name },
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(role);
    });
  }

  async updateRole(
    roleId: string,
    input: Partial<CreateRoleInput>,
  ): Promise<Role> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const role = state.roles.find((item) => item.id === roleId);
      if (role === undefined) {
        throw new StudioStoreError("role_not_found", "角色不存在", 404);
      }
      if (input.name !== undefined) {
        role.name = requiredText(input.name, "name", 60);
      }
      if (input.title !== undefined) {
        role.title = optionalText(input.title, "title", 80);
      }
      if (input.mission !== undefined) {
        role.mission = optionalText(input.mission, "mission", 600);
      }
      if (input.responsibilities !== undefined) {
        role.responsibilities = textList(
          input.responsibilities,
          "responsibilities",
        );
      }
      if (input.nonGoals !== undefined) {
        role.nonGoals = textList(input.nonGoals, "nonGoals");
      }
      if (input.decisionRights !== undefined) {
        role.decisionRights = textList(input.decisionRights, "decisionRights");
      }
      if (input.model !== undefined) {
        role.model = optionalText(input.model, "model", 120) || null;
      }
      if (input.tokenBudget !== undefined) {
        role.tokenBudget = optionalTokenBudget(input.tokenBudget, "tokenBudget");
      }
      if (input.dailyTokenBudget !== undefined) {
        role.dailyTokenBudget = optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget",
        );
      }
      role.updatedAt = nowIso(this.now);
      state.updatedAt = role.updatedAt;
      this.recordEvent(state, {
        type: "role.updated",
        at: role.updatedAt,
        projectId: role.projectId,
        payload: { roleId: role.id },
      });
      await this.save();
      return structuredClone(role);
    });
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const at = nowIso(this.now);
      const ownerRoleId = this.resolveRoleId(
        state,
        project.id,
        input.ownerRoleId,
        "ownerRoleId",
      );
      const reviewerRoleId = this.resolveRoleId(
        state,
        project.id,
        input.reviewerRoleId,
        "reviewerRoleId",
      );
      const task: Task = {
        id: newId("task"),
        projectId: project.id,
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
        kind: input.kind === "fix" ? "fix" : "new",
        diagnosis: optionalText(input.diagnosis, "diagnosis", 4000),
        plan: optionalText(input.plan, "plan", 4000),
        integration: input.integration === true,
        originTaskId:
          optionalText(input.originTaskId, "originTaskId", 120) || null,
        docsSynced: false,
        createdAt: at,
        updatedAt: at,
      };
      state.tasks.push(task);
      this.recordEvent(state, {
        type: "task.created",
        at,
        projectId: project.id,
        taskId: task.id,
        payload: { title: task.title, priority: task.priority },
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(task);
    });
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status === "done") {
        throw new StudioStoreError(
          "task_locked",
          "已完成的任务不能直接修改，请创建一个后续任务",
        );
      }
      const at = nowIso(this.now);
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
        task.ownerRoleId = this.resolveRoleId(
          state,
          task.projectId,
          input.ownerRoleId,
          "ownerRoleId",
        );
      }
      if (input.reviewerRoleId !== undefined) {
        task.reviewerRoleId = this.resolveRoleId(
          state,
          task.projectId,
          input.reviewerRoleId,
          "reviewerRoleId",
        );
      }
      if (input.acceptance !== undefined) {
        task.acceptance = normalizeAcceptance(input.acceptance, task.acceptance);
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
      this.recordEvent(state, {
        type: "task.updated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { fields: Object.keys(input) },
      });
      await this.save();
      return structuredClone(task);
    });
  }

  async transitionTask(taskId: string, next: TaskStatus): Promise<Task> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
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
        const hasCodeRun = state.runs.some(
          (item) =>
            item.taskId === task.id && item.workspacePath !== null,
        );
        if (
          project?.repoPath !== null &&
          project?.repoPath !== undefined &&
          hasCodeRun &&
          !state.reviews.some(
            (review) =>
              review.taskId === task.id && review.verdict === "pass",
          )
        ) {
          throw new StudioStoreError(
            "review_required",
            "代码任务完成前必须有一次通过的独立评审",
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
      const at = nowIso(this.now);
      task.status = next;
      task.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "task.transitioned",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { from, to: next },
      });
      if (next === "done") {
        this.scheduleIntegrationGate(state, task.projectId, at);
      }
      await this.save();
      return structuredClone(task);
    });
  }

  private scheduleIntegrationGate(
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
      kind: "new",
      diagnosis: "",
      plan: "",
      integration: true,
      originTaskId: null,
      docsSynced: false,
      createdAt: at,
      updatedAt: at,
    };
    state.tasks.push(task);
    this.recordEvent(state, {
      type: "integration.scheduled",
      at,
      projectId,
      taskId: task.id,
      payload: { index, doneTasks: done },
    });
  }

  async listTransitions(taskId: string): Promise<TaskStatus[]> {
    return this.runExclusive(async () => {
      const task = this.findTask(this.requireState(), taskId);
      return [...ALLOWED_TRANSITIONS[task.status]];
    });
  }

  async createMergeProposal(
    taskId: string,
    input: CreateMergeProposalInput,
  ): Promise<MergeProposal> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status !== "done") {
        throw new StudioStoreError(
          "task_not_accepted",
          "任务验收通过后才能提交合并提案",
          409,
        );
      }
      if (task.acceptance.length === 0 || task.acceptance.some((item) => !item.done)) {
        throw new StudioStoreError(
          "acceptance_incomplete",
          "所有验收标准完成前不能提交合并提案",
          409,
        );
      }
      if (task.evidence.length === 0) {
        throw new StudioStoreError(
          "evidence_required",
          "提交合并提案前至少记录一条证据",
          409,
        );
      }
      const project = state.projects.find(
        (item) => item.id === task.projectId,
      );
      if (project?.repoPath !== null && project?.repoPath !== undefined) {
        const passed = state.verifications.some(
          (item) => item.taskId === task.id && item.passed,
        );
        if (!passed) {
          throw new StudioStoreError(
            "verification_required",
            "代码项目提交合并提案前必须有一条通过的独立验证",
            409,
          );
        }
      }
      const active = state.mergeProposals.find(
        (proposal) =>
          proposal.taskId === task.id &&
          (proposal.status === "review" ||
            proposal.status === "approved" ||
            proposal.status === "merged"),
      );
      if (active !== undefined) {
        throw new StudioStoreError(
          "merge_exists",
          `该任务已有合并提案（${MERGE_STATUS_LABELS[active.status]}）`,
          409,
        );
      }
      const branch = requiredText(
        input.branch ?? task.branch ?? "",
        "branch",
        160,
      );
      const risk = input.risk ?? "medium";
      if (!isMergeRisk(risk)) {
        throw new StudioStoreError("invalid_input", "risk 必须是 low/medium/high");
      }
      const at = nowIso(this.now);
      const latestRun = [...state.runs]
        .filter((run) => run.taskId === task.id)
        .sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        )[0];
      const latestVerification = [...state.verifications]
        .filter((verification) => verification.taskId === task.id)
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        )[0];
      const changedFiles =
        latestRun?.diffStat === null || latestRun?.diffStat === undefined
          ? []
          : latestRun.diffStat
              .split("\n")
              .filter((line) => /^[ MARC?]{1,2} \S/.test(line))
              .map((line) => line.slice(3).trim())
              .filter(Boolean);
      const proposal: MergeProposal = {
        id: newId("merge"),
        projectId: task.projectId,
        taskId: task.id,
        branch,
        base: optionalText(input.base ?? "main", "base", 160) || "main",
        summary: requiredText(input.summary, "summary", 1000),
        risk,
        rollback: requiredText(input.rollback, "rollback", 1000),
        status: "review",
        reviewNote: "",
        mergeCommit: null,
        diffStat: latestRun?.diffStat ?? null,
        changedFiles,
        verificationId: latestVerification?.id ?? null,
        postMergeVerificationId: null,
        rollbackCommit: null,
        rolledBackAt: null,
        createdAt: at,
        updatedAt: at,
        decidedAt: null,
        mergedAt: null,
      };
      if (task.branch !== branch) {
        task.branch = branch;
        task.updatedAt = at;
      }
      state.mergeProposals.push(proposal);
      this.recordEvent(state, {
        type: "merge.proposed",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: {
          proposalId: proposal.id,
          branch: proposal.branch,
          base: proposal.base,
          risk: proposal.risk,
        },
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(proposal);
    });
  }

  async approveMergeProposal(
    proposalId: string,
    note?: string,
  ): Promise<MergeProposal> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "review") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `只有待评审的合并提案可以批准；当前是「${MERGE_STATUS_LABELS[proposal.status]}」`,
          409,
        );
      }
      const at = nowIso(this.now);
      proposal.status = "approved";
      proposal.reviewNote = optionalText(note, "note", 1000);
      proposal.decidedAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.approved",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: { proposalId: proposal.id, note: proposal.reviewNote },
      });
      await this.save();
      return structuredClone(proposal);
    });
  }

  async rejectMergeProposal(
    proposalId: string,
    note: string,
  ): Promise<MergeProposal> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "review") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `只有待评审的合并提案可以打回；当前是「${MERGE_STATUS_LABELS[proposal.status]}」`,
          409,
        );
      }
      const at = nowIso(this.now);
      proposal.status = "rejected";
      proposal.reviewNote = requiredText(note, "note", 1000);
      proposal.decidedAt = at;
      proposal.updatedAt = at;
      const task = state.tasks.find((item) => item.id === proposal.taskId);
      if (
        task !== undefined &&
        (task.status === "review" || task.status === "done")
      ) {
        task.status = "running";
        task.updatedAt = at;
        this.recordEvent(state, {
          type: "task.reopened",
          at,
          projectId: task.projectId,
          taskId: task.id,
          payload: { reason: "merge_rejected", proposalId: proposal.id },
        });
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.rejected",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: { proposalId: proposal.id, note: proposal.reviewNote },
      });
      await this.save();
      return structuredClone(proposal);
    });
  }

  async getMergeContext(proposalId: string): Promise<{
    proposal: MergeProposal;
    project: Project;
    task: Task;
    verification: Verification | null;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      const project = state.projects.find(
        (item) => item.id === proposal.projectId,
      );
      const task = state.tasks.find(
        (item) => item.id === proposal.taskId,
      );
      if (project === undefined || task === undefined) {
        throw new StudioStoreError(
          "project_not_found",
          "合并提案对应的项目不存在",
          404,
        );
      }
      const verification =
        proposal.postMergeVerificationId === null
          ? undefined
          : state.verifications.find(
              (item) => item.id === proposal.postMergeVerificationId,
            );
      return {
        proposal: structuredClone(proposal),
        project: structuredClone(project),
        task: structuredClone(task),
        verification:
          verification === undefined
            ? null
            : structuredClone(verification),
      };
    });
  }

  async completeMergeProposal(
    proposalId: string,
    mergeCommit?: string,
  ): Promise<MergeProposal> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "approved") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `只有已批准的合并提案可以标记合并；当前是「${MERGE_STATUS_LABELS[proposal.status]}」`,
          409,
        );
      }
      const at = nowIso(this.now);
      proposal.status = "merged";
      proposal.mergeCommit =
        optionalText(mergeCommit, "mergeCommit", 160) || null;
      proposal.mergedAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.merged",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: {
          proposalId: proposal.id,
          mergeCommit: proposal.mergeCommit,
        },
      });
      await this.save();
      return structuredClone(proposal);
    });
  }

  async setMergePostVerification(
    proposalId: string,
    verificationId: string,
  ): Promise<MergeProposal> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      proposal.postMergeVerificationId = verificationId;
      proposal.updatedAt = nowIso(this.now);
      state.updatedAt = proposal.updatedAt;
      await this.save();
      return structuredClone(proposal);
    });
  }

  async recordRollback(
    proposalId: string,
    rollbackCommit: string,
  ): Promise<MergeProposal> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "merged") {
        throw new StudioStoreError(
          "rollback_not_merged",
          "只有已合并的提案可以回滚",
          409,
        );
      }
      const at = nowIso(this.now);
      proposal.rollbackCommit = requiredText(
        rollbackCommit,
        "rollbackCommit",
        160,
      );
      proposal.rolledBackAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.rolled_back",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: {
          proposalId,
          mergeCommit: proposal.mergeCommit,
          rollbackCommit: proposal.rollbackCommit,
        },
      });
      await this.save();
      return structuredClone(proposal);
    });
  }

  private async load(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    if (!existsSync(this.file)) {
      this.state = this.seedState();
      await this.save();
      return;
    }
    const raw = await readFile(this.file, "utf8");
    try {
      const parsed: unknown = JSON.parse(raw);
      const migrated = migrateState(parsed);
      assertState(migrated);
      this.state = migrated;
      if (
        !isRecord(parsed) ||
        parsed.schemaVersion !== STUDIO_SCHEMA_VERSION
      ) {
        await this.save();
      }
    } catch (error) {
      const backup = `${this.file}.corrupt-${String(Date.now())}`;
      await rename(this.file, backup).catch(() => undefined);
      this.state = this.seedState();
      this.warning = `studio.json 无法读取，已备份到 ${backup} 并重建演示数据：${
        error instanceof Error ? error.message : String(error)
      }`;
      await this.save();
    }
  }

  private async save(): Promise<void> {
    const state = this.requireState();
    state.updatedAt = nowIso(this.now);
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    const temp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temp, serialized, "utf8");
    try {
      await rename(temp, this.file);
    } catch {
      // Windows can refuse to replace a file that another process briefly holds.
      await rm(this.file, { force: true });
      await rename(temp, this.file);
    }
  }

  private requireState(): StudioState {
    if (this.state === null) {
      throw new StudioStoreError(
        "store_not_ready",
        "Studio 数据尚未初始化",
        500,
      );
    }
    return this.state;
  }

  private pickProject(
    state: StudioState,
    projectId: string | undefined,
  ): Project | null {
    if (projectId !== undefined) {
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      return project;
    }
    if (state.activeProjectId !== null) {
      const active = state.projects.find(
        (item) => item.id === state.activeProjectId,
      );
      if (active !== undefined) return active;
    }
    return state.projects[0] ?? null;
  }

  private escalateRepeatedFailure(
    state: StudioState,
    task: Task,
    at: string,
    reason: string,
    run: AgentRun,
  ): void {
    const failures = state.runs.filter(
      (item) => item.taskId === task.id && item.status === "failed",
    ).length;
    if (failures < 2 || task.status === "done") return;
    task.status = "blocked";
    task.updatedAt = at;
    const hasResplit = state.tasks.some(
      (item) => item.originTaskId === task.id,
    );
    if (!hasResplit) {
      const architect =
        state.roles.find(
          (role) =>
            role.projectId === task.projectId &&
            (role.id === "role-architect" ||
              role.title.includes("架构")),
        ) ??
        state.roles.find((role) => role.id === task.ownerRoleId);
      if (architect !== undefined) {
        const resplit: Task = {
          id: newId("task"),
          projectId: task.projectId,
          title: `重拆：${task.title}`.slice(0, 160),
          goal: `原任务连续失败 ${String(failures)} 次。先诊断根因，重拆任务/契约，产出可执行的新 ticket 与验收标准；不要直接写业务代码。最后一次失败：${reason}`,
          status: "backlog",
          priority: task.priority,
          ownerRoleId: architect.id,
          reviewerRoleId: task.reviewerRoleId,
          acceptance: [
            {
              id: newId("acc"),
              text: "给出重拆后的任务/契约",
              done: false,
            },
            {
              id: newId("acc"),
              text: "标明可执行 ticket 与验收标准",
              done: false,
            },
          ],
          evidence: [],
          branch: null,
          verifyCommand: task.verifyCommand,
          module: task.module,
          contractRef: task.contractRef,
          kind: "fix",
          diagnosis: "",
          plan: "",
          integration: false,
          originTaskId: task.id,
          docsSynced: false,
          createdAt: at,
          updatedAt: at,
        };
        state.tasks.push(resplit);
        this.recordEvent(state, {
          type: "task.resplit",
          at,
          projectId: task.projectId,
          taskId: resplit.id,
          payload: {
            originTaskId: task.id,
            ownerRoleId: architect.id,
          },
        });
      }
    }
    const title = `连续失败：${task.title.slice(0, 160)}`;
    if (
      state.decisions.some(
        (item) => item.taskId === task.id && item.title === title,
      )
    ) {
      return;
    }
    const decision: Decision = {
      id: newId("dec"),
      projectId: task.projectId,
      taskId: task.id,
      runId: run.id,
      title,
      context: `${String(failures)} 次失败；最后一次：${reason}`,
      options: [
        {
          label: "退回 Architect 重拆任务/契约",
          tradeoff: "停止原地重试，先修任务定义或契约",
        },
        {
          label: "继续重试",
          tradeoff: "保留当前任务，但需要新的证据",
        },
      ],
      recommendation:
        "同一任务连续失败 2 次，按工作流应退回架构师重拆，不允许第三次原地重试。",
      reversible: true,
      adrDraft: null,
      adrPath: null,
      status: "pending",
      decision: "",
      note: "",
      decidedBy: "",
      tokenCost: run.tokens,
      createdAt: at,
      decidedAt: null,
    };
    state.decisions.push(decision);
    this.recordEvent(state, {
      type: "decision.escalated",
      at,
      projectId: task.projectId,
      taskId: task.id,
      payload: {
        decisionId: decision.id,
        failures,
        runId: run.id,
      },
    });
  }

  private ensureBranch(
    state: StudioState,
    task: Task,
    at: string,
  ): Branch {
    const name = task.branch ?? `task/${task.id}`;
    if (task.branch === null) task.branch = name;
    let branch = state.branches.find(
      (item) =>
        item.projectId === task.projectId && item.name === name,
    );
    if (branch === undefined) {
      branch = {
        id: `branch-${task.id}`,
        projectId: task.projectId,
        taskId: task.id,
        name,
        goal: task.goal,
        roleId: task.ownerRoleId,
        contractKeys: [],
        status: "open",
        createdAt: at,
        updatedAt: at,
      };
      state.branches.push(branch);
    } else {
      branch.taskId = task.id;
      branch.goal = task.goal;
      branch.roleId = task.ownerRoleId;
      if (branch.status === "abandoned" || branch.status === "merged") {
        branch.status = "open";
      }
      branch.updatedAt = at;
    }
    return branch;
  }

  private findTask(state: StudioState, taskId: string): Task {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task === undefined) {
      throw new StudioStoreError("task_not_found", "任务不存在", 404);
    }
    return task;
  }

  private findMergeProposal(
    state: StudioState,
    proposalId: string,
  ): MergeProposal {
    const proposal = state.mergeProposals.find((item) => item.id === proposalId);
    if (proposal === undefined) {
      throw new StudioStoreError("merge_not_found", "合并提案不存在", 404);
    }
    return proposal;
  }

  private resolveRoleId(
    state: StudioState,
    projectId: string,
    value: string | null | undefined,
    field: string,
  ): string | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") {
      throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
    }
    const role = state.roles.find(
      (item) => item.id === value && item.projectId === projectId,
    );
    if (role === undefined) {
      throw new StudioStoreError(
        "role_not_found",
        `${field} 指向的角色不存在`,
        404,
      );
    }
    return role.id;
  }

  private recordEvent(
    state: StudioState,
    input: {
      type: string;
      at: string;
      projectId: string | null;
      taskId?: string | null;
      payload?: Record<string, unknown>;
    },
  ): void {
    const event: StudioEvent = {
      id: newId("evt"),
      type: input.type,
      at: input.at,
      actor: "human",
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      payload: input.payload ?? {},
    };
    state.events.push(event);
    if (state.events.length > 2000) {
      state.events.splice(0, state.events.length - 2000);
    }
  }

  private runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private seedState(): StudioState {
    const at = nowIso(this.now);
    const project: Project = {
      id: "proj-demo",
      name: "MOBA 垂直切片",
      description:
        "用一条可玩的最小链路验证工作台：任务、角色、验收和状态机。",
      tokenBudget: null,
      repoPath: null,
      prdPath: null,
      invariantsPath: null,
      modulesPath: null,
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
      model: null,
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
        "Gameplay 工程师",
        "交付可运行的玩法实现和测试。",
        ["实现技能/移动/冷却", "补单测", "维护构建"],
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
        "锁定垂直切片范围",
        "写清楚这一版做什么、不做什么，以及可玩验收。",
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
        "搭建 30Hz 固定 tick 骨架",
        "服务端固定 tick，客户端能稳定消费快照。",
        "review",
        "P0",
        "role-architect",
        "role-verifier",
        acceptance("tick 稳定在 30Hz", "快照可重放", "断线重连不崩溃").map(
          (item, index) => ({ ...item, done: index < 2 }),
        ),
        "task/002-fixed-tick",
      ),
      task(
        "task-003",
        "实现技能冷却与施法前摇",
        "一个英雄的一个技能，包含冷却、前摇和打断。",
        "running",
        "P0",
        "role-builder",
        "role-architect",
        acceptance("冷却按 tick 计算", "前摇可被控制打断", "单测覆盖边界").map(
          (item, index) => ({ ...item, done: index === 0 }),
        ),
        "task/003-ability",
      ),
      task(
        "task-004",
        "建立 replay 与性能基线",
        "每次合并都能跑同一段 replay，并记录帧时间。",
        "ready",
        "P1",
        "role-verifier",
        "role-lead",
        acceptance("replay 可复现", "性能基线有阈值"),
      ),
      task(
        "task-005",
        "首轮 playtest 问题清单",
        "人类实际玩一局，记录手感、可读性和阻断问题。",
        "backlog",
        "P1",
        "role-lead",
        "role-verifier",
        acceptance("至少 1 局完整对局", "问题按阻断/重要/建议分级"),
      ),
    ];
    return {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      createdAt: at,
      updatedAt: at,
      activeProjectId: project.id,
      projects: [project],
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
}
