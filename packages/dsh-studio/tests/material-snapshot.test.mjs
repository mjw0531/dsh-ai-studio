import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore } from "../lib/store.js";

test("captures a material content hash at meeting creation", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-material-"));
  try {
    const store = new StudioStore({ dataDir: path.join(dir, "data") });
    await store.init();
    const data = await store.bootstrap();
    await writeFile(path.join(dir, "PRD.md"), "# PRD\n", "utf8");
    await store.updateProject(data.project.id, { repoPath: dir });
    const workshop = await store.createWorkshop({
      title: "材料会议",
      participantRoleIds: [data.roles[0].id],
      agenda: ["评审 PRD"],
      materialPaths: ["PRD.md"],
    });
    assert.equal(workshop.materials[0].path, "PRD.md");
    assert.match(workshop.materials[0].sha256, /^[a-f0-9]{12}$/u);
    assert.equal(workshop.materials[0].capturedAt, workshop.createdAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
