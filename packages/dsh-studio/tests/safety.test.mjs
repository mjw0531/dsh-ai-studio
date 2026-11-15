import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore } from "../lib/store.js";

test("keeps a corrupt studio.json and refuses to serve demo data", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-corrupt-"));
  try {
    const file = path.join(dir, "studio.json");
    const original = "{ definitely not json";
    await writeFile(file, original, "utf8");
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    assert.match(store.getWarning() ?? "", /原文件保留/);
    assert.equal(await readFile(file, "utf8"), original);
    await assert.rejects(
      () => store.bootstrap(),
      (error) => String(error).includes("Studio 数据不可用"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("marks an interrupted running run as failed and returns the task to ready", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-interrupted-"));
  try {
    const first = new StudioStore({ dataDir: dir });
    await first.init();
    const data = await first.bootstrap();
    const task = await first.createTask({
      title: "中断恢复",
      acceptance: ["完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
    });
    await first.transitionTask(task.id, "ready");
    const run = await first.beginRun(task.id, "running");

    const second = new StudioStore({ dataDir: dir });
    await second.init();
    const after = await second.bootstrap();
    assert.equal(
      after.runs.find((item) => item.id === run.id)?.status,
      "failed",
    );
    assert.equal(
      after.tasks.find((item) => item.id === task.id)?.status,
      "ready",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
