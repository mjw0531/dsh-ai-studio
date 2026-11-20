import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkshopRetrospective } from "../lib/retrospective.js";

test("builds a meeting retrospective from minutes and actions", () => {
  const workshop = {
    title: "M1 复盘",
    status: "decided",
    decision: "先做移动",
    synthesis: "",
    linkedTaskId: "task-1",
    minutes: {
      decisionDraft: "",
      openQuestions: ["跳跃是否本版做"],
    },
    actionItems: [
      { text: "补移动测试", status: "done", taskId: null },
      { text: "确认跳跃", status: "open", taskId: "task-2" },
    ],
    materials: [{ path: "docs/PRD.md" }],
  };
  const tasks = [
    { id: "task-1", number: "T-0001", title: "实现移动", status: "done" },
  ];
  const retro = buildWorkshopRetrospective(workshop, tasks);
  assert.equal(retro.actionDone, 1);
  assert.equal(retro.actionTotal, 2);
  assert.deepEqual(retro.openActions, ["确认跳跃"]);
  assert.equal(retro.linkedTask?.number, "T-0001");
  assert.match(retro.markdown, /行动项：1\/2/u);
  assert.match(retro.markdown, /跳跃是否本版做/u);
});
