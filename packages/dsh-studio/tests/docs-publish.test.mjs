import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DocsPublisherService } from "../lib/docs-publish.js";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

test("initializes the docs skeleton and indexes numbered requirements", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-docs-"));
  try {
    git(dir, "init", "-b", "main");
    git(dir, "config", "user.name", "Studio Test");
    git(dir, "config", "user.email", "studio@test.local");
    const store = {
      async bootstrap() {
        return { project: { repoPath: dir, prdPath: "docs/PRD.md" } };
      },
    };
    const service = new DocsPublisherService(store);
    const initialized = await service.initializeSkeleton();
    assert.ok(initialized.commit);
    assert.equal(git(dir, "status", "--porcelain"), "");
    assert.match(await readFile(path.join(dir, "docs/PRD.md"), "utf8"), /R-001/);
    const requirements = await service.requirements();
    assert.equal(requirements.items[0]?.id, "R-001");

    const published = await service.publish([
      {
        path: "docs/PRD.md",
        content: "# PRD\n\n- R-002 新增需求\n",
      },
    ]);
    assert.ok(published.commit);
    assert.equal((await service.requirements()).items[0]?.id, "R-002");
    assert.equal(git(dir, "status", "--porcelain"), "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
