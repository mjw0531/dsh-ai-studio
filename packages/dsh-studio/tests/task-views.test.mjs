import assert from "node:assert/strict";
import test from "node:test";

import {
  addSavedTaskView,
  parseSavedTaskViews,
} from "../lib/task-views.js";

test("parses and deduplicates saved task views", () => {
  assert.deepEqual(parseSavedTaskViews(null), []);
  assert.deepEqual(parseSavedTaskViews("not json"), []);
  const view = {
    id: "view-1",
    name: "待开始",
    query: "移动",
    status: "backlog",
    milestoneId: "m1",
  };
  assert.deepEqual(parseSavedTaskViews(JSON.stringify([view])), [view]);
  const replaced = addSavedTaskView([view], { ...view, query: "跳跃" });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].query, "跳跃");
});
