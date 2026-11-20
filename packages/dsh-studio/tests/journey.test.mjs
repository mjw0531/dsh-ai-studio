import assert from "node:assert/strict";
import test from "node:test";

import { buildJourneySteps } from "../lib/journey.js";

test("builds journey states from stage, freezes, demos and tasks", () => {
  const base = {
    freezes: [],
    stageGates: [],
    demos: [],
    tasks: [],
  };
  assert.deepEqual(
    buildJourneySteps({ ...base, stage: "discovery" }).map((step) => step.state),
    ["done", "active", "todo", "todo", "todo", "todo"],
  );
  const ready = buildJourneySteps({
    ...base,
    stage: "development",
    freezes: [
      { kind: "prd" },
      { kind: "architecture" },
    ],
    demos: [{ result: "passed" }],
    tasks: [
      { status: "done" },
      { status: "done" },
    ],
  });
  assert.deepEqual(
    ready.map((step) => step.state),
    ["done", "done", "done", "done", "done", "done"],
  );
  assert.equal(ready[5]?.label, "任务 2/2");
});
