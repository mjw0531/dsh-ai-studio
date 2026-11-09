import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export class WorkspaceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface TaskWorkspace {
  repoPath: string;
  path: string;
  branch: string;
  baseSha: string;
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : String(error);
    throw new WorkspaceError(
      "git_failed",
      `git ${args.join(" ")} 失败：${detail.slice(0, 800)}`,
    );
  }
}

function repoKey(repoPath: string): string {
  return createHash("sha1").update(path.resolve(repoPath).toLowerCase()).digest("hex").slice(0, 12);
}

function sanitize(taskId: string): string {
  if (
    taskId.trim() === "" ||
    taskId === "." ||
    taskId === ".." ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(taskId)
  ) {
    throw new WorkspaceError(
      "invalid_task_id",
      `taskId 不能作为目录名：${JSON.stringify(taskId)}`,
    );
  }
  return taskId;
}

/**
 * Creates one git worktree per task inside the project repository.
 *
 * v0.6 uses a local branch `studio/<taskId>` and `.worktrees/<taskId>`. It never
 * touches the main worktree and never merges.
 */
export class WorkspaceManager {
  private readonly rootOverride: string | null;

  constructor(rootOverride = process.env.DSH_STUDIO_WORKTREE_ROOT?.trim() ?? "") {
    this.rootOverride = rootOverride === "" ? null : path.resolve(rootOverride);
  }

  async prepare(repoPath: string, taskId: string): Promise<TaskWorkspace> {
    const resolved = path.resolve(repoPath);
    if (!existsSync(resolved)) {
      throw new WorkspaceError(
        "repo_missing",
        `项目仓库不存在：${resolved}`,
      );
    }
    const root = git(resolved, ["rev-parse", "--show-toplevel"]);
    const baseSha = git(root, ["rev-parse", "HEAD"]);
    const key = sanitize(taskId);
    const worktreeRoot =
      this.rootOverride === null
        ? path.join(root, ".worktrees")
        : path.join(this.rootOverride, repoKey(root));
    const worktreePath = path.resolve(worktreeRoot, key);
    if (!worktreePath.startsWith(`${path.resolve(worktreeRoot)}${path.sep}`)) {
      throw new WorkspaceError(
        "invalid_worktree_path",
        "worktree 路径越出 .worktrees 目录",
      );
    }
    const branch = `studio/${key}`;
    await mkdir(worktreeRoot, { recursive: true });

    if (existsSync(worktreePath)) {
      const current = git(worktreePath, ["branch", "--show-current"]);
      if (current !== branch) {
        throw new WorkspaceError(
          "worktree_branch_mismatch",
          `worktree 已存在但分支是「${current}」，期望「${branch}」`,
        );
      }
      return { repoPath: root, path: worktreePath, branch, baseSha };
    }

    const branches = git(root, ["branch", "--list", branch]);
    if (branches === "") {
      const remote = git(root, [
        "branch",
        "-r",
        "--list",
        `origin/${branch}`,
      ]);
      git(root, [
        "worktree",
        "add",
        "-b",
        branch,
        worktreePath,
        remote === "" ? "HEAD" : `origin/${branch}`,
      ]);
    } else {
      git(root, ["worktree", "add", worktreePath, branch]);
    }
    return { repoPath: root, path: worktreePath, branch, baseSha };
  }

  commit(worktreePath: string, message: string): string | null {
    if (!existsSync(worktreePath)) return null;
    const status = git(worktreePath, ["status", "--short"]);
    if (status === "") return null;
    git(worktreePath, ["add", "-A"]);
    git(worktreePath, [
      "-c",
      "user.name=Studio Agent",
      "-c",
      "user.email=agent@studio.local",
      "commit",
      "-m",
      message,
    ]);
    return git(worktreePath, ["rev-parse", "HEAD"]);
  }

  diffStat(worktreePath: string, baseSha?: string): string {
    if (!existsSync(worktreePath)) return "";
    const status = git(worktreePath, ["status", "--short"]);
    const stat = git(worktreePath, ["diff", "--stat"]);
    const committed =
      baseSha === undefined
        ? ""
        : git(worktreePath, ["diff", "--stat", `${baseSha}...HEAD`]);
    return [status, stat, committed]
      .filter((line) => line !== "")
      .join("\n")
      .trim();
  }

  changedFiles(worktreePath: string, baseSha?: string): string[] {
    if (!existsSync(worktreePath)) return [];
    const working = git(worktreePath, ["status", "--porcelain"])
      .split("\n")
      .map((line) => line.slice(3).trim())
      .map((line) => (line.includes(" -> ") ? line.split(" -> ").pop() ?? line : line))
      .filter(Boolean);
    const committed =
      baseSha === undefined
        ? []
        : git(worktreePath, ["diff", "--name-only", `${baseSha}...HEAD`])
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
    return [...new Set([...working, ...committed])];
  }

  patch(
    worktreePath: string,
    baseSha: string,
    includeWorkingTree = false,
  ): string {
    if (!existsSync(worktreePath)) return "";
    const range = includeWorkingTree ? baseSha : `${baseSha}...HEAD`;
    return git(worktreePath, ["diff", "--no-color", range]);
  }
}
