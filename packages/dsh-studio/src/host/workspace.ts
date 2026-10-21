import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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

function sanitize(taskId: string): string {
  return taskId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
}

/**
 * Creates one git worktree per task inside the project repository.
 *
 * v0.6 uses a local branch `studio/<taskId>` and `.worktrees/<taskId>`. It never
 * touches the main worktree and never merges.
 */
export class WorkspaceManager {
  async prepare(repoPath: string, taskId: string): Promise<TaskWorkspace> {
    const resolved = path.resolve(repoPath);
    if (!existsSync(resolved)) {
      throw new WorkspaceError(
        "repo_missing",
        `项目仓库不存在：${resolved}`,
      );
    }
    const root = git(resolved, ["rev-parse", "--show-toplevel"]);
    const worktreeRoot = path.join(root, ".worktrees");
    const worktreePath = path.join(worktreeRoot, sanitize(taskId));
    const branch = `studio/${sanitize(taskId)}`;
    await mkdir(worktreeRoot, { recursive: true });

    if (existsSync(worktreePath)) {
      return { repoPath: root, path: worktreePath, branch };
    }

    const branches = git(root, ["branch", "--list", branch]);
    if (branches === "") {
      git(root, ["worktree", "add", "-b", branch, worktreePath, "HEAD"]);
    } else {
      git(root, ["worktree", "add", worktreePath, branch]);
    }
    return { repoPath: root, path: worktreePath, branch };
  }

  diffStat(worktreePath: string): string {
    if (!existsSync(worktreePath)) return "";
    const status = git(worktreePath, ["status", "--short"]);
    const stat = git(worktreePath, ["diff", "--stat"]);
    return [status, stat].filter((line) => line !== "").join("\n").trim();
  }
}
