import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { Verification } from "../shared/types.js";
import type { StudioStore } from "./store.js";
import { StudioStoreError } from "./store.js";

const run = promisify(exec);

export async function runVerificationCommand(
  command: string,
  workdir: string,
): Promise<{ output: string; exitCode: number }> {
  try {
    const result = await run(command, {
      cwd: workdir,
      timeout: 180_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { output: `${result.stdout}${result.stderr}`, exitCode: 0 };
  } catch (error) {
    const failed = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      message?: string;
    };
    return {
      output: `${failed.stdout ?? ""}${failed.stderr ?? ""}${
        failed.message ?? ""
      }`,
      exitCode: typeof failed.code === "number" ? failed.code : 1,
    };
  }
}

/**
 * Trusted host-side verification.
 *
 * The Agent may be unable to start a sandboxed shell (Windows ACL), so the
 * Verifier/Owner can ask Studio to run the configured command directly in the
 * task worktree. This is a separate session-free check: it records exit code
 * and output as evidence, and never marks acceptance itself.
 */
export class VerificationService {
  private readonly store: StudioStore;

  constructor(store: StudioStore) {
    this.store = store;
  }

  async verify(taskId: string, command?: string): Promise<Verification> {
    const context = await this.store.getTaskVerificationContext(taskId);
    if (context.run === null || context.run.workspacePath === null) {
      throw new StudioStoreError(
        "workspace_required",
        "这个任务还没有可验证的 worktree；先派单执行一次",
        409,
      );
    }
    const configured =
      (command?.trim() || context.task.verifyCommand || "").trim() ||
      "npm test";
    const commands = configured
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    if (commands.length === 0) {
      commands.push("npm test");
    }
    const workdir = context.run.workspacePath;
    let output = "";
    let exitCode = 0;
    for (const step of commands) {
      const result = await runVerificationCommand(step, workdir);
      output += `$ ${step}\n${result.output}\n`;
      if (result.exitCode !== 0) {
        exitCode = result.exitCode;
        break;
      }
    }
    const recorded = commands.join("\n");
    return this.store.recordVerification(taskId, {
      command:
        recorded.length <= 500
          ? recorded
          : `${recorded.slice(0, 497)}...`,
      workdir,
      exitCode,
      output,
      passed: exitCode === 0,
      runId: context.run.id,
    });
  }
}
