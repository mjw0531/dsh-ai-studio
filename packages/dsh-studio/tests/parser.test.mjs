import assert from "node:assert/strict";
import test from "node:test";

import { extractJsonObject } from "../lib/dispatcher.js";

test("parses a fenced JSON block followed by prose", () => {
  const parsed = extractJsonObject(
    '完成。\n```json\n{"summary":"ok","evidence":["test"]}\n```\n以上就是本次改动。',
  );
  assert.deepEqual(parsed, { summary: "ok", evidence: ["test"] });
});

test("picks the last valid JSON object when several are present", () => {
  const parsed = extractJsonObject(
    '旧结果 {"summary":"old"} 新结果 {"summary":"new","evidence":["x"]}',
  );
  assert.deepEqual(parsed, { summary: "new", evidence: ["x"] });
});

test("ignores braces in prose and returns undefined for invalid JSON", () => {
  assert.equal(extractJsonObject("只有一个 { 没有闭合"), undefined);
  assert.equal(extractJsonObject("没有回执"), undefined);
});
