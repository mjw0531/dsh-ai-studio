import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GitMergeService } from "../lib/merge.js";
import { StudioStore } from "../lib/store.js";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

test("merges an approved proposal in a clean repository", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-merge-"));
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "studio-merge-data-"),
  );
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd: dir,
      windowsHide: true,
    });
    git(dir, "config", "user.name", "Studio Test");
    git(dir, "config", "user.email", "studio@test.local");
    await writeFile(path.join(dir, "README.md"), "main\n", "utf8");
    git(dir, "add", "README.md");
    git(dir, "commit", "-m", "init");
    git(dir, "checkout", "-b", "studio/test");
    await writeFile(path.join(dir, "README.md"), "main\nbranch\n", "utf8");
    git(dir, "add", "README.md");
    git(dir, "commit", "-m", "branch change");
    git(dir, "checkout", "main");

    const store = new StudioStore({ dataDir });
    await store.init();
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: dir });
    const task = await store.createTask({
      title: "合并任务",
      acceptance: ["完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
      verifyCommand: 'node -e "process.exit(0)"',
    });
    await store.transitionTask(task.id, "ready");
    await store.transitionTask(task.id, "running");
    await store.transitionTask(task.id, "review");
    await store.updateTask(task.id, {
      acceptance: task.acceptance.map((item) => ({ ...item, done: true })),
      evidence: [
        {
          id: "ev-merge",
          text: "测试通过",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const done = await store.transitionTask(task.id, "done");
    await store.recordVerification(task.id, {
      command: "git --version",
      workdir: dir,
      exitCode: 0,
      output: "ok",
      passed: true,
    });
    const proposal = await store.createMergeProposal(task.id, {
      summary: "合并 branch",
      rollback: "git reset --hard HEAD^",
      branch: "studio/test",
      base: "main",
    });
    await store.approveMergeProposal(proposal.id, "ok");

    const merged = await new GitMergeService(store).execute(proposal.id);
    assert.equal(merged.status, "merged");
    assert.ok(merged.mergeCommit);
    assert.ok(merged.postMergeVerificationId);
    const after = await store.bootstrap();
    assert.ok(
      after.verifications.some(
        (item) =>
          item.id === merged.postMergeVerificationId && item.passed,
      ),
    );
    assert.match(
      await readFile(path.join(dir, "README.md"), "utf8"),
      /branch/,
    );
    assert.equal(git(dir, "rev-parse", "--abbrev-ref", "HEAD"), "main");
    assert.equal(done.status, "done");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("rolls back a merged proposal after a failed regression", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-rollback-"));
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "studio-rollback-data-"),
  );
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd: dir,
      windowsHide: true,
    });
    git(dir, "config", "user.name", "Studio Test");
    git(dir, "config", "user.email", "studio@test.local");
    await writeFile(path.join(dir, "README.md"), "main\n", "utf8");
    git(dir, "add", "README.md");
    git(dir, "commit", "-m", "init");
    git(dir, "checkout", "-b", "studio/test");
    await writeFile(path.join(dir, "README.md"), "main\nbranch\n", "utf8");
    git(dir, "add", "README.md");
    git(dir, "commit", "-m", "branch change");
    git(dir, "checkout", "main");

    const store = new StudioStore({ dataDir });
    await store.init();
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: dir });
    const task = await store.createTask({
      title: "回滚任务",
      acceptance: ["完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
      verifyCommand: 'node -e "process.exit(1)"',
    });
    await store.transitionTask(task.id, "ready");
    await store.transitionTask(task.id, "running");
    await store.transitionTask(task.id, "review");
    await store.updateTask(task.id, {
      acceptance: task.acceptance.map((item) => ({ ...item, done: true })),
      evidence: [
        {
          id: "ev-rollback",
          text: "测试通过",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await store.transitionTask(task.id, "done");
    await store.recordVerification(task.id, {
      command: "git --version",
      workdir: dir,
      exitCode: 0,
      output: "ok",
      passed: true,
    });
    const proposal = await store.createMergeProposal(task.id, {
      summary: "合并 branch",
      rollback: "git reset --hard HEAD^",
      branch: "studio/test",
      base: "main",
    });
    await store.approveMergeProposal(proposal.id, "ok");
    const merged = await new GitMergeService(store).execute(proposal.id);
    assert.equal(merged.status, "merged");
    assert.ok(merged.postMergeVerificationId);
    const failed = (await store.bootstrap()).verifications.find(
      (item) => item.id === merged.postMergeVerificationId,
    );
    assert.equal(failed?.passed, false);
    const rolled = await new GitMergeService(store).rollback(proposal.id);
    assert.ok(rolled.rollbackCommit);
    assert.match(
      await readFile(path.join(dir, "README.md"), "utf8"),
      /^main\r?\n$/,
    );
    assert.match(git(dir, "log", "-1", "--format=%s"), /Revert/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});
