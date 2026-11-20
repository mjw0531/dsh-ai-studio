import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore } from "../lib/store.js";

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-deps-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    await run(store);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("assigns human-readable numbers and blocks dispatch on unfinished dependencies", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const roles = data.roles;
    const first = await store.createTask({
      title: "第一个任务",
      acceptance: ["完成"],
      ownerRoleId: roles[0].id,
      reviewerRoleId: roles[1].id,
    });
    const second = await store.createTask({
      title: "第二个任务",
      acceptance: ["完成"],
      ownerRoleId: roles[0].id,
      reviewerRoleId: roles[1].id,
      dependsOn: [first.id],
    });
    assert.match(first.number, /^T-\d{4}$/u);
    assert.match(second.number, /^T-\d{4}$/u);
    assert.notEqual(first.number, second.number);
    assert.deepEqual(second.dependsOn, [first.id]);

    await store.transitionTask(second.id, "ready");
    await assert.rejects(
      () => store.beginRun(second.id, "blocked"),
      (error) => error.code === "dependency_not_done",
    );
  });
});

test("rejects dependency cycles", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const roles = data.roles;
    const a = await store.createTask({
      title: "A",
      acceptance: ["完成"],
      ownerRoleId: roles[0].id,
      reviewerRoleId: roles[1].id,
    });
    const b = await store.createTask({
      title: "B",
      acceptance: ["完成"],
      ownerRoleId: roles[0].id,
      reviewerRoleId: roles[1].id,
      dependsOn: [a.id],
    });
    await assert.rejects(
      () => store.updateTask(a.id, { dependsOn: [b.id] }),
      (error) => error.code === "dependency_cycle",
    );
  });
});
