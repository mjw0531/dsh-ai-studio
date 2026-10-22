import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ProjectBundleService } from "../lib/bundle.js";
import { StudioStore } from "../lib/store.js";

test("exports a project bundle with git history", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "studio-bundle-repo-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "studio-bundle-data-"));
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd: repo, windowsHide: true });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: repo,
    });
    await writeFile(path.join(repo, "README.md"), "hello\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: repo });
    execFileSync("git", ["commit", "-m", "init"], { cwd: repo });

    const store = new StudioStore({ dataDir });
    await store.init();
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: repo });
    const bundle = await new ProjectBundleService(store).exportProject(
      data.project.id,
      "0.2.1-rc.2",
    );
    assert.match(bundle.filename, /\.tar\.gz$/);
    assert.ok(bundle.bytes.length > 100);
    const archivePath = path.join(repo, "bundle-check.tar.gz");
    await writeFile(archivePath, bundle.bytes);
    const entries = execFileSync("tar", ["-tzf", archivePath], {
      encoding: "utf8",
    });
    assert.match(entries, /project\.bundle/);
    assert.match(entries, /manifest\.json/);
    assert.doesNotMatch(entries, /project\.tar\.gz/);
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("imports a project bundle into an empty target", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "studio-import-repo-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "studio-import-data-"));
  const target = await mkdtemp(path.join(os.tmpdir(), "studio-import-target-"));
  const archive = path.join(os.tmpdir(), `studio-import-${String(Date.now())}.tar.gz`);
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd: repo, windowsHide: true });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: repo,
    });
    await writeFile(path.join(repo, "README.md"), "hello\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: repo });
    execFileSync("git", ["commit", "-m", "init"], { cwd: repo });

    const store = new StudioStore({ dataDir });
    await store.init();
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: repo });
    const service = new ProjectBundleService(store);
    const bundle = await service.exportProject(data.project.id, "0.2.1-rc.2");
    await writeFile(archive, bundle.bytes);
    const imported = await service.importProject(archive, target);
    assert.equal(imported.repoPath, target);
    assert.ok(existsSync(path.join(target, "README.md")));
    const next = await store.bootstrap();
    assert.equal(next.project?.repoPath, target);
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
});
