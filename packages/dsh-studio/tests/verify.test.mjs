import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { VerificationService } from "../lib/verify.js";

test("runs compile and test commands in order and stops on first failure", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-verify-"));
  try {
    const recorded = [];
    const store = {
      async getTaskVerificationContext() {
        return {
          task: {
            verifyCommand:
              'node -e "process.exit(0)"\nnode -e "process.exit(3)"',
          },
          run: { id: "run-test", workspacePath: dir },
        };
      },
      async recordVerification(_taskId, input) {
        recorded.push(input);
        return { id: "verify-test", ...input, createdAt: "now" };
      },
    };
    const service = new VerificationService(store);
    const verification = await service.verify("task-test");
    assert.equal(verification.passed, false);
    assert.equal(verification.exitCode, 3);
    assert.equal(recorded.length, 1);
    assert.match(recorded[0].command, /node -e/);
    assert.match(recorded[0].output, /\$ node -e/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
