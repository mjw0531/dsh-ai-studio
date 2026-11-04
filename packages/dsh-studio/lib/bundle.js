// src/host/bundle.ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// src/shared/types.ts
var STUDIO_PLUGIN_VERSION = "3.8.0";

// src/host/store/core.ts
var StudioStoreError = class extends Error {
  code;
  status;
  constructor(code, message, status = 400) {
    super(message);
    this.name = "StudioStoreError";
    this.code = code;
    this.status = status;
  }
};

// src/host/bundle.ts
var run = promisify(execFile);
function assertSafeTarEntries(entries) {
  for (const raw of entries.split(/\r?\n/)) {
    const entry = raw.trim();
    if (entry === "") continue;
    const normalized = entry.replaceAll("\\", "/");
    if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) || normalized.split("/").includes("..")) {
      throw new StudioStoreError(
        "bundle_unsafe_path",
        `\u9879\u76EE\u5305\u542B\u4E0D\u5B89\u5168\u8DEF\u5F84\uFF1A${entry}`,
        400
      );
    }
  }
}
function sliceForProject(state, projectId) {
  const byProject = (items) => items.filter((item) => item.projectId === projectId);
  const project = state.projects.find((item) => item.id === projectId);
  if (project === void 0) {
    throw new StudioStoreError("project_not_found", "\u9879\u76EE\u4E0D\u5B58\u5728", 404);
  }
  return {
    schemaVersion: state.schemaVersion,
    project,
    stageGates: byProject(state.stageGates),
    triggers: byProject(state.triggers),
    threads: byProject(state.threads),
    workshops: byProject(state.workshops),
    providerProfiles: byProject(state.providerProfiles),
    prototypeDemos: byProject(state.prototypeDemos),
    roles: byProject(state.roles),
    modules: byProject(state.modules),
    tasks: byProject(state.tasks),
    mergeProposals: byProject(state.mergeProposals),
    runs: byProject(state.runs),
    branches: byProject(state.branches),
    contractChanges: byProject(state.contractChanges),
    decisions: byProject(state.decisions),
    verifications: byProject(state.verifications),
    reviews: byProject(state.reviews),
    events: state.events.filter((item) => item.projectId === projectId)
  };
}
var ProjectBundleService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async exportProject(projectId, dshVersion) {
    const state = await this.store.exportState();
    const project = state.projects.find((item) => item.id === projectId);
    if (project === void 0) {
      throw new StudioStoreError("project_not_found", "\u9879\u76EE\u4E0D\u5B58\u5728", 404);
    }
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "\u9879\u76EE\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u4EE3\u7801\u4ED3\u5E93\uFF0C\u65E0\u6CD5\u5BFC\u51FA\u9879\u76EE\u5305",
        409
      );
    }
    const slice = sliceForProject(state, projectId);
    const temp = await mkdtemp(path.join(os.tmpdir(), "studio-bundle-"));
    const archive = path.join(
      os.tmpdir(),
      `studio-bundle-${String(Date.now())}-${Math.random().toString(36).slice(2)}.tar.gz`
    );
    try {
      const bundlePath = path.join(temp, "project.bundle");
      await run(
        "git",
        ["bundle", "create", bundlePath, "--all"],
        { cwd: project.repoPath, windowsHide: true }
      );
      await writeFile(
        path.join(temp, "project.json"),
        `${JSON.stringify(slice, null, 2)}
`,
        "utf8"
      );
      const checksum = (file) => createHash("sha256").update(file).digest("hex");
      const manifest = {
        kind: "dsh-ai-studio-project-bundle",
        formatVersion: 2,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        pluginVersion: STUDIO_PLUGIN_VERSION,
        dshVersion,
        schemaVersion: state.schemaVersion,
        project: {
          id: project.id,
          name: project.name,
          description: project.description
        },
        repoPath: project.repoPath,
        files: ["project.json", "project.bundle", "manifest.json", "README.txt"],
        checksums: {
          "project.json": checksum(
            await readFile(path.join(temp, "project.json"))
          ),
          "project.bundle": checksum(await readFile(bundlePath))
        }
      };
      await writeFile(
        path.join(temp, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}
`,
        "utf8"
      );
      await writeFile(
        path.join(temp, "README.txt"),
        [
          "dsh-ai-studio project bundle",
          "",
          "1. Install the same or newer dsh-ai-studio plugin.",
          "2. Import project.json on the new machine.",
          "3. Clone project.bundle into a new directory:",
          "   git clone project.bundle <new-project-dir>",
          "4. Rebind the project repoPath to <new-project-dir>.",
          "5. Recreate worktrees only for active tasks; do not copy .worktrees.",
          "",
          "This archive contains Studio state and git history, not API keys."
        ].join("\n"),
        "utf8"
      );
      await run(
        "tar",
        ["-czf", archive, "-C", temp, "."],
        { windowsHide: true }
      );
      const bytes = await readFile(archive);
      const safeName = project.name.replace(/[^\w.-]+/g, "-").slice(0, 40);
      return {
        filename: `${safeName || "project"}-bundle.tar.gz`,
        bytes
      };
    } catch (error) {
      if (error instanceof StudioStoreError) throw error;
      throw new StudioStoreError(
        "bundle_failed",
        `\u9879\u76EE\u5305\u5BFC\u51FA\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,
        500
      );
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => void 0);
      await rm(archive, { force: true }).catch(() => void 0);
    }
  }
  async importProject(archivePath, targetPath) {
    if (!path.isAbsolute(archivePath) || !path.isAbsolute(targetPath)) {
      throw new StudioStoreError(
        "invalid_path",
        "\u9879\u76EE\u5305\u8DEF\u5F84\u548C\u76EE\u6807\u4ED3\u5E93\u8DEF\u5F84\u90FD\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84",
        400
      );
    }
    const archiveInfo = await stat(archivePath).catch(() => null);
    if (archiveInfo === null || !archiveInfo.isFile()) {
      throw new StudioStoreError(
        "bundle_not_found",
        `\u627E\u4E0D\u5230\u9879\u76EE\u5305\uFF1A${archivePath}`,
        404
      );
    }
    const targetInfo = await stat(targetPath).catch(() => null);
    if (targetInfo !== null) {
      if (!targetInfo.isDirectory()) {
        throw new StudioStoreError(
          "target_not_empty",
          "\u76EE\u6807\u4ED3\u5E93\u8DEF\u5F84\u5DF2\u5B58\u5728\u4E14\u4E0D\u662F\u76EE\u5F55",
          409
        );
      }
      const entries = await readdir(targetPath);
      if (entries.length > 0) {
        throw new StudioStoreError(
          "target_not_empty",
          "\u76EE\u6807\u4ED3\u5E93\u76EE\u5F55\u5FC5\u987B\u4E3A\u7A7A\uFF0C\u6216\u4E0D\u5B58\u5728",
          409
        );
      }
    }
    const temp = await mkdtemp(path.join(os.tmpdir(), "studio-import-"));
    try {
      const entries = await run(
        "tar",
        ["-tzf", archivePath],
        { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
      );
      assertSafeTarEntries(entries.stdout);
      await run(
        "tar",
        ["-xzf", archivePath, "-C", temp],
        { windowsHide: true }
      );
      const manifest = JSON.parse(
        await readFile(path.join(temp, "manifest.json"), "utf8")
      );
      if (manifest.kind !== "dsh-ai-studio-project-bundle" || manifest.formatVersion !== 2) {
        throw new StudioStoreError(
          "bundle_invalid",
          "\u4E0D\u662F dsh-ai-studio v2 \u9879\u76EE\u5305\uFF1B\u65E7\u9879\u76EE\u5305\u8BF7\u91CD\u65B0\u5BFC\u51FA\uFF0C\u907F\u514D\u8986\u76D6\u5176\u4ED6\u9879\u76EE",
          400
        );
      }
      const projectId = manifest.project?.id;
      if (typeof projectId !== "string") {
        throw new StudioStoreError(
          "bundle_invalid",
          "\u9879\u76EE\u5305\u7F3A\u5C11 project.id",
          400
        );
      }
      for (const [name, expected] of Object.entries(
        manifest.checksums ?? {}
      )) {
        const file = await readFile(path.join(temp, name)).catch(() => null);
        if (file === null) {
          throw new StudioStoreError(
            "bundle_invalid",
            `\u9879\u76EE\u5305\u7F3A\u5C11\u6587\u4EF6\uFF1A${name}`,
            400
          );
        }
        const actual = createHash("sha256").update(file).digest("hex");
        if (actual !== expected) {
          throw new StudioStoreError(
            "bundle_checksum",
            `\u9879\u76EE\u5305\u6821\u9A8C\u548C\u4E0D\u5339\u914D\uFF1A${name}`,
            400
          );
        }
      }
      const slice = JSON.parse(
        await readFile(path.join(temp, "project.json"), "utf8")
      );
      if (slice.project.id !== projectId) {
        throw new StudioStoreError(
          "bundle_invalid",
          "manifest \u4E0E project.json \u7684 project id \u4E0D\u4E00\u81F4",
          400
        );
      }
      await run(
        "git",
        ["clone", path.join(temp, "project.bundle"), targetPath],
        { windowsHide: true }
      );
      await this.store.importProjectSlice(slice, targetPath);
      return { projectId, repoPath: targetPath };
    } catch (error) {
      if (error instanceof StudioStoreError || error instanceof Error && "code" in error && "status" in error) {
        throw error;
      }
      throw new StudioStoreError(
        "bundle_import_failed",
        `\u9879\u76EE\u5305\u5BFC\u5165\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,
        500
      );
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => void 0);
    }
  }
};
export {
  ProjectBundleService
};
