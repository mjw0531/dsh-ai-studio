import assert from "node:assert/strict";
import test from "node:test";

import { fallbackGuide, guideError } from "../lib/error-guide.js";

test("maps actionable error codes to next steps", () => {
  assert.match(guideError("repo_required", "no repo").action, /绑定仓库/u);
  assert.match(
    guideError("dependency_not_done", "blocked").action,
    /前置任务/u,
  );
  assert.match(guideError("acceptance_incomplete", "todo").action, /验收项/u);
  assert.match(guideError("doc_dirty", "dirty").action, /提交或还原/u);
  assert.match(guideError("network_failed", "offline").action, /DSH/u);
  assert.match(fallbackGuide("boom").action, /重试/u);
});
