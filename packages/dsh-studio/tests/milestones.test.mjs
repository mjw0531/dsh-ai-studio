import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore } from "../lib/store.js";

test("creates milestones and assigns tasks to them", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-milestone-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const data = await store.bootstrap();
    const milestone = await store.createMilestone(data.project.id, {
      title: "M1 可玩闭环",
      goal: "跑通一局",
    });
    const task = await store.createTask({
      title: "实现移动",
      acceptance: ["能移动"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
      milestoneId: milestone.id,
    });
    assert.equal(task.milestoneId, milestone.id);
    const updated = await store.updateMilestone(milestone.id, {
      status: "active",
    });
    assert.equal(updated.status, "active");
    assert.equal((await store.bootstrap()).milestones.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
