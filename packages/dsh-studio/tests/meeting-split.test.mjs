import assert from "node:assert/strict";
import test from "node:test";

import { parseMeetingTaskLines } from "../lib/meeting-split.js";

test("parses deduplicated meeting task lines with a cap", () => {
  assert.deepEqual(
    parseMeetingTaskLines("- 实现移动\n\n* 实现跳跃\n实现移动\n"),
    ["实现移动", "实现跳跃"],
  );
  const many = Array.from({ length: 15 }, (_, index) => `任务 ${String(index)}`);
  assert.equal(parseMeetingTaskLines(many.join("\n")).length, 10);
});
