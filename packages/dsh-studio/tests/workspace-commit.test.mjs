import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { WorkspaceManager } from "../lib/workspace.js";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

test("commits all agent changes in a worktree", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-commit-"));
  try {
    git(dir, "init", "-b", "main");
    git(dir, "config", "user.name", "Test");
    git(dir, "config", "user.email", "test@example.com");
    await writeFile(path.join(dir, "a.txt"), "a\n", "utf8");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-m", "init");

    await writeFile(path.join(dir, "a.txt"), "a\nb\n", "utf8");
    await writeFile(path.join(dir, "b.txt"), "new\n", "utf8");
    const manager = new WorkspaceManager();
    const commit = manager.commit(dir, "studio: test task");
    assert.ok(commit);
    assert.equal(git(dir, "status", "--porcelain"), "");
    assert.match(git(dir, "log", "-1", "--format=%s"), /studio: test task/);
    assert.equal(manager.commit(dir, "studio: again"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
