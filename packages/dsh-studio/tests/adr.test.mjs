import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AdrService } from "../lib/adr.js";
import { StudioStore } from "../lib/store.js";

test("writes an approved ADR draft into docs/adr with a number", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-adr-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "studio-adr-data-"));
  try {
    const store = new StudioStore({ dataDir });
    await store.init();
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: dir });
    const decision = await store.createDecision({
      title: "选择网络同步",
      context: "不可逆架构选择",
      reversible: false,
    });
    await store.decideDecision(decision.id, {
      status: "approved",
      decision: "采用状态同步",
      note: "可审计",
    });
    const written = await new AdrService(store).write(decision.id);
    assert.equal(written.adrPath, "docs/adr/0001-" + decision.id + ".md");
    const content = await readFile(
      path.join(dir, written.adrPath),
      "utf8",
    );
    assert.match(content, /# ADR: 选择网络同步/);
    assert.match(content, /采用状态同步/);
    const again = await new AdrService(store).write(decision.id);
    assert.equal(again.adrPath, written.adrPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});
