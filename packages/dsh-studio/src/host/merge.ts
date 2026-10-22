import { execFile } from "node:child_process";

import type { MergeProposal } from "../shared/types.js";
import type { StudioStore } from "./store.js";
import { StudioStoreError } from "./store.js";
import { runVerificationCommand } from "./verify.js";

interface GitFailure {
  code?: number | string;
  stdout?: string;
  stderr?: string;
  message?: string;
}

function git(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          const failure = error as GitFailure;
          reject(
            new StudioStoreError(
              "git_failed",
              [
                `git ${args.join(" ")} 失败`,
                (failure.stderr ?? stderr ?? "").trim(),
                (failure.stdout ?? stdout ?? "").trim(),
              ]
                .filter(Boolean)
                .join("："),
              409,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * Human-triggered Git merge.
 *
 * The proposal must already be approved. The repository must be on the proposal
 * base branch, clean, and have the task branch. We never switch branches and
 * never push. A conflict aborts the merge and leaves the repo as it was.
 */
export class GitMergeService {
  private readonly store: StudioStore;

  constructor(store: StudioStore) {
    this.store = store;
  }

  async rollback(proposalId: string): Promise<MergeProposal> {
    const { proposal, project, verification } =
      await this.store.getMergeContext(proposalId);
    if (
      proposal.status !== "merged" ||
      proposal.mergeCommit === null
    ) {
      throw new StudioStoreError(
        "rollback_not_merged",
        "只有已合并的提案可以回滚",
        409,
      );
    }
    if (verification === null || verification.passed) {
      throw new StudioStoreError(
        "rollback_not_failed",
        "只有合并后回归失败时才允许回滚",
        409,
      );
    }
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "项目还没有绑定代码仓库",
        409,
      );
    }
    const repo = project.repoPath;
    const current = (
      await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])
    ).stdout.trim();
    if (current !== proposal.base) {
      throw new StudioStoreError(
        "rollback_wrong_branch",
        `当前分支是「${current}」，请先切到基础分支「${proposal.base}」`,
        409,
      );
    }
    const dirty = (await git(repo, ["status", "--porcelain"])).stdout.trim();
    if (dirty !== "") {
      throw new StudioStoreError(
        "rollback_dirty",
        "工作区不干净；请先提交或清理改动再回滚",
        409,
      );
    }
    try {
      await git(repo, [
        "revert",
        "-m",
        "1",
        "--no-edit",
        proposal.mergeCommit,
      ]);
    } catch (error) {
      try {
        await git(repo, ["revert", "--abort"]);
      } catch {
        // best effort
      }
      throw error;
    }
    const commit = (
      await git(repo, ["rev-parse", "HEAD"])
    ).stdout.trim();
    return this.store.recordRollback(proposalId, commit);
  }

  async execute(proposalId: string): Promise<MergeProposal> {
    const { proposal, project, task } =
      await this.store.getMergeContext(proposalId);
    if (proposal.status !== "approved") {
      throw new StudioStoreError(
        "merge_not_approved",
        "只有已批准的合并提案可以执行 Git 合并",
        409,
      );
    }
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "项目还没有绑定代码仓库",
        409,
      );
    }
    const repo = project.repoPath;
    try {
      await git(repo, ["config", "--get", "user.name"]);
      await git(repo, ["config", "--get", "user.email"]);
    } catch {
      throw new StudioStoreError(
        "git_identity_required",
        "仓库还没有配置 git user.name / user.email，无法创建 merge commit",
        409,
      );
    }
    const current = (
      await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])
    ).stdout.trim();
    if (current !== proposal.base) {
      throw new StudioStoreError(
        "merge_wrong_branch",
        `当前分支是「${current}」，请先切到基础分支「${proposal.base}」再执行合并`,
        409,
      );
    }
    const dirty = (await git(repo, ["status", "--porcelain"])).stdout.trim();
    if (dirty !== "") {
      throw new StudioStoreError(
        "merge_dirty",
        "工作区不干净；请先提交或清理改动再合并",
        409,
      );
    }
    try {
      await git(repo, ["rev-parse", "--verify", proposal.branch]);
    } catch {
      throw new StudioStoreError(
        "merge_branch_missing",
        `找不到任务分支「${proposal.branch}」`,
        409,
      );
    }
    const inProgress = await git(repo, [
      "rev-parse",
      "-q",
      "--verify",
      "MERGE_HEAD",
    ]).then(
      () => true,
      () => false,
    );
    if (inProgress) {
      throw new StudioStoreError(
        "merge_in_progress",
        "仓库里已有未完成的合并；请先处理或 abort",
        409,
      );
    }
    try {
      await git(repo, [
        "merge",
        "--no-ff",
        proposal.branch,
        "-m",
        `Merge ${proposal.branch} into ${proposal.base} (Studio ${proposal.id})`,
      ]);
    } catch (error) {
      try {
        await git(repo, ["merge", "--abort"]);
      } catch {
        // best effort; original error is more useful
      }
      throw error;
    }
    const commit = (
      await git(repo, ["rev-parse", "HEAD"])
    ).stdout.trim();
    const merged = await this.store.completeMergeProposal(
      proposalId,
      commit,
    );
    const command = task.verifyCommand?.trim() || "npm test";
    const result = await runVerificationCommand(command, repo);
    const verification = await this.store.recordVerification(task.id, {
      command,
      workdir: repo,
      exitCode: result.exitCode,
      output: result.output,
      passed: result.exitCode === 0,
      runId: null,
    });
    if (!verification.passed) {
      await this.store.createPostMergeDecision({
        taskId: task.id,
        proposalId: merged.id,
        mergeCommit: commit,
        command,
        exitCode: result.exitCode,
        output: result.output,
      });
    }
    return this.store.setMergePostVerification(
      merged.id,
      verification.id,
    );
  }
}
