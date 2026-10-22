// src/host/store.ts
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// src/shared/types.ts
var STUDIO_SCHEMA_VERSION = 18;
var STUDIO_PLUGIN_VERSION = "2.5.1";
var TASK_STATUS_ORDER = [
  "backlog",
  "ready",
  "running",
  "blocked",
  "review",
  "done"
];
var MERGE_STATUS_LABELS = {
  review: "\u5F85\u8BC4\u5BA1",
  approved: "\u5DF2\u6279\u51C6",
  rejected: "\u5DF2\u6253\u56DE",
  merged: "\u5DF2\u5408\u5E76"
};
var ALLOWED_TRANSITIONS = {
  backlog: ["ready"],
  ready: ["backlog", "running"],
  running: ["ready", "blocked", "review"],
  blocked: ["ready", "running"],
  review: ["running", "blocked", "done"],
  done: []
};
function canTransition(from, to) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
function isTaskStatus(value) {
  return typeof value === "string" && TASK_STATUS_ORDER.includes(value);
}
function isTaskPriority(value) {
  return value === "P0" || value === "P1" || value === "P2";
}

// src/host/store.ts
var StudioStoreError = class extends Error {
  code;
  status;
  constructor(code, message, status = 400) {
    super(message);
    this.name = "StudioStoreError";
    this.code = code;
    this.status = status;
  }
};
function defaultStudioDataDir() {
  const home = process.env.DSH_HOME?.trim();
  return path.join(
    home !== void 0 && home !== "" ? home : path.join(os.homedir(), ".dsh"),
    "studio"
  );
}
function nowIso(now) {
  return now().toISOString();
}
function newId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredText(value, field, max = 200) {
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
  }
  const text = value.trim();
  if (text === "") {
    throw new StudioStoreError("invalid_input", `${field} \u4E0D\u80FD\u4E3A\u7A7A`);
  }
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} \u4E0D\u80FD\u8D85\u8FC7 ${String(max)} \u4E2A\u5B57\u7B26`
    );
  }
  return text;
}
function optionalText(value, field, max = 4e3) {
  if (value === void 0 || value === null) return "";
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} \u4E0D\u80FD\u8D85\u8FC7 ${String(max)} \u4E2A\u5B57\u7B26`
    );
  }
  return text;
}
function optionalTokenBudget(value, field) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570 token \u6570`
    );
  }
  return value === 0 ? null : value;
}
function textList(value, field, maxItems = 20) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", `${field} \u5FC5\u987B\u662F\u6570\u7EC4`);
  }
  return value.slice(0, maxItems).map((item, index) => requiredText(item, `${field}[${String(index)}]`, 400));
}
function normalizeAcceptance(value, existing = []) {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "acceptance \u5FC5\u987B\u662F\u6570\u7EC4");
  }
  if (value.length === 0) {
    throw new StudioStoreError(
      "acceptance_required",
      "\u81F3\u5C11\u9700\u8981\u4E00\u6761\u53EF\u9A8C\u8BC1\u7684\u9A8C\u6536\u6807\u51C6"
    );
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 20).map((raw, index) => {
    if (typeof raw === "string") {
      const text2 = requiredText(raw, `acceptance[${String(index)}]`, 400);
      return { id: newId("acc"), text: text2, done: false };
    }
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `acceptance[${String(index)}] \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216\u5BF9\u8C61`
      );
    }
    const text = requiredText(
      raw.text,
      `acceptance[${String(index)}].text`,
      400
    );
    const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("acc");
    const previous = byId.get(id);
    return {
      id,
      text,
      done: typeof raw.done === "boolean" ? raw.done : previous?.done ?? false
    };
  });
}
function normalizeEvidence(value, existing, at) {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "evidence \u5FC5\u987B\u662F\u6570\u7EC4");
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 50).map((raw, index) => {
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `evidence[${String(index)}] \u5FC5\u987B\u662F\u5BF9\u8C61`
      );
    }
    const text = requiredText(raw.text, `evidence[${String(index)}].text`, 800);
    const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("ev");
    const previous = byId.get(id);
    return {
      id,
      text,
      createdAt: previous?.createdAt ?? (typeof raw.createdAt === "string" ? raw.createdAt : at)
    };
  });
}
function statsFor(tasks, proposals = []) {
  const stats = {
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
    mergeMerged: 0
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
var STALE_TASK_HOURS = 72;
var AGING_MERGE_HOURS = 48;
function hoursSince(iso, now) {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, (now.getTime() - at) / 36e5);
}
function latestIso(values) {
  let latest = null;
  let latestAt = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value === null || value === void 0) continue;
    const at = Date.parse(value);
    if (Number.isNaN(at) || at <= latestAt) continue;
    latest = value;
    latestAt = at;
  }
  return latest;
}
function buildCompany(state, now) {
  const projects = [];
  const needs = [];
  const roles = [];
  const risk = {
    staleTasks: 0,
    agingMerges: 0,
    missingEvidence: 0,
    blocked: 0,
    unowned: 0
  };
  const totals = {
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
    decidedDecisions: 0
  };
  for (const project of state.projects) {
    const projectTasks = state.tasks.filter(
      (task) => task.projectId === project.id
    );
    const projectProposals = state.mergeProposals.filter(
      (proposal) => proposal.projectId === project.id
    );
    const projectRoles = state.roles.filter(
      (role) => role.projectId === project.id
    );
    const projectRuns = state.runs.filter(
      (run) => run.projectId === project.id
    );
    const projectDecisions = state.decisions.filter(
      (decision) => decision.projectId === project.id
    );
    const roleById = new Map(projectRoles.map((role) => [role.id, role]));
    const stats = statsFor(projectTasks, projectProposals);
    const projectNeeds = [];
    const openTasks = projectTasks.filter((task) => task.status !== "done");
    const activeTasks = projectTasks.filter(
      (task) => task.status === "running" || task.status === "review"
    );
    const activeRoleIds = new Set(
      activeTasks.map((task) => task.ownerRoleId).filter((id) => id !== null)
    );
    for (const task of projectTasks) {
      const owner = task.ownerRoleId === null ? null : roleById.get(task.ownerRoleId);
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
          title: `\u4EFB\u52A1\u963B\u585E\uFF1A${task.title}`,
          detail: "\u9700\u8981\u89E3\u9664\u963B\u585E\u3001\u91CD\u65B0\u89C4\u5212\uFF0C\u6216\u7531\u4F60\u51B3\u5B9A\u662F\u5426\u6682\u505C",
          ageHours: age === null ? null : Math.round(age)
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
          title: `\u7F3A\u8BC1\u636E\uFF1A${task.title}`,
          detail: "\u9A8C\u6536\u524D\u81F3\u5C11\u9700\u8981\u4E00\u6761\u53EF\u590D\u73B0\u7684\u6D4B\u8BD5\u3001\u547D\u4EE4\u6216 replay",
          ageHours: age === null ? null : Math.round(age)
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
          title: `\u5F85\u9A8C\u6536\uFF1A${task.title}`,
          detail: `${owner?.name ?? "\u672A\u6307\u6D3E"} \xB7 \u9A8C\u6536 ${String(acceptanceDone)}/${String(task.acceptance.length)}`,
          ageHours: age === null ? null : Math.round(age)
        });
      }
      if (task.status !== "done" && age !== null && age > STALE_TASK_HOURS) {
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
            title: `\u4EFB\u52A1\u505C\u6EDE\uFF1A${task.title}`,
            detail: `\u5DF2\u7ECF ${String(Math.round(age))} \u5C0F\u65F6\u6CA1\u6709\u66F4\u65B0`,
            ageHours: Math.round(age)
          });
        }
      }
      if (task.status !== "done" && task.status !== "backlog" && task.ownerRoleId === null) {
        risk.unowned += 1;
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-unowned`,
          kind: "unowned_task",
          severity: "info",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `\u65E0\u4EBA\u8D1F\u8D23\uFF1A${task.title}`,
          detail: "\u4EFB\u52A1\u5DF2\u8FDB\u5165\u6267\u884C\u533A\uFF0C\u4F46\u6CA1\u6709\u8D1F\u8D23\u4EBA",
          ageHours: age === null ? null : Math.round(age)
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
        title: proposal.status === "review" ? `\u5408\u5E76\u5F85\u8BC4\u5BA1\uFF1A${task?.title ?? proposal.taskId}` : `\u5408\u5E76\u5DF2\u6279\u51C6\uFF0C\u7B49\u5F85\u6267\u884C\uFF1A${task?.title ?? proposal.taskId}`,
        detail: `${proposal.branch} \u2192 ${proposal.base} \xB7 ${proposal.risk}`,
        ageHours: age === null ? null : Math.round(age)
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
        title: `\u9879\u76EE\u8FD8\u6CA1\u914D\u7F6E\u89D2\u8272\uFF1A${project.name}`,
        detail: "\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u89D2\u8272\uFF0C\u4EFB\u52A1\u624D\u6709\u8D1F\u8D23\u4EBA\u548C\u9A8C\u6536\u4EBA",
        ageHours: null
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
        title: `\u9879\u76EE\u8FD8\u6CA1\u6709\u4EFB\u52A1\uFF1A${project.name}`,
        detail: "\u521B\u5EFA\u7B2C\u4E00\u6761\u5E26\u9A8C\u6536\u6807\u51C6\u7684\u4EFB\u52A1\uFF0C\u9879\u76EE\u624D\u5F00\u59CB\u8FD0\u8F6C",
        ageHours: null
      });
    }
    const isActive = projectTasks.some(
      (task) => task.status !== "backlog" && task.status !== "done"
    ) || projectProposals.some(
      (proposal) => proposal.status === "review" || proposal.status === "approved"
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
      (run) => run.status === "running"
    ).length;
    totals.tokensUsed += projectRuns.reduce(
      (sum, run) => sum + (run.tokens ?? 0),
      0
    );
    totals.pendingDecisions += projectDecisions.filter(
      (decision) => decision.status === "pending"
    ).length;
    totals.decidedDecisions += projectDecisions.filter(
      (decision) => decision.status !== "pending"
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
        title: `\u5F85\u88C1\u51B3\uFF1A${decision.title}`,
        detail: decision.recommendation === "" ? "\u9700\u8981 Owner \u5728\u8463\u4E8B\u4F1A\u6279\u51C6\u6216\u62D2\u7EDD" : decision.recommendation,
        ageHours: hoursSince(decision.createdAt, now)
      });
    }
    for (const role of projectRoles) {
      const assigned = projectTasks.filter(
        (task) => task.ownerRoleId === role.id
      );
      const active = assigned.filter(
        (task) => task.status === "running" || task.status === "review"
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
        state: active >= 3 ? "overloaded" : active >= 1 ? "busy" : "idle"
      });
    }
    const health = projectNeeds.some((need) => need.severity === "critical") ? "critical" : projectNeeds.length > 0 ? "attention" : "steady";
    const lastActivityAt = latestIso([
      project.updatedAt,
      ...projectTasks.map((task) => task.updatedAt),
      ...projectProposals.map((proposal) => proposal.updatedAt),
      ...state.events.filter((event) => event.projectId === project.id).map((event) => event.at)
    ]);
    projects.push({
      project,
      stats,
      roleCount: projectRoles.length,
      activeRoleCount: activeRoleIds.size,
      openTasks: openTasks.length,
      health,
      lastActivityAt,
      openNeeds: projectNeeds.length
    });
    needs.push(...projectNeeds);
  }
  const healthRank = {
    critical: 0,
    attention: 1,
    steady: 2
  };
  projects.sort((left, right) => {
    const byHealth = healthRank[left.health] - healthRank[right.health];
    if (byHealth !== 0) return byHealth;
    return (right.lastActivityAt ?? "").localeCompare(
      left.lastActivityAt ?? ""
    );
  });
  const severityRank = {
    critical: 0,
    warning: 1,
    info: 2
  };
  needs.sort((left, right) => {
    const bySeverity = severityRank[left.severity] - severityRank[right.severity];
    if (bySeverity !== 0) return bySeverity;
    return (right.ageHours ?? 0) - (left.ageHours ?? 0);
  });
  roles.sort((left, right) => right.activeTasks - left.activeTasks);
  return {
    name: state.companyName,
    totals,
    projects,
    needs: needs.slice(0, 30),
    roles,
    risk,
    recentEvents: [...state.events].slice(-20).reverse(),
    generatedAt: now.toISOString()
  };
}
function isProject(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.description === "string" && (value.tokenBudget === null || typeof value.tokenBudget === "number") && (value.repoPath === null || typeof value.repoPath === "string") && (value.prdPath === null || value.prdPath === void 0 || typeof value.prdPath === "string") && (value.invariantsPath === null || value.invariantsPath === void 0 || typeof value.invariantsPath === "string") && (value.modulesPath === null || value.modulesPath === void 0 || typeof value.modulesPath === "string") && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}
function isRole(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.name === "string" && typeof value.title === "string" && typeof value.mission === "string" && Array.isArray(value.responsibilities) && Array.isArray(value.nonGoals) && Array.isArray(value.decisionRights) && (value.model === null || typeof value.model === "string") && (value.executor === void 0 || value.executor === "dsh" || value.executor === "claude-code" || value.executor === "codex") && (value.tokenBudget === null || typeof value.tokenBudget === "number") && (value.dailyTokenBudget === null || typeof value.dailyTokenBudget === "number");
}
function isAgentRunStatus(value) {
  return value === "queued" || value === "running" || value === "succeeded" || value === "failed";
}
function isAgentRun(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && (value.roleId === null || typeof value.roleId === "string") && (value.branchId === null || typeof value.branchId === "string") && (value.branchName === null || typeof value.branchName === "string") && (value.workspacePath === null || typeof value.workspacePath === "string") && (value.diffStat === null || typeof value.diffStat === "string") && (value.sessionId === null || typeof value.sessionId === "string") && isAgentRunStatus(value.status) && (value.model === null || typeof value.model === "string") && typeof value.prompt === "string" && typeof value.output === "string" && (value.receipt === null || isRecord(value.receipt)) && (value.tokens === null || typeof value.tokens === "number") && (value.budgetWarning === null || typeof value.budgetWarning === "string") && (value.error === null || typeof value.error === "string") && typeof value.startedAt === "string" && (value.endedAt === null || typeof value.endedAt === "string");
}
function isTask(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.title === "string" && typeof value.goal === "string" && isTaskStatus(value.status) && isTaskPriority(value.priority) && Array.isArray(value.acceptance) && Array.isArray(value.evidence) && (value.verifyCommand === null || value.verifyCommand === void 0 || typeof value.verifyCommand === "string") && (value.module === null || value.module === void 0 || typeof value.module === "string") && (value.contractRef === null || value.contractRef === void 0 || typeof value.contractRef === "string") && (value.kind === void 0 || value.kind === "new" || value.kind === "fix") && (value.integration === void 0 || typeof value.integration === "boolean") && (value.originTaskId === null || value.originTaskId === void 0 || typeof value.originTaskId === "string") && (value.docsSynced === void 0 || typeof value.docsSynced === "boolean") && (value.diagnosis === void 0 || typeof value.diagnosis === "string") && (value.plan === void 0 || typeof value.plan === "string");
}
function isMergeRisk(value) {
  return value === "low" || value === "medium" || value === "high";
}
function isMergeProposal(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && typeof value.branch === "string" && typeof value.base === "string" && typeof value.summary === "string" && isMergeRisk(value.risk) && typeof value.rollback === "string" && (value.status === "review" || value.status === "approved" || value.status === "rejected" || value.status === "merged") && typeof value.reviewNote === "string" && (value.mergeCommit === null || typeof value.mergeCommit === "string") && (value.diffStat === null || value.diffStat === void 0 || typeof value.diffStat === "string") && (Array.isArray(value.changedFiles) || value.changedFiles === void 0) && (value.verificationId === null || value.verificationId === void 0 || typeof value.verificationId === "string") && (value.postMergeVerificationId === null || value.postMergeVerificationId === void 0 || typeof value.postMergeVerificationId === "string") && (value.rollbackCommit === null || value.rollbackCommit === void 0 || typeof value.rollbackCommit === "string") && (value.rolledBackAt === null || value.rolledBackAt === void 0 || typeof value.rolledBackAt === "string") && typeof value.createdAt === "string" && typeof value.updatedAt === "string" && (value.decidedAt === null || typeof value.decidedAt === "string") && (value.mergedAt === null || typeof value.mergedAt === "string");
}
function isDecisionStatus(value) {
  return value === "pending" || value === "approved" || value === "rejected";
}
function isDecision(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && (value.taskId === null || typeof value.taskId === "string") && (value.runId === null || typeof value.runId === "string") && typeof value.title === "string" && typeof value.context === "string" && Array.isArray(value.options) && typeof value.recommendation === "string" && (value.reversible === void 0 || typeof value.reversible === "boolean") && (value.adrDraft === null || value.adrDraft === void 0 || typeof value.adrDraft === "string") && (value.adrPath === null || value.adrPath === void 0 || typeof value.adrPath === "string") && isDecisionStatus(value.status) && typeof value.decision === "string" && typeof value.note === "string" && typeof value.decidedBy === "string" && (value.tokenCost === null || typeof value.tokenCost === "number") && typeof value.createdAt === "string" && (value.decidedAt === null || typeof value.decidedAt === "string");
}
function isBranchStatus(value) {
  return value === "open" || value === "review" || value === "merged" || value === "abandoned";
}
function isBranch(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && (value.taskId === null || typeof value.taskId === "string") && typeof value.name === "string" && typeof value.goal === "string" && (value.roleId === null || typeof value.roleId === "string") && Array.isArray(value.contractKeys) && isBranchStatus(value.status) && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}
function isContractChange(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.branchId === "string" && (value.taskId === null || typeof value.taskId === "string") && (value.runId === null || typeof value.runId === "string") && typeof value.contract === "string" && typeof value.change === "string" && typeof value.createdAt === "string";
}
function isVerification(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && (value.runId === null || typeof value.runId === "string") && typeof value.command === "string" && typeof value.workdir === "string" && typeof value.exitCode === "number" && typeof value.output === "string" && typeof value.passed === "boolean" && typeof value.createdAt === "string";
}
function isReview(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && (value.runId === null || typeof value.runId === "string") && (value.reviewerRoleId === null || typeof value.reviewerRoleId === "string") && (value.model === null || typeof value.model === "string") && (value.verdict === "pass" || value.verdict === "fail") && typeof value.summary === "string" && Array.isArray(value.findings) && (value.tokens === null || typeof value.tokens === "number") && typeof value.createdAt === "string";
}
function isModule(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.name === "string" && typeof value.responsibility === "string" && (value.contractPath === null || typeof value.contractPath === "string") && typeof value.contractText === "string" && Array.isArray(value.allowedPaths) && Array.isArray(value.forbiddenPaths) && Array.isArray(value.dependsOn) && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}
function migrateState(value) {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  let state = value;
  if (state.schemaVersion === 1) {
    state = {
      ...state,
      schemaVersion: 2,
      mergeProposals: []
    };
  }
  if (state.schemaVersion === 2) {
    state = {
      ...state,
      schemaVersion: 3,
      projects: state.projects.map((project) => ({
        ...project,
        tokenBudget: project.tokenBudget ?? null
      })),
      roles: state.roles.map((role) => ({
        ...role,
        model: role.model ?? null,
        tokenBudget: role.tokenBudget ?? null,
        dailyTokenBudget: role.dailyTokenBudget ?? null
      })),
      runs: Array.isArray(
        state.runs
      ) ? state.runs : []
    };
  }
  if (state.schemaVersion === 3) {
    state = {
      ...state,
      schemaVersion: 4,
      decisions: []
    };
  }
  if (state.schemaVersion === 4) {
    state = {
      ...state,
      schemaVersion: 5,
      runs: state.runs.map((run) => ({
        ...run,
        branchId: run.branchId ?? null
      })),
      branches: state.tasks.filter((task) => task.branch !== null).map((task) => ({
        id: `branch-${task.id}`,
        projectId: task.projectId,
        taskId: task.id,
        name: task.branch,
        goal: task.goal,
        roleId: task.ownerRoleId,
        contractKeys: [],
        status: task.status === "review" ? "review" : "open",
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      })),
      contractChanges: []
    };
  }
  if (state.schemaVersion === 5) {
    state = {
      ...state,
      schemaVersion: 6,
      projects: state.projects.map((project) => ({
        ...project,
        repoPath: project.repoPath ?? null
      })),
      runs: state.runs.map((run) => ({
        ...run,
        branchName: run.branchName ?? null,
        workspacePath: run.workspacePath ?? null,
        diffStat: run.diffStat ?? null
      }))
    };
  }
  if (state.schemaVersion === 6) {
    state = {
      ...state,
      schemaVersion: 7,
      tasks: state.tasks.map((task) => ({
        ...task,
        verifyCommand: task.verifyCommand ?? null
      })),
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        diffStat: proposal.diffStat ?? null,
        changedFiles: Array.isArray(proposal.changedFiles) ? proposal.changedFiles : [],
        verificationId: proposal.verificationId ?? null
      })),
      verifications: Array.isArray(
        state.verifications
      ) ? state.verifications : []
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
        kind: task.kind ?? "new"
      }))
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
        modulesPath: project.modulesPath ?? null
      })),
      modules: Array.isArray(
        state.modules
      ) ? state.modules : []
    };
  }
  if (state.schemaVersion === 9) {
    state = {
      ...state,
      schemaVersion: 10,
      tasks: state.tasks.map((task) => ({
        ...task,
        integration: task.integration ?? false,
        originTaskId: task.originTaskId ?? null
      }))
    };
  }
  if (state.schemaVersion === 10) {
    state = {
      ...state,
      schemaVersion: 11,
      reviews: Array.isArray(
        state.reviews
      ) ? state.reviews : []
    };
  }
  if (state.schemaVersion === 11) {
    state = {
      ...state,
      schemaVersion: 12,
      tasks: state.tasks.map((task) => ({
        ...task,
        docsSynced: task.docsSynced ?? false
      })),
      decisions: state.decisions.map((decision) => ({
        ...decision,
        reversible: decision.reversible ?? true
      }))
    };
  }
  if (state.schemaVersion === 12) {
    state = {
      ...state,
      schemaVersion: 13,
      decisions: state.decisions.map((decision) => ({
        ...decision,
        adrDraft: decision.adrDraft ?? null
      }))
    };
  }
  if (state.schemaVersion === 13) {
    state = {
      ...state,
      schemaVersion: 14,
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        postMergeVerificationId: proposal.postMergeVerificationId ?? null
      }))
    };
  }
  if (state.schemaVersion === 14) {
    state = {
      ...state,
      schemaVersion: 15,
      decisions: state.decisions.map((decision) => ({
        ...decision,
        adrPath: decision.adrPath ?? null
      })),
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        rollbackCommit: proposal.rollbackCommit ?? null,
        rolledBackAt: proposal.rolledBackAt ?? null
      }))
    };
  }
  if (state.schemaVersion === 15) {
    state = {
      ...state,
      schemaVersion: 16,
      tasks: state.tasks.map((task) => ({
        ...task,
        diagnosis: task.diagnosis ?? "",
        plan: task.plan ?? ""
      }))
    };
  }
  if (state.schemaVersion === 16) {
    state = {
      ...state,
      schemaVersion: 17,
      companyName: "AI\u5DE5\u4F5C\u5BA4"
    };
  }
  if (state.schemaVersion === 17) {
    return {
      ...state,
      schemaVersion: STUDIO_SCHEMA_VERSION,
      roles: state.roles.map((role) => ({
        ...role,
        executor: role.executor ?? "dsh"
      }))
    };
  }
  return state;
}
function assertState(value) {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  if (value.schemaVersion !== STUDIO_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Studio schema version: ${String(value.schemaVersion)}`
    );
  }
  if (typeof value.companyName !== "string" || value.companyName.trim() === "") {
    throw new Error("Studio state must contain a companyName");
  }
  if (!Array.isArray(value.projects) || !Array.isArray(value.roles) || !Array.isArray(value.modules) || !Array.isArray(value.tasks) || !Array.isArray(value.mergeProposals) || !Array.isArray(value.runs) || !Array.isArray(value.branches) || !Array.isArray(value.contractChanges) || !Array.isArray(value.decisions) || !Array.isArray(value.verifications) || !Array.isArray(value.reviews) || !Array.isArray(value.events)) {
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
var StudioStore = class {
  dataDir;
  file;
  now;
  state = null;
  queue = Promise.resolve();
  warning = null;
  constructor(options = {}) {
    this.dataDir = options.dataDir ?? defaultStudioDataDir();
    this.file = path.join(this.dataDir, "studio.json");
    this.now = options.now ?? (() => /* @__PURE__ */ new Date());
  }
  async init() {
    await this.runExclusive(async () => {
      await this.load();
    });
  }
  getWarning() {
    return this.warning;
  }
  async exportState() {
    return this.runExclusive(async () => {
      return structuredClone(this.requireState());
    });
  }
  async updateCompanyName(name) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const value = requiredText(name, "companyName", 80);
      const at = nowIso(this.now);
      state.companyName = value;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "settings.updated",
        at,
        projectId: null,
        taskId: null,
        payload: { companyName: value }
      });
      await this.save();
      return structuredClone(state);
    });
  }
  async importState(raw) {
    return this.runExclusive(async () => {
      if (!isRecord(raw)) {
        throw new StudioStoreError(
          "invalid_import",
          "\u5BFC\u5165\u6587\u4EF6\u5FC5\u987B\u662F Studio \u5BFC\u51FA\u7684 JSON \u5BF9\u8C61",
          400
        );
      }
      if (typeof raw.schemaVersion !== "number" || raw.schemaVersion > STUDIO_SCHEMA_VERSION) {
        throw new StudioStoreError(
          "unsupported_schema",
          `\u5BFC\u5165\u6587\u4EF6\u7684 schemaVersion \u5FC5\u987B <= ${String(STUDIO_SCHEMA_VERSION)}`,
          400
        );
      }
      let candidate;
      try {
        candidate = migrateState(raw);
        assertState(candidate);
      } catch (error) {
        throw new StudioStoreError(
          "invalid_import",
          `\u5BFC\u5165\u6587\u4EF6\u6821\u9A8C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,
          400
        );
      }
      const backup = `${this.file}.pre-import-${String(Date.now())}`;
      if (existsSync(this.file)) {
        await copyFile(this.file, backup);
      }
      this.state = structuredClone(candidate);
      this.warning = `\u5DF2\u5BFC\u5165\u6570\u636E\uFF1B\u539F\u6587\u4EF6\u5907\u4EFD\u5230 ${backup}`;
      await this.save();
      return structuredClone(this.requireState());
    });
  }
  async bootstrap(projectId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, projectId);
      const roles = project === null ? [] : state.roles.filter((role) => role.projectId === project.id);
      const modules = project === null ? [] : state.modules.filter((module) => module.projectId === project.id);
      const tasks = project === null ? [] : state.tasks.filter((task) => task.projectId === project.id);
      const mergeProposals = project === null ? [] : state.mergeProposals.filter(
        (proposal) => proposal.projectId === project.id
      );
      const runs = project === null ? [] : state.runs.filter((run) => run.projectId === project.id).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      );
      const branches = project === null ? [] : state.branches.filter((branch) => branch.projectId === project.id).sort(
        (left, right) => right.updatedAt.localeCompare(left.updatedAt)
      );
      const contractChanges = project === null ? [] : state.contractChanges.filter(
        (change) => change.projectId === project.id
      );
      const verifications = project === null ? [] : state.verifications.filter((verification) => verification.projectId === project.id).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
      );
      const reviews = project === null ? [] : state.reviews.filter((review) => review.projectId === project.id).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
      );
      const decisions = project === null ? [] : state.decisions.filter((decision) => decision.projectId === project.id).sort((left, right) => {
        if (left.status !== right.status) {
          if (left.status === "pending") return -1;
          if (right.status === "pending") return 1;
        }
        return right.createdAt.localeCompare(left.createdAt);
      });
      const events = [...state.events].filter((event) => project === null || event.projectId === project.id).slice(-30).reverse();
      const now = this.now();
      return {
        app: {
          pluginVersion: STUDIO_PLUGIN_VERSION,
          dshVersion: "unknown",
          compatibility: {
            status: "unknown",
            testedWith: "0.2.1-rc.2",
            message: ""
          },
          dataDir: this.dataDir,
          schemaVersion: STUDIO_SCHEMA_VERSION,
          serverTime: now.toISOString()
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
          gitMerge: false
        }
      };
    });
  }
  async createProject(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const at = nowIso(this.now);
      const project = {
        id: newId("proj"),
        name: requiredText(input.name, "name", 80),
        description: optionalText(input.description, "description", 600),
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        repoPath: optionalText(input.repoPath, "repoPath", 1e3) || null,
        prdPath: null,
        invariantsPath: null,
        modulesPath: null,
        createdAt: at,
        updatedAt: at
      };
      state.projects.push(project);
      state.activeProjectId = project.id;
      this.recordEvent(state, {
        type: "project.created",
        at,
        projectId: project.id,
        payload: { name: project.name }
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(project);
    });
  }
  async updateProject(projectId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === void 0) {
        throw new StudioStoreError("project_not_found", "\u9879\u76EE\u4E0D\u5B58\u5728", 404);
      }
      if (input.repoPath !== void 0) {
        project.repoPath = optionalText(input.repoPath, "repoPath", 1e3) || null;
      }
      if (input.prdPath !== void 0) {
        project.prdPath = optionalText(input.prdPath, "prdPath", 500) || null;
      }
      if (input.invariantsPath !== void 0) {
        project.invariantsPath = optionalText(input.invariantsPath, "invariantsPath", 500) || null;
      }
      if (input.modulesPath !== void 0) {
        project.modulesPath = optionalText(input.modulesPath, "modulesPath", 500) || null;
      }
      const at = nowIso(this.now);
      project.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "project.updated",
        at,
        projectId: project.id,
        payload: { repoPath: project.repoPath }
      });
      await this.save();
      return structuredClone(project);
    });
  }
  async selectProject(projectId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === void 0) {
        throw new StudioStoreError("project_not_found", "\u9879\u76EE\u4E0D\u5B58\u5728", 404);
      }
      state.activeProjectId = project.id;
      state.updatedAt = nowIso(this.now);
      await this.save();
      return structuredClone(project);
    });
  }
  async getDispatchContext(taskId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.kind === "fix" && !task.integration && (task.diagnosis.trim() === "" || task.plan.trim() === "")) {
        throw new StudioStoreError(
          "plan_required",
          "\u6539\u4FEE\u7968\u5FC5\u987B\u6709\u8BCA\u65AD\u548C\u4FEE\u6539\u8BA1\u5212\uFF0C\u624D\u80FD\u6D3E\u5355",
          409
        );
      }
      if (task.ownerRoleId === null) {
        throw new StudioStoreError(
          "owner_required",
          "\u4EFB\u52A1\u6CA1\u6709\u8D1F\u8D23\u4EBA\u89D2\u8272\uFF0C\u4E0D\u80FD\u6D3E\u5355",
          409
        );
      }
      const role = state.roles.find((item) => item.id === task.ownerRoleId);
      const project = state.projects.find(
        (item) => item.id === task.projectId
      );
      if (role === void 0 || project === void 0) {
        throw new StudioStoreError(
          "context_not_found",
          "\u4EFB\u52A1\u7684\u8D1F\u8D23\u4EBA\u89D2\u8272\u6216\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      const module = task.module === null ? void 0 : state.modules.find(
        (item) => item.projectId === task.projectId && item.name === task.module
      );
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        module: module === void 0 ? null : structuredClone(module)
      };
    });
  }
  async getReviewContext(taskId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.reviewerRoleId === null) {
        throw new StudioStoreError(
          "reviewer_required",
          "\u4EFB\u52A1\u6CA1\u6709\u9A8C\u6536\u4EBA\u89D2\u8272\uFF0C\u4E0D\u80FD\u72EC\u7ACB\u8BC4\u5BA1",
          409
        );
      }
      const role = state.roles.find(
        (item) => item.id === task.reviewerRoleId
      );
      const project = state.projects.find(
        (item) => item.id === task.projectId
      );
      if (role === void 0 || project === void 0) {
        throw new StudioStoreError(
          "context_not_found",
          "\u9A8C\u6536\u4EBA\u89D2\u8272\u6216\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      const run = [...state.runs].filter(
        (item) => item.taskId === taskId && item.workspacePath !== null
      ).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      )[0];
      const verification = [...state.verifications].filter((item) => item.taskId === taskId).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
      )[0];
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        run: run === void 0 ? null : structuredClone(run),
        verification: verification === void 0 ? null : structuredClone(verification)
      };
    });
  }
  async recordReview(taskId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const at = nowIso(this.now);
      const review = {
        id: newId("review"),
        projectId: task.projectId,
        taskId,
        runId: input.runId ?? null,
        reviewerRoleId: input.reviewerRoleId,
        model: input.model,
        verdict: input.verdict,
        summary: requiredText(input.summary, "summary", 2e3),
        findings: textList(input.findings, "findings", 30),
        tokens: input.tokens,
        createdAt: at
      };
      state.reviews.push(review);
      if (review.verdict === "pass") {
        const text = `\u72EC\u7ACB\u8BC4\u5BA1\u901A\u8FC7\uFF08${input.model}\uFF09\uFF1A${review.summary}`;
        if (!task.evidence.some((item) => item.text === text)) {
          task.evidence.push({ id: newId("ev"), text, createdAt: at });
        }
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: review.verdict === "pass" ? "review.passed" : "review.failed",
        at,
        projectId: task.projectId,
        taskId,
        payload: { reviewId: review.id, model: review.model }
      });
      await this.save();
      return structuredClone(review);
    });
  }
  async getTaskVerificationContext(taskId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const run = [...state.runs].filter(
        (item) => item.taskId === taskId && item.workspacePath !== null
      ).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      )[0];
      return {
        task: structuredClone(task),
        run: run === void 0 ? null : structuredClone(run)
      };
    });
  }
  async beginRun(taskId, prompt, workspace) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status !== "backlog" && task.status !== "ready") {
        throw new StudioStoreError(
          "task_not_dispatchable",
          "\u53EA\u6709\u5F85\u89C4\u5212\u6216\u53EF\u5F00\u59CB\u7684\u4EFB\u52A1\u53EF\u4EE5\u6D3E\u5355",
          409
        );
      }
      if (task.ownerRoleId === null) {
        throw new StudioStoreError(
          "owner_required",
          "\u4EFB\u52A1\u6CA1\u6709\u8D1F\u8D23\u4EBA\u89D2\u8272\uFF0C\u4E0D\u80FD\u6D3E\u5355",
          409
        );
      }
      const role = state.roles.find((item) => item.id === task.ownerRoleId);
      const project = state.projects.find(
        (item) => item.id === task.projectId
      );
      if (role === void 0 || project === void 0) {
        throw new StudioStoreError(
          "context_not_found",
          "\u4EFB\u52A1\u7684\u8D1F\u8D23\u4EBA\u89D2\u8272\u6216\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      const projectSpent = state.runs.filter((run2) => run2.projectId === project.id).reduce((sum, run2) => sum + (run2.tokens ?? 0), 0);
      if (project.tokenBudget !== null && projectSpent >= project.tokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `\u9879\u76EE token \u9884\u7B97\u5DF2\u7528\u5C3D\uFF08${String(projectSpent)} / ${String(
            project.tokenBudget
          )}\uFF09`,
          409
        );
      }
      const roleSpent = state.runs.filter((run2) => run2.roleId === role.id).reduce((sum, run2) => sum + (run2.tokens ?? 0), 0);
      if (role.tokenBudget !== null && roleSpent >= role.tokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `\u89D2\u8272 token \u9884\u7B97\u5DF2\u7528\u5C3D\uFF08${String(roleSpent)} / ${String(
            role.tokenBudget
          )}\uFF09`,
          409
        );
      }
      const today = nowIso(this.now).slice(0, 10);
      const dailySpent = state.runs.filter(
        (run2) => run2.roleId === role.id && run2.startedAt.slice(0, 10) === today
      ).reduce((sum, run2) => sum + (run2.tokens ?? 0), 0);
      if (role.dailyTokenBudget !== null && dailySpent >= role.dailyTokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `\u89D2\u8272\u4ECA\u65E5 token \u9884\u7B97\u5DF2\u7528\u5C3D\uFF08${String(dailySpent)} / ${String(
            role.dailyTokenBudget
          )}\uFF09`,
          409
        );
      }
      const at = nowIso(this.now);
      if (workspace !== void 0) {
        task.branch = workspace.branch;
      }
      const branch = this.ensureBranch(state, task, at);
      const run = {
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
        endedAt: null
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
          model: role.model
        }
      });
      await this.save();
      return structuredClone(run);
    });
  }
  async attachRunSession(runId, sessionId, model) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === void 0) return;
      run.sessionId = sessionId;
      if (model !== void 0) run.model = model;
      run.status = "running";
      await this.save();
    });
  }
  async completeRun(runId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === void 0) {
        throw new StudioStoreError("run_not_found", "Agent Run \u4E0D\u5B58\u5728", 404);
      }
      const at = nowIso(this.now);
      const task = state.tasks.find((item) => item.id === run.taskId);
      const project = state.projects.find(
        (item) => item.id === run.projectId
      );
      const role = state.roles.find((item) => item.id === run.roleId);
      const receiptComplete = input.receipt !== null && typeof input.receipt.summary === "string" && input.receipt.summary.trim() !== "" && Array.isArray(input.receipt.evidence) && input.receipt.evidence.length > 0;
      if (!receiptComplete) {
        run.status = "failed";
        run.output = input.output.slice(0, 3e4);
        run.receipt = input.receipt;
        run.tokens = input.tokens;
        run.error = "\u56DE\u6267\u4E0D\u5B8C\u6574\uFF1A\u5FC5\u987B\u5305\u542B\u975E\u7A7A summary \u548C\u81F3\u5C11\u4E00\u6761 evidence\uFF0C\u4EFB\u52A1\u4E0D\u80FD\u8FDB\u5165 review";
        run.endedAt = at;
        if (task !== void 0 && task.status === "running") {
          task.status = "ready";
          task.updatedAt = at;
        }
        if (task !== void 0) {
          this.escalateRepeatedFailure(
            state,
            task,
            at,
            run.error,
            run
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
            tokens: run.tokens
          }
        });
        await this.save();
        return structuredClone(run);
      }
      const spentProject = state.runs.filter(
        (item) => item.projectId === run.projectId && item.id !== run.id
      ).reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const spentRole = state.runs.filter(
        (item) => item.roleId === run.roleId && item.id !== run.id
      ).reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const warnings = [];
      if (project !== void 0 && project.tokenBudget !== null && input.tokens !== null && spentProject + input.tokens > project.tokenBudget) {
        warnings.push(
          `\u9879\u76EE token \u9884\u7B97\u8D85\u51FA\uFF1A${String(spentProject + input.tokens)} / ${String(
            project.tokenBudget
          )}`
        );
      }
      if (role !== void 0 && role.tokenBudget !== null && input.tokens !== null && spentRole + input.tokens > role.tokenBudget) {
        warnings.push(
          `\u89D2\u8272 token \u9884\u7B97\u8D85\u51FA\uFF1A${String(spentRole + input.tokens)} / ${String(
            role.tokenBudget
          )}`
        );
      }
      run.status = "succeeded";
      run.output = input.output.slice(0, 3e4);
      run.receipt = input.receipt;
      run.tokens = input.tokens;
      run.diffStat = input.diffStat ?? null;
      run.budgetWarning = warnings.length === 0 ? null : warnings.join("\uFF1B");
      run.endedAt = at;
      if (task !== void 0) {
        if (input.receipt !== null) {
          const existing = new Set(task.evidence.map((item) => item.text));
          for (const text of input.receipt.evidence.slice(0, 10)) {
            if (existing.has(text)) continue;
            task.evidence.push({
              id: newId("ev"),
              text,
              createdAt: at
            });
          }
          if (task.status === "running") task.status = "review";
        }
        task.updatedAt = at;
      }
      if (input.receipt !== null) {
        let branch = run.branchId === null ? void 0 : state.branches.find((item) => item.id === run.branchId);
        if (branch === void 0 && task !== void 0) {
          branch = this.ensureBranch(state, task, at);
          run.branchId = branch.id;
        }
        if (branch !== void 0) {
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
              (item) => item.projectId === run.projectId && item.contract === contract && item.branchId !== branch.id && item.change !== change
            );
            if (!state.contractChanges.some(
              (item) => item.branchId === branch.id && item.contract === contract && item.change === change
            )) {
              state.contractChanges.push({
                id: newId("contract"),
                projectId: run.projectId,
                branchId: branch.id,
                taskId: run.taskId,
                runId: run.id,
                contract,
                change,
                createdAt: at
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
                  runId: run.id
                }
              });
            }
            if (conflict === void 0) continue;
            const title = `\u5951\u7EA6\u51B2\u7A81\uFF1A${contract.slice(0, 160)}`;
            if (state.decisions.some(
              (item) => item.runId === run.id && item.title === title
            )) {
              continue;
            }
            const otherBranch = state.branches.find(
              (item) => item.id === conflict.branchId
            );
            const decision = {
              id: newId("dec"),
              projectId: run.projectId,
              taskId: run.taskId,
              runId: run.id,
              title,
              context: `${branch.name}: ${change}
${otherBranch?.name ?? conflict.branchId}: ${conflict.change}`,
              options: [
                {
                  label: `\u91C7\u7528 ${branch.name} \u7684\u53D8\u66F4`,
                  tradeoff: change
                },
                {
                  label: `\u91C7\u7528 ${otherBranch?.name ?? "\u53E6\u4E00\u652F\u7EBF"} \u7684\u53D8\u66F4`,
                  tradeoff: conflict.change
                }
              ],
              recommendation: "\u540C\u4E00\u5951\u7EA6\u51FA\u73B0\u4E24\u6761\u4E0D\u540C\u53D8\u66F4\u3002\u8BF7\u7531 Owner/Architect \u88C1\u51B3\uFF1B\u5728\u88C1\u51B3\u524D\u4E0D\u8981\u5408\u5E76\u4EFB\u610F\u4E00\u6761\u652F\u7EBF\u3002",
              reversible: true,
              adrDraft: null,
              adrPath: null,
              status: "pending",
              decision: "",
              note: "",
              decidedBy: "",
              tokenCost: input.tokens,
              createdAt: at,
              decidedAt: null
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
                runId: run.id
              }
            });
          }
        }
      }
      if (input.receipt !== null) {
        for (const proposed of input.receipt.decisions) {
          if (proposed.scope !== "project") continue;
          if (state.decisions.some(
            (item) => item.runId === run.id && item.title === proposed.title
          )) {
            continue;
          }
          const decision = {
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
            decidedAt: null
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
              title: decision.title
            }
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
          budgetWarning: run.budgetWarning
        }
      });
      await this.save();
      return structuredClone(run);
    });
  }
  async failRun(runId, error) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === void 0) {
        throw new StudioStoreError("run_not_found", "Agent Run \u4E0D\u5B58\u5728", 404);
      }
      const at = nowIso(this.now);
      run.status = "failed";
      run.error = error.slice(0, 4e3);
      run.endedAt = at;
      const task = state.tasks.find((item) => item.id === run.taskId);
      if (task !== void 0 && task.status === "running") {
        task.status = "ready";
        task.updatedAt = at;
      }
      if (task !== void 0) {
        this.escalateRepeatedFailure(state, task, at, run.error, run);
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.failed",
        at,
        projectId: run.projectId,
        taskId: run.taskId,
        payload: { runId: run.id, error: run.error }
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
  async enforceContractScope(taskId, runId, changedFiles) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const module = task.module === null ? void 0 : state.modules.find(
        (item) => item.projectId === task.projectId && item.name === task.module
      );
      if (module === void 0) return [];
      const normalize = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
      const contract = normalize(module.contractPath ?? "");
      const forbidden = module.forbiddenPaths.map(normalize).filter(Boolean);
      const allowed = module.allowedPaths.map(normalize).filter(Boolean);
      const violations = changedFiles.map(normalize).filter((file) => {
        if (file === "") return false;
        if (contract !== "" && file === contract) return true;
        if (forbidden.some(
          (path2) => file === path2 || file.startsWith(`${path2}/`)
        )) {
          return true;
        }
        if (allowed.length > 0 && (file.startsWith("src/") || file.startsWith("test/")) && !allowed.some(
          (path2) => file === path2 || file.startsWith(`${path2}/`)
        )) {
          return true;
        }
        return false;
      });
      if (violations.length === 0) return [];
      const at = nowIso(this.now);
      task.status = "blocked";
      task.updatedAt = at;
      const title = `\u5951\u7EA6\u8D8A\u754C\uFF1A${task.title.slice(0, 160)}`;
      if (!state.decisions.some(
        (item) => item.taskId === task.id && item.title === title
      )) {
        const run = state.runs.find((item) => item.id === runId);
        state.decisions.push({
          id: newId("dec"),
          projectId: task.projectId,
          taskId: task.id,
          runId,
          title,
          context: `\u6A21\u5757\u300C${module.name}\u300D\u7684\u5951\u7EA6/\u7981\u6B62\u8DEF\u5F84\u88AB\u4FEE\u6539\uFF1A${violations.join("\u3001")}`,
          options: [
            {
              label: "\u9000\u56DE Architect \u4FEE\u8BA2\u5951\u7EA6",
              tradeoff: "\u5148\u786E\u8BA4\u5951\u7EA6\u8FB9\u754C\u662F\u5426\u53D8\u5316\uFF0C\u518D\u91CD\u5F00 ticket"
            },
            {
              label: "\u64A4\u9500\u8D8A\u754C\u6539\u52A8",
              tradeoff: "\u4FDD\u7559\u73B0\u6709\u5951\u7EA6\uFF0C\u8981\u6C42 Agent \u53EA\u6539\u5141\u8BB8\u8DEF\u5F84"
            }
          ],
          recommendation: "\u5B9E\u73B0\u8005\u4E0D\u80FD\u76F4\u63A5\u6539\u5951\u7EA6\u6216\u7981\u6B62\u8DEF\u5F84\uFF1B\u9700\u8981\u5951\u7EA6\u53D8\u66F4\u65F6\uFF0C\u5E94\u7531 Architect/Owner \u5148\u66F4\u65B0\u5951\u7EA6\uFF0C\u518D\u91CD\u65B0\u6D3E\u5355\u3002",
          reversible: true,
          adrDraft: null,
          adrPath: null,
          status: "pending",
          decision: "",
          note: "",
          decidedBy: "",
          tokenCost: run?.tokens ?? null,
          createdAt: at,
          decidedAt: null
        });
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "contract.violated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { runId, module: module.name, violations }
      });
      await this.save();
      return violations;
    });
  }
  async recordVerification(taskId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const at = nowIso(this.now);
      const run = input.runId ? state.runs.find((item) => item.id === input.runId) : [...state.runs].filter(
        (item) => item.taskId === taskId && item.workspacePath !== null
      ).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      )[0];
      const verification = {
        id: newId("verify"),
        projectId: task.projectId,
        taskId,
        runId: run?.id ?? null,
        command: requiredText(input.command, "command", 500),
        workdir: requiredText(input.workdir, "workdir", 1e3),
        exitCode: input.exitCode,
        output: input.output.slice(0, 2e4),
        passed: input.passed,
        createdAt: at
      };
      state.verifications.push(verification);
      if (input.passed) {
        const text = `\u9A8C\u8BC1\u901A\u8FC7\uFF1A\`${verification.command}\`\uFF08exit 0\uFF09`;
        if (!task.evidence.some((item) => item.text === text)) {
          task.evidence.push({
            id: newId("ev"),
            text,
            createdAt: at
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
          runId: verification.runId
        }
      });
      await this.save();
      return structuredClone(verification);
    });
  }
  async getDecisionAdrContext(decisionId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId
      );
      if (decision === void 0) {
        throw new StudioStoreError(
          "decision_not_found",
          "\u51B3\u7B56\u4E0D\u5B58\u5728",
          404
        );
      }
      const project = state.projects.find(
        (item) => item.id === decision.projectId
      );
      if (project === void 0) {
        throw new StudioStoreError(
          "project_not_found",
          "\u51B3\u7B56\u5BF9\u5E94\u7684\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      return {
        decision: structuredClone(decision),
        project: structuredClone(project)
      };
    });
  }
  async setDecisionAdrPath(decisionId, adrPath) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId
      );
      if (decision === void 0) {
        throw new StudioStoreError(
          "decision_not_found",
          "\u51B3\u7B56\u4E0D\u5B58\u5728",
          404
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
        payload: { decisionId, adrPath }
      });
      await this.save();
      return structuredClone(decision);
    });
  }
  async createPostMergeDecision(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, input.taskId);
      const title = `\u5408\u5E76\u540E\u56DE\u5F52\u5931\u8D25\uFF1A${task.title.slice(0, 140)}`;
      if (state.decisions.some(
        (item) => item.taskId === task.id && item.title === title
      )) {
        return null;
      }
      const at = nowIso(this.now);
      const decision = {
        id: newId("dec"),
        projectId: task.projectId,
        taskId: task.id,
        runId: null,
        title,
        context: [
          `\u5408\u5E76 ${input.mergeCommit} \u540E\u6267\u884C\u56DE\u5F52\uFF1A${input.command}\uFF08exit ${String(input.exitCode)}\uFF09`,
          "",
          input.output.slice(0, 6e3)
        ].join("\n"),
        options: [
          {
            label: "\u56DE\u6EDA\u8FD9\u6B21\u5408\u5E76",
            tradeoff: `git revert ${input.mergeCommit} \u6216 git reset --hard ${input.mergeCommit}^`
          },
          {
            label: "\u4FDD\u7559\u5408\u5E76\uFF0C\u4FEE\u590D\u56DE\u5F52",
            tradeoff: "\u5728\u4E3B\u5206\u652F\u4E0A\u8FFD\u52A0\u4FEE\u590D\u63D0\u4EA4\uFF0C\u5E76\u91CD\u65B0\u8DD1\u56DE\u5F52"
          }
        ],
        recommendation: "\u5408\u5E76\u540E\u56DE\u5F52\u5931\u8D25\u3002\u5148\u770B\u8F93\u51FA\u5B9A\u4F4D\u7834\u574F\u70B9\uFF1B\u65E0\u6CD5\u5FEB\u901F\u4FEE\u590D\u65F6\u56DE\u6EDA merge commit\uFF0C\u518D\u91CD\u65B0\u8D70\u63D0\u6848\u3002",
        reversible: true,
        adrDraft: null,
        adrPath: null,
        status: "pending",
        decision: "",
        note: "",
        decidedBy: "",
        tokenCost: null,
        createdAt: at,
        decidedAt: null
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
          kind: "post_merge_regression"
        }
      });
      await this.save();
      return structuredClone(decision);
    });
  }
  async createDecision(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, void 0);
      if (project === null) {
        throw new StudioStoreError("project_required", "\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE");
      }
      let taskId = null;
      if (input.taskId !== void 0 && input.taskId !== null) {
        const task = this.findTask(state, input.taskId);
        if (task.projectId !== project.id) {
          throw new StudioStoreError(
            "task_not_found",
            "\u4EFB\u52A1\u4E0D\u5C5E\u4E8E\u5F53\u524D\u9879\u76EE",
            404
          );
        }
        taskId = task.id;
      }
      const at = nowIso(this.now);
      const decision = {
        id: newId("dec"),
        projectId: project.id,
        taskId,
        runId: null,
        title: requiredText(input.title, "title", 200),
        context: optionalText(input.context, "context", 4e3),
        options: [],
        recommendation: optionalText(
          input.recommendation,
          "recommendation",
          2e3
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
        decidedAt: null
      };
      state.decisions.push(decision);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "decision.created",
        at,
        projectId: project.id,
        taskId,
        payload: { decisionId: decision.id, title: decision.title }
      });
      await this.save();
      return structuredClone(decision);
    });
  }
  async decideDecision(decisionId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId
      );
      if (decision === void 0) {
        throw new StudioStoreError(
          "decision_not_found",
          "\u51B3\u7B56\u4E0D\u5B58\u5728",
          404
        );
      }
      if (decision.status !== "pending") {
        throw new StudioStoreError(
          "decision_decided",
          "\u8FD9\u6761\u51B3\u7B56\u5DF2\u7ECF\u6709\u7ED3\u8BBA",
          409
        );
      }
      if (input.status !== "approved" && input.status !== "rejected") {
        throw new StudioStoreError(
          "invalid_input",
          "\u51B3\u7B56\u72B6\u6001\u53EA\u80FD\u662F approved \u6216 rejected"
        );
      }
      if (decision.reversible === false && input.status === "approved" && optionalText(input.decision, "decision", 4e3) === "") {
        throw new StudioStoreError(
          "decision_reason_required",
          "\u4E0D\u53EF\u9006\u51B3\u7B56\u6279\u51C6\u65F6\u5FC5\u987B\u5199\u660E\u7ED3\u8BBA\u548C\u7406\u7531",
          409
        );
      }
      const at = nowIso(this.now);
      decision.status = input.status;
      decision.decision = optionalText(input.decision, "decision", 4e3);
      decision.note = optionalText(input.note, "note", 2e3);
      decision.decidedBy = "Owner";
      decision.decidedAt = at;
      if (input.status === "approved" && decision.reversible === false) {
        decision.adrDraft = [
          `# ADR: ${decision.title}`,
          "",
          `- \u65E5\u671F\uFF1A${at.slice(0, 10)}`,
          "- \u72B6\u6001\uFF1AAccepted",
          "- \u4E0D\u53EF\u9006\uFF1A\u662F",
          "",
          "## \u80CC\u666F",
          decision.context || "\uFF08\u672A\u586B\u5199\uFF09",
          "",
          "## \u51B3\u7B56",
          decision.decision || "\uFF08\u672A\u586B\u5199\uFF09",
          "",
          "## \u7406\u7531",
          decision.note || "\uFF08\u672A\u586B\u5199\uFF09",
          "",
          "## \u5EFA\u8BAE",
          decision.recommendation || "\uFF08\u65E0\uFF09",
          ""
        ].join("\n");
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: input.status === "approved" ? "decision.approved" : "decision.rejected",
        at,
        projectId: decision.projectId,
        taskId: decision.taskId,
        payload: {
          decisionId: decision.id,
          decision: decision.decision,
          note: decision.note
        }
      });
      await this.save();
      return structuredClone(decision);
    });
  }
  async createModule(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, void 0);
      if (project === null) {
        throw new StudioStoreError("project_required", "\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE");
      }
      const name = requiredText(input.name, "name", 120);
      if (state.modules.some(
        (module2) => module2.projectId === project.id && module2.name === name
      )) {
        throw new StudioStoreError(
          "module_exists",
          "\u540C\u4E00\u9879\u76EE\u4E0B\u6A21\u5757\u540D\u4E0D\u80FD\u91CD\u590D",
          409
        );
      }
      const at = nowIso(this.now);
      const module = {
        id: newId("module"),
        projectId: project.id,
        name,
        responsibility: optionalText(
          input.responsibility,
          "responsibility",
          2e3
        ),
        contractPath: optionalText(input.contractPath, "contractPath", 500) || null,
        contractText: optionalText(
          input.contractText,
          "contractText",
          8e3
        ),
        allowedPaths: textList(input.allowedPaths, "allowedPaths", 30),
        forbiddenPaths: textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30
        ),
        dependsOn: textList(input.dependsOn, "dependsOn", 20),
        createdAt: at,
        updatedAt: at
      };
      state.modules.push(module);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "module.created",
        at,
        projectId: project.id,
        payload: { moduleId: module.id, name: module.name }
      });
      await this.save();
      return structuredClone(module);
    });
  }
  async updateModule(moduleId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const module = state.modules.find((item) => item.id === moduleId);
      if (module === void 0) {
        throw new StudioStoreError("module_not_found", "\u6A21\u5757\u4E0D\u5B58\u5728", 404);
      }
      if (input.responsibility !== void 0) {
        module.responsibility = optionalText(
          input.responsibility,
          "responsibility",
          2e3
        );
      }
      if (input.contractPath !== void 0) {
        module.contractPath = optionalText(input.contractPath, "contractPath", 500) || null;
      }
      if (input.contractText !== void 0) {
        module.contractText = optionalText(
          input.contractText,
          "contractText",
          8e3
        );
      }
      if (input.allowedPaths !== void 0) {
        module.allowedPaths = textList(
          input.allowedPaths,
          "allowedPaths",
          30
        );
      }
      if (input.forbiddenPaths !== void 0) {
        module.forbiddenPaths = textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30
        );
      }
      if (input.dependsOn !== void 0) {
        module.dependsOn = textList(input.dependsOn, "dependsOn", 20);
      }
      const at = nowIso(this.now);
      module.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "module.updated",
        at,
        projectId: module.projectId,
        payload: { moduleId: module.id }
      });
      await this.save();
      return structuredClone(module);
    });
  }
  async createRole(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, void 0);
      if (project === null) {
        throw new StudioStoreError("project_required", "\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE");
      }
      const at = nowIso(this.now);
      const role = {
        id: newId("role"),
        projectId: project.id,
        name: requiredText(input.name, "name", 60),
        title: optionalText(input.title, "title", 80),
        mission: optionalText(input.mission, "mission", 600),
        responsibilities: textList(input.responsibilities, "responsibilities"),
        nonGoals: textList(input.nonGoals, "nonGoals"),
        decisionRights: textList(input.decisionRights, "decisionRights"),
        model: optionalText(input.model, "model", 120) || null,
        executor: input.executor === "claude-code" || input.executor === "codex" ? input.executor : "dsh",
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        dailyTokenBudget: optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget"
        ),
        createdAt: at,
        updatedAt: at
      };
      state.roles.push(role);
      this.recordEvent(state, {
        type: "role.created",
        at,
        projectId: project.id,
        payload: { roleId: role.id, name: role.name }
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(role);
    });
  }
  async updateRole(roleId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const role = state.roles.find((item) => item.id === roleId);
      if (role === void 0) {
        throw new StudioStoreError("role_not_found", "\u89D2\u8272\u4E0D\u5B58\u5728", 404);
      }
      if (input.name !== void 0) {
        role.name = requiredText(input.name, "name", 60);
      }
      if (input.title !== void 0) {
        role.title = optionalText(input.title, "title", 80);
      }
      if (input.mission !== void 0) {
        role.mission = optionalText(input.mission, "mission", 600);
      }
      if (input.responsibilities !== void 0) {
        role.responsibilities = textList(
          input.responsibilities,
          "responsibilities"
        );
      }
      if (input.nonGoals !== void 0) {
        role.nonGoals = textList(input.nonGoals, "nonGoals");
      }
      if (input.decisionRights !== void 0) {
        role.decisionRights = textList(input.decisionRights, "decisionRights");
      }
      if (input.model !== void 0) {
        role.model = optionalText(input.model, "model", 120) || null;
      }
      if (input.executor !== void 0) {
        role.executor = input.executor === "claude-code" || input.executor === "codex" ? input.executor : "dsh";
      }
      if (input.tokenBudget !== void 0) {
        role.tokenBudget = optionalTokenBudget(input.tokenBudget, "tokenBudget");
      }
      if (input.dailyTokenBudget !== void 0) {
        role.dailyTokenBudget = optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget"
        );
      }
      role.updatedAt = nowIso(this.now);
      state.updatedAt = role.updatedAt;
      this.recordEvent(state, {
        type: "role.updated",
        at: role.updatedAt,
        projectId: role.projectId,
        payload: { roleId: role.id }
      });
      await this.save();
      return structuredClone(role);
    });
  }
  async createTask(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, void 0);
      if (project === null) {
        throw new StudioStoreError("project_required", "\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE");
      }
      const at = nowIso(this.now);
      const ownerRoleId = this.resolveRoleId(
        state,
        project.id,
        input.ownerRoleId,
        "ownerRoleId"
      );
      const reviewerRoleId = this.resolveRoleId(
        state,
        project.id,
        input.reviewerRoleId,
        "reviewerRoleId"
      );
      const task = {
        id: newId("task"),
        projectId: project.id,
        title: requiredText(input.title, "title", 160),
        goal: optionalText(input.goal, "goal", 2e3),
        status: "backlog",
        priority: isTaskPriority(input.priority) ? input.priority : "P1",
        ownerRoleId,
        reviewerRoleId,
        acceptance: normalizeAcceptance(input.acceptance ?? []),
        evidence: [],
        branch: optionalText(input.branch, "branch", 160) || null,
        verifyCommand: optionalText(input.verifyCommand, "verifyCommand", 500) || null,
        module: optionalText(input.module, "module", 120) || null,
        contractRef: optionalText(input.contractRef, "contractRef", 300) || null,
        kind: input.kind === "fix" ? "fix" : "new",
        diagnosis: optionalText(input.diagnosis, "diagnosis", 4e3),
        plan: optionalText(input.plan, "plan", 4e3),
        integration: input.integration === true,
        originTaskId: optionalText(input.originTaskId, "originTaskId", 120) || null,
        docsSynced: false,
        createdAt: at,
        updatedAt: at
      };
      state.tasks.push(task);
      this.recordEvent(state, {
        type: "task.created",
        at,
        projectId: project.id,
        taskId: task.id,
        payload: { title: task.title, priority: task.priority }
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(task);
    });
  }
  async updateTask(taskId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status === "done") {
        throw new StudioStoreError(
          "task_locked",
          "\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u4E0D\u80FD\u76F4\u63A5\u4FEE\u6539\uFF0C\u8BF7\u521B\u5EFA\u4E00\u4E2A\u540E\u7EED\u4EFB\u52A1"
        );
      }
      const at = nowIso(this.now);
      if (input.title !== void 0) {
        task.title = requiredText(input.title, "title", 160);
      }
      if (input.goal !== void 0) {
        task.goal = optionalText(input.goal, "goal", 2e3);
      }
      if (input.priority !== void 0) {
        if (!isTaskPriority(input.priority)) {
          throw new StudioStoreError("invalid_input", "priority \u65E0\u6548");
        }
        task.priority = input.priority;
      }
      if (input.ownerRoleId !== void 0) {
        task.ownerRoleId = this.resolveRoleId(
          state,
          task.projectId,
          input.ownerRoleId,
          "ownerRoleId"
        );
      }
      if (input.reviewerRoleId !== void 0) {
        task.reviewerRoleId = this.resolveRoleId(
          state,
          task.projectId,
          input.reviewerRoleId,
          "reviewerRoleId"
        );
      }
      if (input.acceptance !== void 0) {
        task.acceptance = normalizeAcceptance(input.acceptance, task.acceptance);
      }
      if (input.evidence !== void 0) {
        task.evidence = normalizeEvidence(input.evidence, task.evidence, at);
      }
      if (input.branch !== void 0) {
        task.branch = optionalText(input.branch, "branch", 160) || null;
      }
      if (input.verifyCommand !== void 0) {
        task.verifyCommand = optionalText(input.verifyCommand, "verifyCommand", 500) || null;
      }
      if (input.module !== void 0) {
        task.module = optionalText(input.module, "module", 120) || null;
      }
      if (input.contractRef !== void 0) {
        task.contractRef = optionalText(input.contractRef, "contractRef", 300) || null;
      }
      if (input.kind !== void 0) {
        task.kind = input.kind === "fix" ? "fix" : "new";
      }
      if (input.diagnosis !== void 0) {
        task.diagnosis = optionalText(input.diagnosis, "diagnosis", 4e3);
      }
      if (input.plan !== void 0) {
        task.plan = optionalText(input.plan, "plan", 4e3);
      }
      if (input.integration !== void 0) {
        task.integration = input.integration === true;
      }
      if (input.docsSynced !== void 0) {
        task.docsSynced = input.docsSynced === true;
      }
      task.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "task.updated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { fields: Object.keys(input) }
      });
      await this.save();
      return structuredClone(task);
    });
  }
  async transitionTask(taskId, next) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status === next) {
        return structuredClone(task);
      }
      if (!isTaskStatus(next) || !canTransition(task.status, next)) {
        throw new StudioStoreError(
          "invalid_transition",
          `\u4E0D\u80FD\u4ECE\u300C${task.status}\u300D\u76F4\u63A5\u5207\u6362\u5230\u300C${String(next)}\u300D`,
          409
        );
      }
      if (next === "done") {
        if (task.acceptance.length === 0) {
          throw new StudioStoreError(
            "acceptance_required",
            "\u6CA1\u6709\u9A8C\u6536\u6807\u51C6\uFF0C\u4E0D\u80FD\u5B8C\u6210\u4EFB\u52A1",
            409
          );
        }
        const open = task.acceptance.filter((item) => !item.done);
        if (open.length > 0) {
          throw new StudioStoreError(
            "acceptance_incomplete",
            `\u8FD8\u6709 ${String(open.length)} \u6761\u9A8C\u6536\u6807\u51C6\u672A\u5B8C\u6210`,
            409
          );
        }
        if (task.evidence.length === 0) {
          throw new StudioStoreError(
            "evidence_required",
            "\u9A8C\u6536\u524D\u81F3\u5C11\u8BB0\u5F55\u4E00\u6761\u53EF\u590D\u73B0\u7684\u8BC1\u636E\uFF08\u547D\u4EE4\u3001\u6D4B\u8BD5\u6216 replay\uFF09",
            409
          );
        }
        const project = state.projects.find(
          (item) => item.id === task.projectId
        );
        const hasCodeRun = state.runs.some(
          (item) => item.taskId === task.id && item.workspacePath !== null
        );
        if (project?.repoPath !== null && project?.repoPath !== void 0 && hasCodeRun && !state.reviews.some(
          (review) => review.taskId === task.id && review.verdict === "pass"
        )) {
          throw new StudioStoreError(
            "review_required",
            "\u4EE3\u7801\u4EFB\u52A1\u5B8C\u6210\u524D\u5FC5\u987B\u6709\u4E00\u6B21\u901A\u8FC7\u7684\u72EC\u7ACB\u8BC4\u5BA1",
            409
          );
        }
        const hasDocs = project !== void 0 && (project.prdPath !== null || project.invariantsPath !== null || project.modulesPath !== null);
        if (hasDocs && !task.docsSynced) {
          throw new StudioStoreError(
            "docs_sync_required",
            "\u9879\u76EE\u5DF2\u7ED1\u5B9A PRD/INVARIANTS/MODULES\uFF0C\u5B8C\u6210\u524D\u5FC5\u987B\u786E\u8BA4\u6587\u6863\u5DF2\u540C\u6B65",
            409
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
        payload: { from, to: next }
      });
      if (next === "done") {
        this.scheduleIntegrationGate(state, task.projectId, at);
      }
      await this.save();
      return structuredClone(task);
    });
  }
  scheduleIntegrationGate(state, projectId, at) {
    const done = state.tasks.filter(
      (item) => item.projectId === projectId && item.status === "done"
    ).length;
    const generated = state.tasks.filter(
      (item) => item.projectId === projectId && item.title.startsWith("\u96C6\u6210\u9A8C\u6536\uFF08\u81EA\u52A8 #")
    ).length;
    if (Math.floor(done / 3) <= generated) return;
    const lead = state.roles.find(
      (role) => role.projectId === projectId && (role.id === "role-lead" || role.title.includes("\u5236\u4F5C\u4EBA"))
    ) ?? state.roles.find((role) => role.projectId === projectId);
    const verifier = state.roles.find(
      (role) => role.projectId === projectId && (role.id === "role-verifier" || role.title.includes("QA"))
    ) ?? lead;
    if (lead === void 0) return;
    const index = generated + 1;
    const task = {
      id: newId("task"),
      projectId,
      title: `\u96C6\u6210\u9A8C\u6536\uFF08\u81EA\u52A8 #${String(index)}\uFF09`,
      goal: "\u6BCF 3 \u4E2A\u5B8C\u6210\u4EFB\u52A1\u540E\u7684\u96C6\u6210 gate\uFF1A\u6253\u5305\u5F53\u524D build\uFF0C\u4EBA\u73A9 10 \u5206\u949F\uFF0C\u8BB0\u5F55\u963B\u65AD\u95EE\u9898\u4E0E\u53EF\u7EE7\u7EED\u8FED\u4EE3\u7684\u5224\u65AD\u3002",
      status: "backlog",
      priority: "P1",
      ownerRoleId: lead.id,
      reviewerRoleId: verifier?.id ?? lead.id,
      acceptance: [
        {
          id: newId("acc"),
          text: "\u6253\u5305\u51FA\u53EF\u8FD0\u884C build",
          done: false
        },
        {
          id: newId("acc"),
          text: "\u4EBA\u73A9 10 \u5206\u949F\u5E76\u8BB0\u5F55\u963B\u65AD\u95EE\u9898",
          done: false
        }
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
      updatedAt: at
    };
    state.tasks.push(task);
    this.recordEvent(state, {
      type: "integration.scheduled",
      at,
      projectId,
      taskId: task.id,
      payload: { index, doneTasks: done }
    });
  }
  async listTransitions(taskId) {
    return this.runExclusive(async () => {
      const task = this.findTask(this.requireState(), taskId);
      return [...ALLOWED_TRANSITIONS[task.status]];
    });
  }
  async createMergeProposal(taskId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status !== "done") {
        throw new StudioStoreError(
          "task_not_accepted",
          "\u4EFB\u52A1\u9A8C\u6536\u901A\u8FC7\u540E\u624D\u80FD\u63D0\u4EA4\u5408\u5E76\u63D0\u6848",
          409
        );
      }
      if (task.acceptance.length === 0 || task.acceptance.some((item) => !item.done)) {
        throw new StudioStoreError(
          "acceptance_incomplete",
          "\u6240\u6709\u9A8C\u6536\u6807\u51C6\u5B8C\u6210\u524D\u4E0D\u80FD\u63D0\u4EA4\u5408\u5E76\u63D0\u6848",
          409
        );
      }
      if (task.evidence.length === 0) {
        throw new StudioStoreError(
          "evidence_required",
          "\u63D0\u4EA4\u5408\u5E76\u63D0\u6848\u524D\u81F3\u5C11\u8BB0\u5F55\u4E00\u6761\u8BC1\u636E",
          409
        );
      }
      const project = state.projects.find(
        (item) => item.id === task.projectId
      );
      if (project?.repoPath !== null && project?.repoPath !== void 0) {
        const passed = state.verifications.some(
          (item) => item.taskId === task.id && item.passed
        );
        if (!passed) {
          throw new StudioStoreError(
            "verification_required",
            "\u4EE3\u7801\u9879\u76EE\u63D0\u4EA4\u5408\u5E76\u63D0\u6848\u524D\u5FC5\u987B\u6709\u4E00\u6761\u901A\u8FC7\u7684\u72EC\u7ACB\u9A8C\u8BC1",
            409
          );
        }
      }
      const active = state.mergeProposals.find(
        (proposal2) => proposal2.taskId === task.id && (proposal2.status === "review" || proposal2.status === "approved" || proposal2.status === "merged")
      );
      if (active !== void 0) {
        throw new StudioStoreError(
          "merge_exists",
          `\u8BE5\u4EFB\u52A1\u5DF2\u6709\u5408\u5E76\u63D0\u6848\uFF08${MERGE_STATUS_LABELS[active.status]}\uFF09`,
          409
        );
      }
      const branch = requiredText(
        input.branch ?? task.branch ?? "",
        "branch",
        160
      );
      const risk = input.risk ?? "medium";
      if (!isMergeRisk(risk)) {
        throw new StudioStoreError("invalid_input", "risk \u5FC5\u987B\u662F low/medium/high");
      }
      const at = nowIso(this.now);
      const latestRun = [...state.runs].filter((run) => run.taskId === task.id).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      )[0];
      const latestVerification = [...state.verifications].filter((verification) => verification.taskId === task.id).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
      )[0];
      const changedFiles = latestRun?.diffStat === null || latestRun?.diffStat === void 0 ? [] : latestRun.diffStat.split("\n").filter((line) => /^[ MARC?]{1,2} \S/.test(line)).map((line) => line.slice(3).trim()).filter(Boolean);
      const proposal = {
        id: newId("merge"),
        projectId: task.projectId,
        taskId: task.id,
        branch,
        base: optionalText(input.base ?? "main", "base", 160) || "main",
        summary: requiredText(input.summary, "summary", 1e3),
        risk,
        rollback: requiredText(input.rollback, "rollback", 1e3),
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
        mergedAt: null
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
          risk: proposal.risk
        }
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(proposal);
    });
  }
  async approveMergeProposal(proposalId, note) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "review") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `\u53EA\u6709\u5F85\u8BC4\u5BA1\u7684\u5408\u5E76\u63D0\u6848\u53EF\u4EE5\u6279\u51C6\uFF1B\u5F53\u524D\u662F\u300C${MERGE_STATUS_LABELS[proposal.status]}\u300D`,
          409
        );
      }
      const at = nowIso(this.now);
      proposal.status = "approved";
      proposal.reviewNote = optionalText(note, "note", 1e3);
      proposal.decidedAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.approved",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: { proposalId: proposal.id, note: proposal.reviewNote }
      });
      await this.save();
      return structuredClone(proposal);
    });
  }
  async rejectMergeProposal(proposalId, note) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "review") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `\u53EA\u6709\u5F85\u8BC4\u5BA1\u7684\u5408\u5E76\u63D0\u6848\u53EF\u4EE5\u6253\u56DE\uFF1B\u5F53\u524D\u662F\u300C${MERGE_STATUS_LABELS[proposal.status]}\u300D`,
          409
        );
      }
      const at = nowIso(this.now);
      proposal.status = "rejected";
      proposal.reviewNote = requiredText(note, "note", 1e3);
      proposal.decidedAt = at;
      proposal.updatedAt = at;
      const task = state.tasks.find((item) => item.id === proposal.taskId);
      if (task !== void 0 && (task.status === "review" || task.status === "done")) {
        task.status = "running";
        task.updatedAt = at;
        this.recordEvent(state, {
          type: "task.reopened",
          at,
          projectId: task.projectId,
          taskId: task.id,
          payload: { reason: "merge_rejected", proposalId: proposal.id }
        });
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.rejected",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: { proposalId: proposal.id, note: proposal.reviewNote }
      });
      await this.save();
      return structuredClone(proposal);
    });
  }
  async getMergeContext(proposalId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      const project = state.projects.find(
        (item) => item.id === proposal.projectId
      );
      const task = state.tasks.find(
        (item) => item.id === proposal.taskId
      );
      if (project === void 0 || task === void 0) {
        throw new StudioStoreError(
          "project_not_found",
          "\u5408\u5E76\u63D0\u6848\u5BF9\u5E94\u7684\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      const verification = proposal.postMergeVerificationId === null ? void 0 : state.verifications.find(
        (item) => item.id === proposal.postMergeVerificationId
      );
      return {
        proposal: structuredClone(proposal),
        project: structuredClone(project),
        task: structuredClone(task),
        verification: verification === void 0 ? null : structuredClone(verification)
      };
    });
  }
  async completeMergeProposal(proposalId, mergeCommit) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "approved") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `\u53EA\u6709\u5DF2\u6279\u51C6\u7684\u5408\u5E76\u63D0\u6848\u53EF\u4EE5\u6807\u8BB0\u5408\u5E76\uFF1B\u5F53\u524D\u662F\u300C${MERGE_STATUS_LABELS[proposal.status]}\u300D`,
          409
        );
      }
      const at = nowIso(this.now);
      proposal.status = "merged";
      proposal.mergeCommit = optionalText(mergeCommit, "mergeCommit", 160) || null;
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
          mergeCommit: proposal.mergeCommit
        }
      });
      await this.save();
      return structuredClone(proposal);
    });
  }
  async setMergePostVerification(proposalId, verificationId) {
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
  async recordRollback(proposalId, rollbackCommit) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "merged") {
        throw new StudioStoreError(
          "rollback_not_merged",
          "\u53EA\u6709\u5DF2\u5408\u5E76\u7684\u63D0\u6848\u53EF\u4EE5\u56DE\u6EDA",
          409
        );
      }
      const at = nowIso(this.now);
      proposal.rollbackCommit = requiredText(
        rollbackCommit,
        "rollbackCommit",
        160
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
          rollbackCommit: proposal.rollbackCommit
        }
      });
      await this.save();
      return structuredClone(proposal);
    });
  }
  async load() {
    await mkdir(this.dataDir, { recursive: true });
    if (!existsSync(this.file)) {
      this.state = this.seedState();
      await this.save();
      return;
    }
    const raw = await readFile(this.file, "utf8");
    try {
      const parsed = JSON.parse(raw);
      const migrated = migrateState(parsed);
      assertState(migrated);
      this.state = migrated;
      if (!isRecord(parsed) || parsed.schemaVersion !== STUDIO_SCHEMA_VERSION) {
        await this.save();
      }
    } catch (error) {
      const backup = `${this.file}.corrupt-${String(Date.now())}`;
      await rename(this.file, backup).catch(() => void 0);
      this.state = this.seedState();
      this.warning = `studio.json \u65E0\u6CD5\u8BFB\u53D6\uFF0C\u5DF2\u5907\u4EFD\u5230 ${backup} \u5E76\u91CD\u5EFA\u6F14\u793A\u6570\u636E\uFF1A${error instanceof Error ? error.message : String(error)}`;
      await this.save();
    }
  }
  async save() {
    const state = this.requireState();
    state.updatedAt = nowIso(this.now);
    const serialized = `${JSON.stringify(state, null, 2)}
`;
    const temp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temp, serialized, "utf8");
    try {
      await rename(temp, this.file);
    } catch {
      await rm(this.file, { force: true });
      await rename(temp, this.file);
    }
  }
  requireState() {
    if (this.state === null) {
      throw new StudioStoreError(
        "store_not_ready",
        "Studio \u6570\u636E\u5C1A\u672A\u521D\u59CB\u5316",
        500
      );
    }
    return this.state;
  }
  pickProject(state, projectId) {
    if (projectId !== void 0) {
      const project = state.projects.find((item) => item.id === projectId);
      if (project === void 0) {
        throw new StudioStoreError("project_not_found", "\u9879\u76EE\u4E0D\u5B58\u5728", 404);
      }
      return project;
    }
    if (state.activeProjectId !== null) {
      const active = state.projects.find(
        (item) => item.id === state.activeProjectId
      );
      if (active !== void 0) return active;
    }
    return state.projects[0] ?? null;
  }
  escalateRepeatedFailure(state, task, at, reason, run) {
    const failures = state.runs.filter(
      (item) => item.taskId === task.id && item.status === "failed"
    ).length;
    if (failures < 2 || task.status === "done") return;
    task.status = "blocked";
    task.updatedAt = at;
    const hasResplit = state.tasks.some(
      (item) => item.originTaskId === task.id
    );
    if (!hasResplit) {
      const architect = state.roles.find(
        (role) => role.projectId === task.projectId && (role.id === "role-architect" || role.title.includes("\u67B6\u6784"))
      ) ?? state.roles.find((role) => role.id === task.ownerRoleId);
      if (architect !== void 0) {
        const resplit = {
          id: newId("task"),
          projectId: task.projectId,
          title: `\u91CD\u62C6\uFF1A${task.title}`.slice(0, 160),
          goal: `\u539F\u4EFB\u52A1\u8FDE\u7EED\u5931\u8D25 ${String(failures)} \u6B21\u3002\u5148\u8BCA\u65AD\u6839\u56E0\uFF0C\u91CD\u62C6\u4EFB\u52A1/\u5951\u7EA6\uFF0C\u4EA7\u51FA\u53EF\u6267\u884C\u7684\u65B0 ticket \u4E0E\u9A8C\u6536\u6807\u51C6\uFF1B\u4E0D\u8981\u76F4\u63A5\u5199\u4E1A\u52A1\u4EE3\u7801\u3002\u6700\u540E\u4E00\u6B21\u5931\u8D25\uFF1A${reason}`,
          status: "backlog",
          priority: task.priority,
          ownerRoleId: architect.id,
          reviewerRoleId: task.reviewerRoleId,
          acceptance: [
            {
              id: newId("acc"),
              text: "\u7ED9\u51FA\u91CD\u62C6\u540E\u7684\u4EFB\u52A1/\u5951\u7EA6",
              done: false
            },
            {
              id: newId("acc"),
              text: "\u6807\u660E\u53EF\u6267\u884C ticket \u4E0E\u9A8C\u6536\u6807\u51C6",
              done: false
            }
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
          updatedAt: at
        };
        state.tasks.push(resplit);
        this.recordEvent(state, {
          type: "task.resplit",
          at,
          projectId: task.projectId,
          taskId: resplit.id,
          payload: {
            originTaskId: task.id,
            ownerRoleId: architect.id
          }
        });
      }
    }
    const title = `\u8FDE\u7EED\u5931\u8D25\uFF1A${task.title.slice(0, 160)}`;
    if (state.decisions.some(
      (item) => item.taskId === task.id && item.title === title
    )) {
      return;
    }
    const decision = {
      id: newId("dec"),
      projectId: task.projectId,
      taskId: task.id,
      runId: run.id,
      title,
      context: `${String(failures)} \u6B21\u5931\u8D25\uFF1B\u6700\u540E\u4E00\u6B21\uFF1A${reason}`,
      options: [
        {
          label: "\u9000\u56DE Architect \u91CD\u62C6\u4EFB\u52A1/\u5951\u7EA6",
          tradeoff: "\u505C\u6B62\u539F\u5730\u91CD\u8BD5\uFF0C\u5148\u4FEE\u4EFB\u52A1\u5B9A\u4E49\u6216\u5951\u7EA6"
        },
        {
          label: "\u7EE7\u7EED\u91CD\u8BD5",
          tradeoff: "\u4FDD\u7559\u5F53\u524D\u4EFB\u52A1\uFF0C\u4F46\u9700\u8981\u65B0\u7684\u8BC1\u636E"
        }
      ],
      recommendation: "\u540C\u4E00\u4EFB\u52A1\u8FDE\u7EED\u5931\u8D25 2 \u6B21\uFF0C\u6309\u5DE5\u4F5C\u6D41\u5E94\u9000\u56DE\u67B6\u6784\u5E08\u91CD\u62C6\uFF0C\u4E0D\u5141\u8BB8\u7B2C\u4E09\u6B21\u539F\u5730\u91CD\u8BD5\u3002",
      reversible: true,
      adrDraft: null,
      adrPath: null,
      status: "pending",
      decision: "",
      note: "",
      decidedBy: "",
      tokenCost: run.tokens,
      createdAt: at,
      decidedAt: null
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
        runId: run.id
      }
    });
  }
  ensureBranch(state, task, at) {
    const name = task.branch ?? `task/${task.id}`;
    if (task.branch === null) task.branch = name;
    let branch = state.branches.find(
      (item) => item.projectId === task.projectId && item.name === name
    );
    if (branch === void 0) {
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
        updatedAt: at
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
  findTask(state, taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task === void 0) {
      throw new StudioStoreError("task_not_found", "\u4EFB\u52A1\u4E0D\u5B58\u5728", 404);
    }
    return task;
  }
  findMergeProposal(state, proposalId) {
    const proposal = state.mergeProposals.find((item) => item.id === proposalId);
    if (proposal === void 0) {
      throw new StudioStoreError("merge_not_found", "\u5408\u5E76\u63D0\u6848\u4E0D\u5B58\u5728", 404);
    }
    return proposal;
  }
  resolveRoleId(state, projectId, value, field) {
    if (value === void 0 || value === null || value === "") return null;
    if (typeof value !== "string") {
      throw new StudioStoreError("invalid_input", `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
    }
    const role = state.roles.find(
      (item) => item.id === value && item.projectId === projectId
    );
    if (role === void 0) {
      throw new StudioStoreError(
        "role_not_found",
        `${field} \u6307\u5411\u7684\u89D2\u8272\u4E0D\u5B58\u5728`,
        404
      );
    }
    return role.id;
  }
  recordEvent(state, input) {
    const event = {
      id: newId("evt"),
      type: input.type,
      at: input.at,
      actor: "human",
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      payload: input.payload ?? {}
    };
    state.events.push(event);
    if (state.events.length > 2e3) {
      state.events.splice(0, state.events.length - 2e3);
    }
  }
  runExclusive(work) {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  seedState() {
    const at = nowIso(this.now);
    const project = {
      id: "proj-demo",
      name: "\u793A\u4F8B\u9879\u76EE",
      description: "\u7528\u4E00\u6761\u6700\u5C0F\u94FE\u8DEF\u9A8C\u8BC1\u5DE5\u4F5C\u53F0\uFF1A\u4EFB\u52A1\u3001\u89D2\u8272\u3001\u9A8C\u6536\u548C\u72B6\u6001\u673A\u3002",
      tokenBudget: null,
      repoPath: null,
      prdPath: null,
      invariantsPath: null,
      modulesPath: null,
      createdAt: at,
      updatedAt: at
    };
    const role = (id, name, title, mission, responsibilities, decisionRights = []) => ({
      id,
      projectId: project.id,
      name,
      title,
      mission,
      responsibilities,
      nonGoals: [],
      decisionRights,
      model: null,
      executor: "dsh",
      tokenBudget: null,
      dailyTokenBudget: null,
      createdAt: at,
      updatedAt: at
    });
    const roles = [
      role(
        "role-lead",
        "Lead",
        "\u5236\u4F5C\u4EBA / \u8C03\u5EA6",
        "\u628A\u76EE\u6807\u53D8\u6210\u53EF\u6267\u884C\u7684\u4EFB\u52A1\u56FE\uFF0C\u5E76\u4FDD\u6301\u4EA4\u4ED8\u8282\u594F\u3002",
        ["\u62C6\u4EFB\u52A1", "\u6D3E\u5355", "\u8DDF\u8E2A\u963B\u585E", "\u7EC4\u7EC7\u590D\u76D8"],
        ["\u4EFB\u52A1\u4F18\u5148\u7EA7", "\u6D3E\u5355\u5BF9\u8C61"]
      ),
      role(
        "role-architect",
        "Architect",
        "\u67B6\u6784\u5E08",
        "\u5B88\u4F4F\u67B6\u6784\u5B8C\u6574\u6027\u4E0E\u63A5\u53E3\u5951\u7EA6\u3002",
        ["\u5199 ADR", "\u5B9A\u5951\u7EA6", "\u6280\u672F\u88C1\u51B3", "\u8BC4\u5BA1\u9AD8\u98CE\u9669\u53D8\u66F4"],
        ["\u6280\u672F\u65B9\u6848", "\u63A5\u53E3\u5951\u7EA6"]
      ),
      role(
        "role-builder",
        "Builder",
        "\u5F00\u53D1\u5DE5\u7A0B\u5E08",
        "\u4EA4\u4ED8\u53EF\u8FD0\u884C\u7684\u529F\u80FD\u5B9E\u73B0\u548C\u6D4B\u8BD5\u3002",
        ["\u5B9E\u73B0\u529F\u80FD", "\u4FEE\u590D\u7F3A\u9677", "\u8865\u6D4B\u8BD5", "\u7EF4\u62A4\u6784\u5EFA"]
      ),
      role(
        "role-verifier",
        "Verifier",
        "QA / \u9A8C\u6536",
        "\u72EC\u7ACB\u9A8C\u8BC1\u4EA7\u7269\uFF0C\u5B88\u4F4F\u8D28\u91CF\u95E8\u3002",
        ["\u8DD1\u6D4B\u8BD5", "\u590D\u73B0\u7F3A\u9677", "\u68C0\u67E5\u9A8C\u6536\u6807\u51C6", "\u8BB0\u5F55\u8BC1\u636E"],
        ["\u9A8C\u6536\u7ED3\u8BBA"]
      )
    ];
    const acceptance = (...texts) => texts.map((text, index) => ({
      id: `acc-demo-${String(index)}-${randomUUID().slice(0, 4)}`,
      text,
      done: false
    }));
    const task = (id, title, goal, status, priority, ownerRoleId, reviewerRoleId, items, branch = null) => ({
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
      updatedAt: at
    });
    const tasks = [
      task(
        "task-001",
        "\u786E\u5B9A\u9879\u76EE\u8303\u56F4\u4E0E\u9A8C\u6536\u6807\u51C6",
        "\u5199\u6E05\u695A\u8FD9\u4E00\u7248\u505A\u4EC0\u4E48\u3001\u4E0D\u505A\u4EC0\u4E48\uFF0C\u4EE5\u53CA\u53EF\u9A8C\u8BC1\u7684\u9A8C\u6536\u53E3\u5F84\u3002",
        "done",
        "P0",
        "role-lead",
        "role-architect",
        acceptance("\u8303\u56F4\u6587\u6863\u5DF2\u8BC4\u5BA1", "\u975E\u76EE\u6807\u6E05\u5355\u5DF2\u786E\u8BA4", "\u9A8C\u6536\u53E3\u5F84\u5DF2\u5BF9\u9F50").map(
          (item) => ({ ...item, done: true })
        )
      ),
      task(
        "task-002",
        "\u642D\u5EFA\u9879\u76EE\u9AA8\u67B6",
        "\u5EFA\u7ACB\u6700\u5C0F\u53EF\u8FD0\u884C\u7ED3\u6784\uFF0C\u5E76\u786E\u4FDD\u6D4B\u8BD5\u547D\u4EE4\u53EF\u4EE5\u6267\u884C\u3002",
        "review",
        "P0",
        "role-architect",
        "role-verifier",
        acceptance("\u7ED3\u6784\u53EF\u8FD0\u884C", "\u6D4B\u8BD5\u547D\u4EE4\u53EF\u6267\u884C", "\u6784\u5EFA\u53EF\u91CD\u590D").map(
          (item, index) => ({ ...item, done: index < 2 })
        ),
        "task/002-skeleton"
      ),
      task(
        "task-003",
        "\u5B9E\u73B0\u7B2C\u4E00\u4E2A\u529F\u80FD",
        "\u5B8C\u6210\u4E00\u6761\u53EF\u6F14\u793A\u7684\u529F\u80FD\u94FE\u8DEF\uFF0C\u5E76\u8865\u4E0A\u8FB9\u754C\u6D4B\u8BD5\u3002",
        "running",
        "P0",
        "role-builder",
        "role-architect",
        acceptance("\u529F\u80FD\u53EF\u6F14\u793A", "\u8FB9\u754C\u6709\u6D4B\u8BD5", "\u65E0\u963B\u65AD\u7F3A\u9677").map(
          (item, index) => ({ ...item, done: index === 0 })
        ),
        "task/003-first-feature"
      ),
      task(
        "task-004",
        "\u5EFA\u7ACB\u9A8C\u8BC1\u4E0E\u8BB0\u5F55\u57FA\u7EBF",
        "\u6BCF\u6B21\u5408\u5E76\u90FD\u80FD\u8DD1\u540C\u4E00\u5957\u9A8C\u8BC1\uFF0C\u5E76\u8BB0\u5F55\u7ED3\u679C\u3002",
        "ready",
        "P1",
        "role-verifier",
        "role-lead",
        acceptance("\u9A8C\u8BC1\u547D\u4EE4\u53EF\u91CD\u590D", "\u7ED3\u679C\u6709\u6301\u4E45\u5316\u8BB0\u5F55")
      ),
      task(
        "task-005",
        "\u9996\u8F6E\u9A8C\u6536\u95EE\u9898\u6E05\u5355",
        "\u6309\u9A8C\u6536\u6807\u51C6\u8D70\u4E00\u904D\uFF0C\u8BB0\u5F55\u963B\u65AD\u3001\u91CD\u8981\u548C\u5EFA\u8BAE\u95EE\u9898\u3002",
        "backlog",
        "P1",
        "role-lead",
        "role-verifier",
        acceptance("\u81F3\u5C11\u8D70\u5B8C 1 \u6761\u5B8C\u6574\u94FE\u8DEF", "\u95EE\u9898\u6309\u963B\u65AD/\u91CD\u8981/\u5EFA\u8BAE\u5206\u7EA7")
      )
    ];
    return {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      companyName: "AI\u5DE5\u4F5C\u5BA4",
      createdAt: at,
      updatedAt: at,
      activeProjectId: project.id,
      projects: [project],
      roles,
      modules: [],
      tasks,
      mergeProposals: [],
      runs: [],
      branches: tasks.filter((task2) => task2.branch !== null).map((task2) => ({
        id: `branch-${task2.id}`,
        projectId: task2.projectId,
        taskId: task2.id,
        name: task2.branch,
        goal: task2.goal,
        roleId: task2.ownerRoleId,
        contractKeys: [],
        status: task2.status === "review" ? "review" : "open",
        createdAt: task2.createdAt,
        updatedAt: task2.updatedAt
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
          payload: { message: "\u6F14\u793A\u9879\u76EE\u5DF2\u521B\u5EFA" }
        }
      ]
    };
  }
};
export {
  StudioStore,
  StudioStoreError,
  defaultStudioDataDir
};
