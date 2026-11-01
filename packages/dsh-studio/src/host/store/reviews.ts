import type {
  AgentRun,
  IndependentReview,
  Project,
  ProviderProfile,
  Role,
  Task,
  Verification,
} from "../../shared/types.js";
import { StudioStoreError } from "./errors.js";
import { requiredText, textList } from "./inputs.js";
import { newId } from "./ids.js";
import { findTask } from "./lookups.js";
import type { StoreContext } from "./context.js";

export async function getReviewContext(
  ctx: StoreContext,taskId: string): Promise<{
    task: Task;
    role: Role;
    project: Project;
    run: AgentRun | null;
    verification: Verification | null;
    providerProfile: ProviderProfile | null;
  }> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
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
        run: run === undefined ? null : structuredClone(run),
        verification:
          verification === undefined
            ? null
            : structuredClone(verification),
        providerProfile:
          providerProfile === null ? null : structuredClone(providerProfile),
      };
    });
  }

export async function recordReview(
  ctx: StoreContext,
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
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
      const at = ctx.now();
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
      ctx.recordEvent(state, {
        type:
          review.verdict === "pass"
            ? "review.passed"
            : "review.failed",
        at,
        projectId: task.projectId,
        taskId,
        payload: { reviewId: review.id, model: review.model },
      });
      await ctx.save();
      return structuredClone(review);
    });
  }

export async function getTaskVerificationContext(
  ctx: StoreContext,taskId: string): Promise<{
    task: Task;
    run: AgentRun | null;
  }> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
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

export async function recordVerification(
  ctx: StoreContext,
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
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const task = findTask(state, taskId);
      const at = ctx.now();
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
      ctx.recordEvent(state, {
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
      await ctx.save();
      return structuredClone(verification);
    });
  }

