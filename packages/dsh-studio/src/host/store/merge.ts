import { MERGE_STATUS_LABELS } from "../../shared/types.js";
import { StudioStoreError, newId, type StoreContext } from "./core.js";
import { isMergeRisk } from "./validation.js";
import type {
  CreateMergeProposalInput,
  MergeProposal,
  Project,
  Task,
  Verification,
} from "../../shared/types.js";
import { optionalText, requiredText } from "./inputs.js";
import { findMergeProposal, findTask } from "./lookups.js";

export async function createMergeProposal(
  ctx: StoreContext,
    taskId: string,
    input: CreateMergeProposalInput,
  ): Promise<MergeProposal> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
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
      const at = ctx.now();
      const latestRun = [...state.runs]
        .filter((run) => run.taskId === task.id)
        .sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        )[0];
      const latestCodeRun = [...state.runs]
        .filter(
          (run) => run.taskId === task.id && run.workspacePath !== null,
        )
        .sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        )[0];
      const latestVerification = [...state.verifications]
        .filter((verification) => verification.taskId === task.id)
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        )[0];
      const latestReview = [...state.reviews]
        .filter((review) => review.taskId === task.id)
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        )[0];
      const boundRun =
        latestCodeRun?.commitSha === null ||
        latestCodeRun?.commitSha === undefined
          ? null
          : latestCodeRun;
      if (boundRun !== null) {
        if (
          latestVerification === undefined ||
          latestVerification.runId !== boundRun.id
        ) {
          throw new StudioStoreError(
            "verification_stale",
            "最新验证不属于当前提交，请重新运行 Host 验证",
            409,
          );
        }
        if (latestReview === undefined || latestReview.runId !== boundRun.id) {
          throw new StudioStoreError(
            "review_stale",
            "最新评审不属于当前提交，请重新评审",
            409,
          );
        }
      }
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
        sourceCommit: boundRun?.commitSha ?? null,
        baseCommit: boundRun?.baseSha ?? null,
        verificationId: latestVerification?.id ?? null,
        verificationRunId: boundRun === null
          ? null
          : (latestVerification?.runId ?? null),
        reviewId: boundRun === null ? null : (latestReview?.id ?? null),
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
      ctx.recordEvent(state, {
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
      await ctx.save();
      return structuredClone(proposal);
    });
  }

export async function approveMergeProposal(
  ctx: StoreContext,
    proposalId: string,
    note?: string,
  ): Promise<MergeProposal> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const proposal = findMergeProposal(state, proposalId);
      if (proposal.status !== "review") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `只有待评审的合并提案可以批准；当前是「${MERGE_STATUS_LABELS[proposal.status]}」`,
          409,
        );
      }
      const at = ctx.now();
      proposal.status = "approved";
      proposal.reviewNote = optionalText(note, "note", 1000);
      proposal.decidedAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "merge.approved",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: { proposalId: proposal.id, note: proposal.reviewNote },
      });
      await ctx.save();
      return structuredClone(proposal);
    });
  }

export async function rejectMergeProposal(
  ctx: StoreContext,
    proposalId: string,
    note: string,
  ): Promise<MergeProposal> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const proposal = findMergeProposal(state, proposalId);
      if (proposal.status !== "review") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `只有待评审的合并提案可以打回；当前是「${MERGE_STATUS_LABELS[proposal.status]}」`,
          409,
        );
      }
      const at = ctx.now();
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
        ctx.recordEvent(state, {
          type: "task.reopened",
          at,
          projectId: task.projectId,
          taskId: task.id,
          payload: { reason: "merge_rejected", proposalId: proposal.id },
        });
      }
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "merge.rejected",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: { proposalId: proposal.id, note: proposal.reviewNote },
      });
      await ctx.save();
      return structuredClone(proposal);
    });
  }

export async function getMergeContext(
  ctx: StoreContext,proposalId: string): Promise<{
    proposal: MergeProposal;
    project: Project;
    task: Task;
    verification: Verification | null;
  }> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const proposal = findMergeProposal(state, proposalId);
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

export async function completeMergeProposal(
  ctx: StoreContext,
    proposalId: string,
    mergeCommit?: string,
  ): Promise<MergeProposal> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const proposal = findMergeProposal(state, proposalId);
      if (proposal.status !== "approved") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `只有已批准的合并提案可以标记合并；当前是「${MERGE_STATUS_LABELS[proposal.status]}」`,
          409,
        );
      }
      const at = ctx.now();
      proposal.status = "merged";
      proposal.mergeCommit =
        optionalText(mergeCommit, "mergeCommit", 160) || null;
      proposal.mergedAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "merge.merged",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: {
          proposalId: proposal.id,
          mergeCommit: proposal.mergeCommit,
        },
      });
      await ctx.save();
      return structuredClone(proposal);
    });
  }

export async function setMergePostVerification(
  ctx: StoreContext,
    proposalId: string,
    verificationId: string,
  ): Promise<MergeProposal> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const proposal = findMergeProposal(state, proposalId);
      proposal.postMergeVerificationId = verificationId;
      proposal.updatedAt = ctx.now();
      state.updatedAt = proposal.updatedAt;
      await ctx.save();
      return structuredClone(proposal);
    });
  }

export async function recordRollback(
  ctx: StoreContext,
    proposalId: string,
    rollbackCommit: string,
  ): Promise<MergeProposal> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const proposal = findMergeProposal(state, proposalId);
      if (proposal.status !== "merged") {
        throw new StudioStoreError(
          "rollback_not_merged",
          "只有已合并的提案可以回滚",
          409,
        );
      }
      const at = ctx.now();
      proposal.rollbackCommit = requiredText(
        rollbackCommit,
        "rollbackCommit",
        160,
      );
      proposal.rolledBackAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
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
      await ctx.save();
      return structuredClone(proposal);
    });
  }

