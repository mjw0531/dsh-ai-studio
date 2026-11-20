import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
        return {
          project: { repoPath: dir, prdPath: "docs/PRD.md" },
          milestones: [
            {
              id: "milestone-1",
              projectId: "project-1",
              title: "M1",
              goal: "跑通",
              status: "active",
              order: 1,
            },
          ],
          tasks: [
            {
              id: "task-1",
              number: "T-0001",
              title: "实现移动",
              status: "done",
              milestoneId: "milestone-1",
              acceptance: [{ id: "a1", text: "能移动", done: true }],
            },
          ],
          modules: [
            {
              id: "module-alpha",
              name: "Alpha",
              responsibility: "核心战斗",
              dependsOn: [],
              allowedPaths: ["src/alpha"],
              forbiddenPaths: [],
              contractPath: null,
            },
          ],
        };
      },
    };
    const service = new DocsPublisherService(store);
    const initialized = await service.initializeSkeleton();
    assert.ok(initialized.commit);
    assert.equal(git(dir, "status", "--porcelain"), "");
    assert.match(await readFile(path.join(dir, "docs/PRD.md"), "utf8"), /R-001/);
    const synced = await service.syncModules();
    assert.ok(synced.commit);
    assert.match(
      await readFile(path.join(dir, "docs/modules/Alpha.md"), "utf8"),
      /核心战斗/,
    );
    const milestoneDocs = await service.syncMilestones();
    assert.ok(milestoneDocs.commit);
    assert.match(
      await readFile(path.join(dir, "docs/plan/milestones/M1.md"), "utf8"),
      /任务覆盖：1\/1/,
    );
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
    const created = await service.publish([
      { path: "docs/DOMAIN_MODEL.md", content: "# Domain\n" },
    ]);
    assert.ok(created.commit);
    assert.match(
      await readFile(path.join(dir, "docs/DOMAIN_MODEL.md"), "utf8"),
      /# Domain/u,
    );
    await writeFile(path.join(dir, "docs/PRD.md"), "# dirty\n", "utf8");
    const diff = await service.diff("docs/PRD.md");
    assert.equal(diff.dirty, true);
    assert.match(diff.diff, /dirty/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
