import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore } from "../lib/store.js";

test("adds and completes meeting action items", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-actions-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const data = await store.bootstrap();
    const workshop = await store.createWorkshop({
      title: "行动项会议",
      participantRoleIds: [data.roles[0].id, data.roles[1].id],
      agenda: ["确定下一步"],
    });
    const withAction = await store.addWorkshopActionItem(workshop.id, {
      text: "补一版登录流程",
      ownerRoleId: data.roles[0].id,
    });
    const item = withAction.actionItems[0];
    assert.equal(item.text, "补一版登录流程");
    assert.equal(item.status, "open");
    const completed = await store.updateWorkshopActionItem(
      workshop.id,
      item.id,
      { status: "done" },
    );
    assert.equal(completed.actionItems[0].status, "done");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
