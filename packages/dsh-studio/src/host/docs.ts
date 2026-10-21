import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ProjectDoc } from "../shared/types.js";
import type { StudioStore } from "./store.js";
import { StudioStoreError } from "./store.js";

const MAX_BYTES = 200_000;

/**
 * Reads project knowledge files (PRD / INVARIANTS / MODULES / module contracts)
 * from the bound repository. The path is confined to the repository root.
 */
export class DocsService {
  private readonly store: StudioStore;

  constructor(store: StudioStore) {
    this.store = store;
  }

  async read(relativePath: string): Promise<ProjectDoc> {
    const data = await this.store.bootstrap();
    if (data.project === null || data.project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "项目还没有绑定代码仓库，无法读取文档",
        409,
      );
    }
    const root = path.resolve(data.project.repoPath);
    const resolved = path.resolve(root, relativePath);
    if (
      resolved !== root &&
      !resolved.startsWith(`${root}${path.sep}`)
    ) {
      throw new StudioStoreError(
        "path_outside_repo",
        "文档路径必须位于项目仓库内",
        400,
      );
    }
    try {
      const buffer = await readFile(resolved);
      const truncated = buffer.byteLength > MAX_BYTES;
      return {
        kind: "custom",
        path: relativePath,
        content: buffer.subarray(0, MAX_BYTES).toString("utf8"),
        truncated,
        exists: true,
      };
    } catch {
      return {
        kind: "custom",
        path: relativePath,
        content: "",
        truncated: false,
        exists: false,
      };
    }
  }
}
