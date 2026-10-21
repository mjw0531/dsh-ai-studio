import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore, StudioStoreError } from "../lib/store.js";

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dsh-studio-test-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    return await run(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("seeds a demo project, roles, and tasks", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    assert.ok(data.project);
    assert.equal(data.project.name, "MOBA 垂直切片");
    assert.equal(data.projects.length, 1);
    assert.equal(data.roles.length, 4);
    assert.equal(data.tasks.length, 5);
    assert.equal(data.stats.total, 5);
    assert.ok(data.stats.acceptanceTotal > 0);
    assert.equal(data.features.independentPage, true);
  });
});

test("persists state across store instances", async () => {
  let taskId = "";
  await withStore(async (store, dir) => {
    const task = await store.createTask({
      title: "持久化任务",
      acceptance: ["重启后仍然存在"],
      priority: "P0",
    });
    taskId = task.id;
    const second = new StudioStore({ dataDir: dir });
    await second.init();
    const data = await second.bootstrap();
    assert.ok(data.tasks.some((item) => item.id === taskId));
  });
});

test("requires an acceptance item before a task can be created", async () => {
  await withStore(async (store) => {
    await assert.rejects(
      () => store.createTask({ title: "没有验收" }),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "acceptance_required",
    );
  });
});

test("blocks done until every acceptance item is complete", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const task = await store.createTask({
      title: "验收门禁",
      acceptance: ["测试通过", "证据已记录"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
    });

    await store.transitionTask(task.id, "ready");
    await store.transitionTask(task.id, "running");
    await store.transitionTask(task.id, "review");

    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "acceptance_incomplete",
    );

    const accepted = await store.updateTask(task.id, {
      acceptance: task.acceptance.map((item) => ({ ...item, done: true })),
    });
    assert.equal(accepted.acceptance.every((item) => item.done), true);

    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "evidence_required",
    );

    const withEvidence = await store.updateTask(task.id, {
      evidence: [
        {
          id: "",
          text: "pnpm test ability — 42 passed",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    assert.equal(withEvidence.evidence.length, 1);
    const done = await store.transitionTask(task.id, "done");
    assert.equal(done.status, "done");
  });
});

test("rejects an invalid transition", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const task = data.tasks.find((item) => item.status === "backlog");
    assert.ok(task);
    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "invalid_transition",
    );
  });
});

test("creates a project and switches the active project", async () => {
  await withStore(async (store) => {
    const project = await store.createProject({
      name: "第二个项目",
      description: "验证多项目切换",
    });
    const data = await store.bootstrap();
    assert.equal(data.activeProjectId, project.id);
    assert.equal(data.projects.length, 2);
    assert.equal(data.project?.name, "第二个项目");
    assert.equal(data.tasks.length, 0);
    assert.equal(data.roles.length, 0);
  });
});
