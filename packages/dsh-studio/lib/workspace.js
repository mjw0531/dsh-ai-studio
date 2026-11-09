// src/host/workspace.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
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
function repoKey(repoPath) {
  return createHash("sha1").update(path.resolve(repoPath).toLowerCase()).digest("hex").slice(0, 12);
}
function sanitize(taskId) {
  if (taskId.trim() === "" || taskId === "." || taskId === ".." || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(taskId)) {
    throw new WorkspaceError(
      "invalid_task_id",
      `taskId \u4E0D\u80FD\u4F5C\u4E3A\u76EE\u5F55\u540D\uFF1A${JSON.stringify(taskId)}`
    );
  }
  return taskId;
}
var WorkspaceManager = class {
  rootOverride;
  constructor(rootOverride = process.env.DSH_STUDIO_WORKTREE_ROOT?.trim() ?? "") {
    this.rootOverride = rootOverride === "" ? null : path.resolve(rootOverride);
  }
  async prepare(repoPath, taskId) {
    const resolved = path.resolve(repoPath);
    if (!existsSync(resolved)) {
      throw new WorkspaceError(
        "repo_missing",
        `\u9879\u76EE\u4ED3\u5E93\u4E0D\u5B58\u5728\uFF1A${resolved}`
      );
    }
    const root = git(resolved, ["rev-parse", "--show-toplevel"]);
    const baseSha = git(root, ["rev-parse", "HEAD"]);
    const key = sanitize(taskId);
    const worktreeRoot = this.rootOverride === null ? path.join(root, ".worktrees") : path.join(this.rootOverride, repoKey(root));
    const worktreePath = path.resolve(worktreeRoot, key);
    if (!worktreePath.startsWith(`${path.resolve(worktreeRoot)}${path.sep}`)) {
      throw new WorkspaceError(
        "invalid_worktree_path",
        "worktree \u8DEF\u5F84\u8D8A\u51FA .worktrees \u76EE\u5F55"
      );
    }
    const branch = `studio/${key}`;
    await mkdir(worktreeRoot, { recursive: true });
    if (existsSync(worktreePath)) {
      const current = git(worktreePath, ["branch", "--show-current"]);
      if (current !== branch) {
        throw new WorkspaceError(
          "worktree_branch_mismatch",
          `worktree \u5DF2\u5B58\u5728\u4F46\u5206\u652F\u662F\u300C${current}\u300D\uFF0C\u671F\u671B\u300C${branch}\u300D`
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
        `origin/${branch}`
      ]);
      git(root, [
        "worktree",
        "add",
        "-b",
        branch,
        worktreePath,
        remote === "" ? "HEAD" : `origin/${branch}`
      ]);
    } else {
      git(root, ["worktree", "add", worktreePath, branch]);
    }
    return { repoPath: root, path: worktreePath, branch, baseSha };
  }
  commit(worktreePath, message) {
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
      message
    ]);
    return git(worktreePath, ["rev-parse", "HEAD"]);
  }
  diffStat(worktreePath, baseSha) {
    if (!existsSync(worktreePath)) return "";
    const status = git(worktreePath, ["status", "--short"]);
    const stat = git(worktreePath, ["diff", "--stat"]);
    const committed = baseSha === void 0 ? "" : git(worktreePath, ["diff", "--stat", `${baseSha}...HEAD`]);
    return [status, stat, committed].filter((line) => line !== "").join("\n").trim();
  }
  changedFiles(worktreePath, baseSha) {
    if (!existsSync(worktreePath)) return [];
    const working = git(worktreePath, ["status", "--porcelain"]).split("\n").map((line) => line.slice(3).trim()).map((line) => line.includes(" -> ") ? line.split(" -> ").pop() ?? line : line).filter(Boolean);
    const committed = baseSha === void 0 ? [] : git(worktreePath, ["diff", "--name-only", `${baseSha}...HEAD`]).split("\n").map((line) => line.trim()).filter(Boolean);
    return [.../* @__PURE__ */ new Set([...working, ...committed])];
  }
  patch(worktreePath, baseSha, includeWorkingTree = false) {
    if (!existsSync(worktreePath)) return "";
    const range = includeWorkingTree ? baseSha : `${baseSha}...HEAD`;
    return git(worktreePath, ["diff", "--no-color", range]);
  }
};
export {
  WorkspaceError,
  WorkspaceManager
};
