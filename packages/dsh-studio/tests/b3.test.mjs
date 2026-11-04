import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore } from "../lib/store.js";

test("freezes PRD and architecture versions with drift detection", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "studio-freeze-repo-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "studio-freeze-data-"));
  try {
    await writeFile(path.join(repo, "PRD.md"), "# PRD v1\n", "utf8");
    await writeFile(path.join(repo, "DOMAIN.md"), "# Domain\n", "utf8");
    await writeFile(path.join(repo, "ARCH.md"), "# Architecture\n", "utf8");
    const store = new StudioStore({ dataDir });
    await store.init();
    const project = await store.createProject({
      name: "Freeze",
      repoPath: repo,
    });
    const prd = await store.createFreeze(project.id, {
      kind: "prd",
      version: "v1",
      docPath: "PRD.md",
      domainModelPath: "DOMAIN.md",
      checklist: [
        { id: "a", text: "核心循环", done: true },
        { id: "b", text: "首切片", done: true },
      ],
    });
    assert.equal(prd.kind, "prd");
    assert.equal((await store.listFreezes(project.id)).length, 1);
    assert.equal(
      (await store.assertFreezeCurrent(project.id, "prd")).version,
      "v1",
    );

    await writeFile(path.join(repo, "PRD.md"), "# PRD changed\n", "utf8");
    await assert.rejects(
      () => store.assertFreezeCurrent(project.id, "prd"),
      (error) => error.code === "freeze_drift",
    );
    await writeFile(path.join(repo, "PRD.md"), "# PRD v1\n", "utf8");

    const gate = await store.getStageGate(project.id, "architecture");
    await store.updateStageGate(project.id, "architecture", {
      checklist: gate.checklist.map((item) => ({ ...item, done: true })),
      artifacts: [
        { id: "art", kind: "prd", label: "PRD", path: "PRD.md" },
        { id: "dom", kind: "domain_model", label: "Domain", path: "DOMAIN.md" },
      ],
    });
    const approved = await store.approveStageGate(
      project.id,
      "architecture",
      {},
    );
    assert.equal(approved.freezeId, prd.id);

    const arch = await store.createFreeze(project.id, {
      kind: "architecture",
      version: "v1",
      docPath: "ARCH.md",
      checklist: [{ id: "x", text: "边界", done: true }],
    });
    assert.equal(arch.kind, "architecture");
    const decision = store.createRequirementDecision(project.id, {
      title: "采用垂直切片",
      source: "AI 架构师",
      recommendation: "先做 核心 验证",
      status: "accepted",
      rationale: "最小可玩闭环",
      freezeId: prd.id,
    });
    assert.equal(decision.status, "accepted");
    const after = await store.bootstrap(project.id);
    assert.equal(after.freezes.length, 2);
    assert.equal(after.requirementDecisions.length, 1);
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("rejects a PRD freeze without a domain model", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "studio-freeze-repo2-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "studio-freeze-data2-"));
  try {
    await writeFile(path.join(repo, "PRD.md"), "# PRD\n", "utf8");
    const store = new StudioStore({ dataDir });
    await store.init();
    const project = await store.createProject({
      name: "Freeze2",
      repoPath: repo,
    });
    await assert.rejects(
      () =>
        store.createFreeze(project.id, {
          kind: "prd",
          version: "v1",
          docPath: "PRD.md",
          checklist: [{ id: "a", text: "ok", done: true }],
        }),
      (error) => error.code === "domain_model_required",
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});
