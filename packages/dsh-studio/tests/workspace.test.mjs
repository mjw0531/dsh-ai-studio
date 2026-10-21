import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { WorkspaceManager } from "../lib/workspace.js";

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

test("creates one worktree and branch per task", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-workspace-"));
  try {
    git(dir, ["init", "-b", "main"]);
    git(dir, ["config", "user.name", "Studio"]);
    git(dir, ["config", "user.email", "studio@local"]);
    await writeFile(path.join(dir, "README.md"), "# demo\n", "utf8");
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "init"]);

    const manager = new WorkspaceManager();
    const workspace = await manager.prepare(dir, "task-001");
    assert.equal(workspace.branch, "studio/task-001");
    assert.ok(workspace.path.endsWith(path.join(".worktrees", "task-001")));
    assert.equal(git(workspace.path, ["branch", "--show-current"]), "studio/task-001");

    await writeFile(path.join(workspace.path, "README.md"), "# changed\n", "utf8");
    const diff = manager.diffStat(workspace.path);
    assert.match(diff, /README\.md/);
    assert.match(diff, /1 file changed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
