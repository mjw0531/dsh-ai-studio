import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DocsService } from "../lib/docs.js";
import { StudioStore } from "../lib/store.js";

test("reads project docs from the bound repository and confines paths", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-docs-"));
  try {
    const repo = path.join(dir, "repo");
    await mkdir(path.join(repo, "docs"), { recursive: true });
    await writeFile(
      path.join(repo, "docs", "PRD.md"),
      "# PRD\n\n单机先行。\n",
      "utf8",
    );
    const store = new StudioStore({ dataDir: path.join(dir, ".studio") });
    await store.init();
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: repo });
    const docs = new DocsService(store);
    const doc = await docs.read("docs/PRD.md");
    assert.equal(doc.exists, true);
    assert.match(doc.content, /单机先行/);
    await assert.rejects(() => docs.read("../outside.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("creates and updates a module contract", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-module-"));
  try {
    const store = new StudioStore({ dataDir: path.join(dir, ".studio") });
    await store.init();
    const module = await store.createModule({
      name: "combat",
      responsibility: "技能与五行判定",
      contractPath: "docs/contracts/combat.md",
      contractText: "输入：技能 ID；输出：伤害事件",
      allowedPaths: ["src/combat/"],
      forbiddenPaths: ["src/net/"],
    });
    assert.equal(module.name, "combat");
    const updated = await store.updateModule(module.id, {
      contractText: "输入：技能 ID；输出：伤害事件与冷却",
    });
    assert.match(updated.contractText, /冷却/);
    const data = await store.bootstrap();
    assert.equal(data.modules.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
