// src/host/workspace.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
var WorkspaceError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const detail = error instanceof Error && "stderr" in error ? String(error.stderr ?? "") : String(error);
    throw new WorkspaceError(
      "git_failed",
      `git ${args.join(" ")} \u5931\u8D25\uFF1A${detail.slice(0, 800)}`
    );
  }
}
function sanitize(taskId) {
  return taskId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
}
var WorkspaceManager = class {
  async prepare(repoPath, taskId) {
    const resolved = path.resolve(repoPath);
    if (!existsSync(resolved)) {
      throw new WorkspaceError(
        "repo_missing",
        `\u9879\u76EE\u4ED3\u5E93\u4E0D\u5B58\u5728\uFF1A${resolved}`
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
  diffStat(worktreePath) {
    if (!existsSync(worktreePath)) return "";
    const status = git(worktreePath, ["status", "--short"]);
    const stat = git(worktreePath, ["diff", "--stat"]);
    return [status, stat].filter((line) => line !== "").join("\n").trim();
  }
};
export {
  WorkspaceError,
  WorkspaceManager
};
