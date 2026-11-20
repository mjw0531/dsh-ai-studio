import assert from "node:assert/strict";
import test from "node:test";

import { searchStudio } from "../lib/search.js";

const data = {
  project: { prdPath: "docs/PRD.md" },
  tasks: [
    {
      id: "task-1",
      number: "T-0001",
      title: "实现移动",
      goal: "玩家可以移动",
      status: "ready",
    },
  ],
  workshops: [
    { id: "ws-1", title: "移动评审", topic: "", decision: "", status: "settled" },
  ],
  decisions: [
    {
      id: "d-1",
      title: "先做移动",
      context: "",
      decision: "通过",
      status: "approved",
    },
  ],
  modules: [
    {
      id: "m-1",
      name: "Movement",
      responsibility: "移动",
      contractText: "",
    },
  ],
  milestones: [{ id: "ms-1", title: "M1", goal: "可玩", status: "active" }],
};

test("searches across studio entities and caps results", () => {
  assert.equal(searchStudio(data, "")[0], undefined);
  const hits = searchStudio(data, "移动");
  assert.ok(hits.some((hit) => hit.kind === "task"));
  assert.ok(hits.some((hit) => hit.kind === "meeting"));
  assert.ok(hits.some((hit) => hit.kind === "module"));
  assert.ok(searchStudio(data, "docs/PRD").some((hit) => hit.kind === "doc"));
});
