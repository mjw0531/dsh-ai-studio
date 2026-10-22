import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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

  async importProject(
    archivePath: string,
    targetPath: string,
  ): Promise<{ projectId: string; repoPath: string }> {
    if (!path.isAbsolute(archivePath) || !path.isAbsolute(targetPath)) {
      throw new StudioStoreError(
        "invalid_path",
        "项目包路径和目标仓库路径都必须是绝对路径",
        400,
      );
    }
    const archiveInfo = await stat(archivePath).catch(() => null);
    if (archiveInfo === null || !archiveInfo.isFile()) {
      throw new StudioStoreError(
        "bundle_not_found",
        `找不到项目包：${archivePath}`,
        404,
      );
    }
    const targetInfo = await stat(targetPath).catch(() => null);
    if (targetInfo !== null) {
      if (!targetInfo.isDirectory()) {
        throw new StudioStoreError(
          "target_not_empty",
          "目标仓库路径已存在且不是目录",
          409,
        );
      }
      const entries = await readdir(targetPath);
      if (entries.length > 0) {
        throw new StudioStoreError(
          "target_not_empty",
          "目标仓库目录必须为空，或不存在",
          409,
        );
      }
    }
    const temp = await mkdtemp(path.join(os.tmpdir(), "studio-import-"));
    try {
      await run(
        "tar",
        ["-xzf", archivePath, "-C", temp],
        { windowsHide: true },
      );
      const manifest = JSON.parse(
        await readFile(path.join(temp, "manifest.json"), "utf8"),
      ) as {
        kind?: unknown;
        formatVersion?: unknown;
        project?: { id?: unknown };
        checksums?: Record<string, string>;
      };
      if (
        manifest.kind !== "dsh-ai-studio-project-bundle" ||
        manifest.formatVersion !== 1
      ) {
        throw new StudioStoreError(
          "bundle_invalid",
          "不是 dsh-ai-studio 项目包，或格式版本不支持",
          400,
        );
      }
      const projectId = manifest.project?.id;
      if (typeof projectId !== "string") {
        throw new StudioStoreError(
          "bundle_invalid",
          "项目包缺少 project.id",
          400,
        );
      }
      for (const [name, expected] of Object.entries(
        manifest.checksums ?? {},
      )) {
        const file = await readFile(path.join(temp, name)).catch(() => null);
        if (file === null) {
          throw new StudioStoreError(
            "bundle_invalid",
            `项目包缺少文件：${name}`,
            400,
          );
        }
        const actual = createHash("sha256").update(file).digest("hex");
        if (actual !== expected) {
          throw new StudioStoreError(
            "bundle_checksum",
            `项目包校验和不匹配：${name}`,
            400,
          );
        }
      }
      const state = JSON.parse(
        await readFile(path.join(temp, "studio.json"), "utf8"),
      ) as unknown;
      await run(
        "git",
        ["clone", path.join(temp, "project.bundle"), targetPath],
        { windowsHide: true },
      );
      await this.store.importState(state);
      await this.store.updateProject(projectId, {
        repoPath: targetPath,
      });
      return { projectId, repoPath: targetPath };
    } catch (error) {
      if (error instanceof StudioStoreError) throw error;
      throw new StudioStoreError(
        "bundle_import_failed",
        `项目包导入失败：${error instanceof Error ? error.message : String(error)}`,
        500,
      );
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
