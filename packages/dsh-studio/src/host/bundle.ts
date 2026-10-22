import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { STUDIO_PLUGIN_VERSION } from "../shared/types.js";
import type { StudioStore } from "./store.js";
import { StudioStoreError } from "./store.js";

const run = promisify(execFile);

export interface ProjectBundle {
  filename: string;
  bytes: Buffer;
}

/**
 * Exports a portable project bundle: Studio state, git bundle, manifest and
 * rebind instructions. Secrets are never stored in Studio state, so they are
 * not part of the archive.
 */
export class ProjectBundleService {
  private readonly store: StudioStore;

  constructor(store: StudioStore) {
    this.store = store;
  }

  async exportProject(
    projectId: string,
    dshVersion: string,
  ): Promise<ProjectBundle> {
    const state = await this.store.exportState();
    const project = state.projects.find((item) => item.id === projectId);
    if (project === undefined) {
      throw new StudioStoreError("project_not_found", "项目不存在", 404);
    }
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "项目还没有绑定代码仓库，无法导出项目包",
        409,
      );
    }
    const temp = await mkdtemp(path.join(os.tmpdir(), "studio-bundle-"));
    const archive = path.join(
      os.tmpdir(),
      `studio-bundle-${String(Date.now())}-${Math.random().toString(36).slice(2)}.tar.gz`,
    );
    try {
      const bundlePath = path.join(temp, "project.bundle");
      await run(
        "git",
        ["bundle", "create", bundlePath, "--all"],
        { cwd: project.repoPath, windowsHide: true },
      );
      await writeFile(
        path.join(temp, "studio.json"),
        `${JSON.stringify(state, null, 2)}\n`,
        "utf8",
      );
      const checksum = (file: Buffer): string =>
        createHash("sha256").update(file).digest("hex");
      const manifest = {
        kind: "dsh-ai-studio-project-bundle",
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        pluginVersion: STUDIO_PLUGIN_VERSION,
        dshVersion,
        schemaVersion: state.schemaVersion,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
        },
        repoPath: project.repoPath,
        files: ["studio.json", "project.bundle", "manifest.json", "README.txt"],
        checksums: {
          "studio.json": checksum(
            await readFile(path.join(temp, "studio.json")),
          ),
          "project.bundle": checksum(await readFile(bundlePath)),
        },
      };
      await writeFile(
        path.join(temp, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        path.join(temp, "README.txt"),
        [
          "dsh-ai-studio project bundle",
          "",
          "1. Install the same or newer dsh-ai-studio plugin.",
          "2. Import studio.json on the new machine.",
          "3. Clone project.bundle into a new directory:",
          "   git clone project.bundle <new-project-dir>",
          "4. Rebind the project repoPath to <new-project-dir>.",
          "5. Recreate worktrees only for active tasks; do not copy .worktrees.",
          "",
          "This archive contains Studio state and git history, not API keys.",
        ].join("\n"),
        "utf8",
      );
      await run(
        "tar",
        ["-czf", archive, "-C", temp, "."],
        { windowsHide: true },
      );
      const bytes = await readFile(archive);
      const safeName = project.name.replace(/[^\w.-]+/g, "-").slice(0, 40);
      return {
        filename: `${safeName || "project"}-bundle.tar.gz`,
        bytes,
      };
    } catch (error) {
      if (error instanceof StudioStoreError) throw error;
      throw new StudioStoreError(
        "bundle_failed",
        `项目包导出失败：${error instanceof Error ? error.message : String(error)}`,
        500,
      );
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => undefined);
      await rm(archive, { force: true }).catch(() => undefined);
    }
  }
}
