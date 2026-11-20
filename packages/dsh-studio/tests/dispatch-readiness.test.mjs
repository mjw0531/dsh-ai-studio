import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseDispatch } from "../lib/dispatch-readiness.js";

const owner = { id: "role-owner" };
const baseTask = {
  id: "task-1",
  number: "T-0001",
  title: "实现移动",
  status: "ready",
  ownerRoleId: "role-owner",
  dependsOn: [],
  kind: "new",
  integration: false,
  diagnosis: "",
  plan: "",
  verifyCommand: "npm test",
};

test("diagnoses blockers before dispatch", () => {
  const blockedDependency = {
    ...baseTask,
    dependsOn: ["task-2"],
  };
  const result = diagnoseDispatch({
    task: blockedDependency,
    project: { repoPath: "D:\\repo", stage: "discovery" },
    roles: [owner],
    tasks: [
      blockedDependency,
      { ...baseTask, id: "task-2", status: "ready", number: "T-0002" },
    ],
  });
  assert.equal(result.ready, false);
  assert.equal(result.checks.find((c) => c.id === "dependencies")?.ok, false);
  assert.equal(result.checks.find((c) => c.id === "stage")?.ok, false);
  assert.match(
    result.checks.find((c) => c.id === "dependencies")?.hint ?? "",
    /T-0002/u,
  );
});

test("ready task passes diagnosis", () => {
  const result = diagnoseDispatch({
    task: baseTask,
    project: { repoPath: null, stage: "discovery" },
    roles: [owner],
    tasks: [baseTask],
  });
  assert.equal(result.ready, true);
});
