import type {
  CreateDecisionInput,
  DecideDecisionInput,
  Decision,
  Project,
} from "../../shared/types.js";
import { newId, StudioStoreError, type StoreContext } from "./core.js";
import { optionalText, requiredText } from "./inputs.js";
import { findTask, pickProject } from "./lookups.js";

export async function getDecisionAdrContext(
  ctx: StoreContext,decisionId: string): Promise<{
    decision: Decision;
    project: Project;
  }> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
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

export async function setDecisionAdrPath(
  ctx: StoreContext,
    decisionId: string,
    adrPath: string,
  ): Promise<Decision> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
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
      const at = ctx.now();
      decision.adrPath = adrPath;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "decision.adr_written",
        at,
        projectId: decision.projectId,
        taskId: decision.taskId,
        payload: { decisionId, adrPath },
      });
      await ctx.save();
      return structuredClone(decision);
    });
  }

export async function createPostMergeDecision(
  ctx: StoreContext,input: {
    taskId: string;
    proposalId: string;
    mergeCommit: string;
    command: string;
    exitCode: number;
    output: string;
  }): Promise<Decision | null> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, input.taskId);
      const title = `合并后回归失败：${task.title.slice(0, 140)}`;
      if (
        state.decisions.some(
          (item) => item.taskId === task.id && item.title === title,
        )
      ) {
        return null;
      }
      const at = ctx.now();
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
      ctx.recordEvent(state, {
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
      await ctx.save();
      return structuredClone(decision);
    });
  }

export async function createDecision(
  ctx: StoreContext,input: CreateDecisionInput): Promise<Decision> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      let taskId: string | null = null;
      if (input.taskId !== undefined && input.taskId !== null) {
        const task = findTask(state, input.taskId);
        if (task.projectId !== project.id) {
          throw new StudioStoreError(
            "task_not_found",
            "任务不属于当前项目",
            404,
          );
        }
        taskId = task.id;
      }
      const at = ctx.now();
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
      ctx.recordEvent(state, {
        type: "decision.created",
        at,
        projectId: project.id,
        taskId,
        payload: { decisionId: decision.id, title: decision.title },
      });
      await ctx.save();
      return structuredClone(decision);
    });
  }

export async function decideDecision(
  ctx: StoreContext,
    decisionId: string,
    input: DecideDecisionInput,
  ): Promise<Decision> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
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
      const at = ctx.now();
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
      ctx.recordEvent(state, {
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
      await ctx.save();
      return structuredClone(decision);
    });
  }

