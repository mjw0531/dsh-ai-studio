// src/host/docs.ts
import { readFile } from "node:fs/promises";
import path from "node:path";

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

// src/host/docs.ts
var MAX_BYTES = 2e5;
var DocsService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async read(relativePath) {
    const data = await this.store.bootstrap();
    if (data.project === null || data.project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "\u9879\u76EE\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u4EE3\u7801\u4ED3\u5E93\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u6587\u6863",
        409
      );
    }
    const root = path.resolve(data.project.repoPath);
    const resolved = path.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new StudioStoreError(
        "path_outside_repo",
        "\u6587\u6863\u8DEF\u5F84\u5FC5\u987B\u4F4D\u4E8E\u9879\u76EE\u4ED3\u5E93\u5185",
        400
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
        exists: true
      };
    } catch {
      return {
        kind: "custom",
        path: relativePath,
        content: "",
        truncated: false,
        exists: false
      };
    }
  }
};
export {
  DocsService
};
