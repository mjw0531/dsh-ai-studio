import type {
  AgentReceipt,
  AgentRun,
  Branch,
  Decision,
  Module,
  Project,
  ProviderProfile,
  Role,
  StudioState,
  Task,
} from "../../shared/types.js";
import { StudioStoreError, newId, type StoreContext } from "./core.js";
import { findTask } from "./lookups.js";

export async function beginRun(
  ctx: StoreContext,
    taskId: string,
    prompt: string,
    workspace?: { path: string; branch: string; baseSha?: string },
    execution?: {
      providerProfileId: string | null;
      executor: AgentRun["executor"];
      provider: string | null;
      model: string | null;
    },
  ): Promise<AgentRun> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
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
      const today = ctx.now().slice(0, 10);
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

      const at = ctx.now();
      if (workspace !== undefined) {
        task.branch = workspace.branch;
      }
      const branch = ensureBranch(ctx, state, task, at);
      const run: AgentRun = {
        id: newId("run"),
        projectId: task.projectId,
        taskId: task.id,
        roleId: role.id,
        providerProfileId:
          execution?.providerProfileId ?? role.providerProfileId,
        executor: execution?.executor ?? role.executor ?? "dsh",
        provider: execution?.provider ?? null,
        branchId: branch.id,
        branchName: workspace?.branch ?? null,
        workspacePath: workspace?.path ?? null,
        commitSha: null,
        baseSha: workspace?.baseSha ?? null,
        agentPreset: null,
        approvalPolicy: null,
        sandboxMode: null,
        restrictedTools: [],
        diffPatch: null,
        diffStat: null,
        sessionId: null,
        status: "queued",
        model: execution?.model ?? role.model,
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
      ctx.recordEvent(state, {
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
      await ctx.save();
      return structuredClone(run);
    });
  }

export async function attachRunSession(
  ctx: StoreContext,
    runId: string,
    sessionId: string,
    model?: string,
  ): Promise<void> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) return;
      run.sessionId = sessionId;
      if (model !== undefined) run.model = model;
      run.status = "running";
      await ctx.save();
    });
  }

export async function completeRun(
  ctx: StoreContext,
    runId: string,
    input: {
      output: string;
      receipt: AgentReceipt | null;
      tokens: number | null;
      diffStat?: string | null;
      diffPatch?: string | null;
      commitSha?: string | null;
    },
  ): Promise<AgentRun> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) {
        throw new StudioStoreError("run_not_found", "Agent Run 不存在", 404);
      }
      const at = ctx.now();
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
          escalateRepeatedFailure(ctx, 
            state,
            task,
            at,
            run.error,
            run,
          );
        }
        state.updatedAt = at;
        ctx.recordEvent(state, {
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
        await ctx.save();
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
      if (input.diffPatch !== undefined) {
        run.diffPatch = input.diffPatch;
      }
      if (input.commitSha !== undefined) {
        run.commitSha = input.commitSha;
      }
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
          branch = ensureBranch(ctx, state, task, at);
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
              ctx.recordEvent(state, {
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
            ctx.recordEvent(state, {
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
          ctx.recordEvent(state, {
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
      ctx.recordEvent(state, {
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
      await ctx.save();
      return structuredClone(run);
    });
  }

export async function failRun(
  ctx: StoreContext,runId: string, error: string): Promise<AgentRun> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) {
        throw new StudioStoreError("run_not_found", "Agent Run 不存在", 404);
      }
      const at = ctx.now();
      run.status = "failed";
      run.error = error.slice(0, 4000);
      run.endedAt = at;
      const task = state.tasks.find((item) => item.id === run.taskId);
      if (task !== undefined && task.status === "running") {
        task.status = "ready";
        task.updatedAt = at;
      }
      if (task !== undefined) {
        escalateRepeatedFailure(ctx, state, task, at, run.error, run);
      }
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "agent.failed",
        at,
        projectId: run.projectId,
        taskId: run.taskId,
        payload: { runId: run.id, error: run.error },
      });
      await ctx.save();
      return structuredClone(run);
    });
  }

  /**
   * Enforces the module contract boundary after a code run. Changing the
   * contract file or a forbidden path blocks the task and escalates a decision;
   * it never silently rewrites the Agent's worktree.
   */
export async function enforceContractScope(
  ctx: StoreContext,
    taskId: string,
    runId: string,
    changedFiles: string[],
  ): Promise<string[]> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
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
      const at = ctx.now();
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
      ctx.recordEvent(state, {
        type: "contract.violated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { runId, module: module.name, violations },
      });
      await ctx.save();
      return violations;
    });
  }


export function escalateRepeatedFailure(
  ctx: StoreContext,
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
          requirementRefs: task.requirementRefs,
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
        ctx.recordEvent(state, {
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
    ctx.recordEvent(state, {
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

export function ensureBranch(
  ctx: StoreContext,
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


export async function getDispatchContext(
  ctx: StoreContext,taskId: string): Promise<{
    task: Task;
    role: Role;
    project: Project;
    module: Module | null;
    providerProfile: ProviderProfile | null;
  }> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
      if (
        task.kind === "fix" &&
        !task.integration &&
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
      if (project.repoPath !== null && project.stage !== "development") {
        throw new StudioStoreError(
          "stage_gate_required",
          "项目尚未通过阶段门禁；完成架构/Demo 确认并进入持续开发后才能派单",
          409,
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
      const providerProfile =
        role.providerProfileId === null
          ? null
          : (state.providerProfiles.find(
              (profile) =>
                profile.id === role.providerProfileId &&
                profile.projectId === project.id,
            ) ?? null);
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        module: module === undefined ? null : structuredClone(module),
        providerProfile:
          providerProfile === null ? null : structuredClone(providerProfile),
      };
    });
  }


export async function recordRunRuntime(
  ctx: StoreContext,
  runId: string,
  runtime: {
    agentPreset: string;
    approvalPolicy: "ask" | "never";
    sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
    restrictedTools: string[];
  },
): Promise<void> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const run = state.runs.find((item) => item.id === runId);
    if (run === undefined) return;
    run.agentPreset = runtime.agentPreset;
    run.approvalPolicy = runtime.approvalPolicy;
    run.sandboxMode = runtime.sandboxMode;
    run.restrictedTools = [...runtime.restrictedTools];
    await ctx.save();
  });
}
