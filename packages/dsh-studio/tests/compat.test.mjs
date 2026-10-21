import assert from "node:assert/strict";
import test from "node:test";

import { compatibilityOf } from "../lib/compat.js";

test("marks the tested DSH baseline as supported", () => {
  const result = compatibilityOf("0.2.1-rc.2");
  assert.equal(result.status, "supported");
  assert.equal(result.testedWith, "0.2.1-rc.2");
});

test("accepts future DSH 0.x minor versions", () => {
  assert.equal(compatibilityOf("0.3.0").status, "supported");
  assert.equal(compatibilityOf("1.0.0").status, "supported");
});

test("marks older DSH versions untested", () => {
  assert.equal(compatibilityOf("0.1.9").status, "untested");
});

test("reports unknown when the version cannot be read", () => {
  assert.equal(compatibilityOf("unknown").status, "unknown");
  assert.equal(compatibilityOf("not-a-version").status, "unknown");
});
