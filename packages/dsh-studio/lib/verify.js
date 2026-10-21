// src/host/verify.ts
import { exec } from "node:child_process";
import { promisify } from "node:util";

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

// src/host/verify.ts
var run = promisify(exec);
var VerificationService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async verify(taskId, command) {
    const context = await this.store.getTaskVerificationContext(taskId);
    if (context.run === null || context.run.workspacePath === null) {
      throw new StudioStoreError(
        "workspace_required",
        "\u8FD9\u4E2A\u4EFB\u52A1\u8FD8\u6CA1\u6709\u53EF\u9A8C\u8BC1\u7684 worktree\uFF1B\u5148\u6D3E\u5355\u6267\u884C\u4E00\u6B21",
        409
      );
    }
    const resolved = (command?.trim() || context.task.verifyCommand || "").trim() || "npm test";
    const workdir = context.run.workspacePath;
    let output = "";
    let exitCode = 1;
    try {
      const result = await run(resolved, {
        cwd: workdir,
        timeout: 18e4,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true
      });
      output = `${result.stdout}${result.stderr}`;
      exitCode = 0;
    } catch (error) {
      const failed = error;
      output = `${failed.stdout ?? ""}${failed.stderr ?? ""}${failed.message ?? ""}`;
      exitCode = typeof failed.code === "number" ? failed.code : 1;
    }
    return this.store.recordVerification(taskId, {
      command: resolved,
      workdir,
      exitCode,
      output,
      passed: exitCode === 0,
      runId: context.run.id
    });
  }
};
export {
  VerificationService
};
