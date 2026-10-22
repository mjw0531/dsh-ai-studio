// src/host/bundle.ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// src/shared/types.ts
var STUDIO_PLUGIN_VERSION = "2.5.0";

// src/host/store.ts
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
        path.join(temp, "studio.json"),
        `${JSON.stringify(state, null, 2)}
`,
        "utf8"
      );
      const checksum = (file) => createHash("sha256").update(file).digest("hex");
      const manifest = {
        kind: "dsh-ai-studio-project-bundle",
        formatVersion: 1,
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
        files: ["studio.json", "project.bundle", "manifest.json", "README.txt"],
        checksums: {
          "studio.json": checksum(
            await readFile(path.join(temp, "studio.json"))
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
          "2. Import studio.json on the new machine.",
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
};
export {
  ProjectBundleService
};
