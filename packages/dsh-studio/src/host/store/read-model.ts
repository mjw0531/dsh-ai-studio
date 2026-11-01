import type {
  AgentRun,
  CompanyBudget,
  CompanyHealth,
  CompanyPriority,
  CompanyProjectSummary,
  CompanyRisk,
  CompanySummary,
  CompanyTotals,
  MergeProposal,
  OwnerNeed,
  ProviderProfile,
  ProviderProfileHealth,
  RoleCoverage,
  RoleLoadSummary,
  StudioState,
  StudioStats,
  Task,
  TaskPriority,
} from "../../shared/types.js";

export function statsFor(
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
function providerFailureReason(
  error: string | null,
): ProviderProfileHealth["failuresByReason"][number]["reason"] {
  const value = (error ?? "").toLowerCase();
  if (value === "") return "unknown";
  if (/receipt|回执|evidence|summary/.test(value)) return "receipt";
  if (/timeout|超时|timed out/.test(value)) return "timeout";
  if (/provider|模型|model|api key|auth|unauthorized|rate limit|quota|配额/.test(value)) {
    return "provider";
  }
  return "task";
}

export function buildProviderHealth(
  state: StudioState,
  projectId: string,
): ProviderProfileHealth[] {
  const profiles = state.providerProfiles.filter(
    (profile) => profile.projectId === projectId,
  );
  const health = profiles.map((profile) => {
    const roleIds = new Set(
      state.roles
        .filter(
          (role) =>
            role.projectId === projectId &&
            role.providerProfileId === profile.id,
        )
        .map((role) => role.id),
    );
    const runs = state.runs
      .filter(
        (run) =>
          run.projectId === projectId &&
          (run.providerProfileId === profile.id ||
            (run.providerProfileId === null &&
              run.roleId !== null &&
              roleIds.has(run.roleId))),
      )
      .sort((left, right) =>
        (left.endedAt ?? left.startedAt).localeCompare(
          right.endedAt ?? right.startedAt,
        ),
      );
    const successCount = runs.filter(
      (run) => run.status === "succeeded",
    ).length;
    const failCount = runs.filter((run) => run.status === "failed").length;
    const last = runs[runs.length - 1];
    const lastError =
      last?.status === "failed" && last.error !== null
        ? last.error
        : ([...runs].reverse().find((run) => run.error !== null)?.error ??
          null);
    const failures = new Map<
      ProviderProfileHealth["failuresByReason"][number]["reason"],
      number
    >();
    for (const run of runs) {
      if (run.status !== "failed") continue;
      const reason = providerFailureReason(run.error);
      failures.set(reason, (failures.get(reason) ?? 0) + 1);
    }
    return {
      profileId: profile.id,
      runCount: runs.length,
      successCount,
      failCount,
      failureRate:
        runs.length === 0
          ? 0
          : Math.round((failCount / runs.length) * 100) / 100,
      failuresByReason: [...failures.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count),
      recentRuns: runs.slice(-5).map((run) => ({
        id: run.id,
        status: run.status,
        model: run.model,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        errorPreview:
          run.error === null ? null : run.error.slice(0, 160),
      })),
      suggestedProfileId: null as string | null,
      tokens: runs.reduce((sum, run) => sum + (run.tokens ?? 0), 0),
      lastRunAt:
        last === undefined ? null : (last.endedAt ?? last.startedAt),
      lastError,
      state:
        runs.length === 0
          ? "unknown"
          : last?.status === "failed"
            ? "degraded"
            : "healthy",
    } satisfies ProviderProfileHealth;
  });

  for (const current of health) {
    if (current.state !== "degraded") continue;
    const candidate = health.find(
      (item) =>
        item.profileId !== current.profileId &&
        item.state === "healthy" &&
        item.runCount > 0,
    );
    current.suggestedProfileId = candidate?.profileId ?? null;
  }
  return health;
}

export function buildCompany(state: StudioState, now: Date): CompanySummary {
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
  const budget: CompanyBudget = {
    totalBudget: null,
    totalSpent: 0,
    overBudgetProjects: 0,
    unbudgetedProjects: 0,
  };
  const priorities: CompanyPriority[] = [];
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
    const projectSpent = projectRuns.reduce(
      (sum, run) => sum + (run.tokens ?? 0),
      0,
    );
    totals.tokensUsed += projectSpent;
    if (project.tokenBudget === null) {
      budget.unbudgetedProjects += 1;
    } else {
      budget.totalBudget = (budget.totalBudget ?? 0) + project.tokenBudget;
      if (projectSpent > project.tokenBudget) {
        budget.overBudgetProjects += 1;
      }
    }
    for (const task of openTasks) {
      const role = task.ownerRoleId === null
        ? null
        : roleById.get(task.ownerRoleId);
      priorities.push({
        taskId: task.id,
        projectId: project.id,
        projectName: project.name,
        title: task.title,
        priority: task.priority,
        status: task.status,
        ownerName: role?.name ?? "未分配",
        ageHours: hoursSince(task.updatedAt, now),
      });
    }
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

  budget.totalSpent = totals.tokensUsed;
  priorities.sort((left, right) => {
    const rank = (priority: TaskPriority): number =>
      priority === "P0" ? 0 : priority === "P1" ? 1 : 2;
    return (
      rank(left.priority) - rank(right.priority) ||
      (right.ageHours ?? 0) - (left.ageHours ?? 0)
    );
  });
  const coverage = new Map<
    string,
    { projects: Set<string>; activeTasks: number }
  >();
  for (const role of state.roles) {
    const key = role.name.toLowerCase();
    const entry = coverage.get(key) ?? {
      projects: new Set<string>(),
      activeTasks: 0,
    };
    entry.projects.add(role.projectId);
    entry.activeTasks += state.tasks.filter(
      (task) =>
        task.ownerRoleId === role.id &&
        (task.status === "running" || task.status === "review"),
    ).length;
    coverage.set(key, entry);
  }
  const roleCoverage: RoleCoverage[] = [...coverage.entries()]
    .map(([key, value]) => ({
      roleName:
        state.roles.find((role) => role.name.toLowerCase() === key)?.name ??
        key,
      projects: value.projects.size,
      activeTasks: value.activeTasks,
    }))
    .sort((left, right) => right.activeTasks - left.activeTasks)
    .slice(0, 12);
  return {
    name: state.companyName,
    totals,
    projects,
    needs: needs.slice(0, 30),
    roles,
    budget,
    priorities: priorities.slice(0, 12),
    roleCoverage,
    risk,
    recentEvents: [...state.events].slice(-20).reverse(),
    generatedAt: now.toISOString(),
  };
}

