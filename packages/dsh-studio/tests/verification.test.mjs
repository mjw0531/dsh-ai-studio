import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore } from "../lib/store.js";
import { VerificationService } from "../lib/verify.js";

test("runs the configured verification command in the task worktree", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-verify-"));
  try {
    const store = new StudioStore({ dataDir: path.join(dir, ".studio") });
    await store.init();
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const task = await store.createTask({
      title: "验证命令",
      acceptance: ["命令退出 0"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
      verifyCommand: 'node -e "console.log(42); process.exit(0)"',
    });
    await store.transitionTask(task.id, "ready");
    await store.beginRun(task.id, "test", {
      path: dir,
      branch: "studio/task-verify",
    });

    const service = new VerificationService(store);
    const result = await service.verify(task.id);
    assert.equal(result.passed, true);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /42/);
    const after = await store.bootstrap();
    assert.equal(after.verifications.length, 1);
    assert.ok(
      after.tasks
        .find((item) => item.id === task.id)
        ?.evidence.some((item) => item.text.includes("验证通过")),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
