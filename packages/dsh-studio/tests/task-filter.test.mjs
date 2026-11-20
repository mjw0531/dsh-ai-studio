import assert from "node:assert/strict";
import test from "node:test";

import { filterTasks } from "../lib/task-filter.js";

const tasks = [
  {
    id: "1",
    number: "T-0001",
    title: "实现移动",
    goal: "玩家可以移动",
    status: "ready",
    milestoneId: "m1",
  },
  {
    id: "2",
    number: "T-0002",
    title: "实现跳跃",
    goal: "玩家可以跳跃",
    status: "backlog",
    milestoneId: "m1",
  },
  {
    id: "3",
    number: "T-0003",
    title: "登录界面",
    goal: "账号登录",
    status: "ready",
    milestoneId: null,
  },
];

test("filters tasks by query, status and milestone", () => {
  assert.deepEqual(
    filterTasks(tasks, { query: "玩家" }).map((task) => task.id),
    ["1", "2"],
  );
  assert.deepEqual(
    filterTasks(tasks, { query: "t-0003" }).map((task) => task.id),
    ["3"],
  );
  assert.deepEqual(
    filterTasks(tasks, { status: "ready", milestoneId: "m1" }).map(
      (task) => task.id,
    ),
    ["1"],
  );
});
