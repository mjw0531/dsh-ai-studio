import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bindStudioRuntime,
  STUDIO_REVIEW_POLICY,
  STUDIO_WORKER_POLICY,
} from "../lib/dispatcher.js";
import { StudioStore } from "../lib/store.js";

function fakeAgent() {
  const events = [];
  return {
    status: "idle",
    session: {
      id: "session-test",
      deriveMessages: () => [],
      append: (type, data) => events.push({ type, data }),
      events,
    },
    followup: () => undefined,
  };
}

function fakeContext(mountedId = "standard") {
  const calls = {
    mount: [],
    restrict: [],
    approval: [],
    sandbox: [],
  };
  return {
    calls,
    ctx: {
      agentPresets: {
        mount: async (_agentCtx, id) => {
          calls.mount.push(id);
          return { id: mountedId };
        },
      },
      approval: {
        setPolicy: (_agent, policy) => calls.approval.push(policy),
      },
      sandboxPolicy: {
        setSandboxMode: (_session, mode) => calls.sandbox.push(mode),
      },
    },
  };
}

test("worker runtime pins standard preset and restricts creator tools", async () => {
  const { ctx, calls } = fakeContext();
  const agent = fakeAgent();
  const agentCtx = {
    tools: {
      restrict: (filter) => calls.restrict.push(filter),
    },
  };
  const runtime = await bindStudioRuntime(ctx, agentCtx, agent, {
    ...STUDIO_WORKER_POLICY,
  });
  assert.equal(runtime.agentPreset, "standard");
  assert.equal(runtime.sandboxMode, "workspace-write");
  assert.equal(runtime.approvalPolicy, "never");
  assert.deepEqual(calls.mount, ["standard"]);
  assert.deepEqual(calls.approval, ["never"]);
  assert.deepEqual(calls.sandbox, ["workspace-write"]);
  assert.ok(calls.restrict[0].deny.includes("subagent"));
  assert.ok(!calls.restrict[0].deny.includes("write"));
});

test("review runtime is read-only and removes mutation tools", async () => {
  const { ctx, calls } = fakeContext();
  const agent = fakeAgent();
  const runtime = await bindStudioRuntime(
    ctx,
    { tools: { restrict: (filter) => calls.restrict.push(filter) } },
    agent,
    { ...STUDIO_REVIEW_POLICY },
  );
  assert.equal(runtime.sandboxMode, "read-only");
  assert.ok(calls.restrict[0].deny.includes("write"));
  assert.ok(calls.restrict[0].deny.includes("pwsh"));
  assert.deepEqual(calls.sandbox, ["read-only"]);
});

test("fails closed when the mounted preset is not standard", async () => {
  const { ctx } = fakeContext("creator");
  await assert.rejects(
    () =>
      bindStudioRuntime(ctx, {}, fakeAgent(), {
        ...STUDIO_WORKER_POLICY,
      }),
    /expected standard/,
  );
});

test("fails closed when tools.restrict is unavailable", async () => {
  const { ctx } = fakeContext();
  await assert.rejects(
    () =>
      bindStudioRuntime(ctx, {}, fakeAgent(), {
        ...STUDIO_WORKER_POLICY,
      }),
    /tools\.restrict unavailable/,
  );
});

test("records runtime facts on a run", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-runtime-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const data = await store.bootstrap();
    const task = await store.createTask({
      title: "runtime",
      acceptance: ["ok"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "code");
    await store.recordRunRuntime(run.id, {
      agentPreset: "standard",
      approvalPolicy: "never",
      sandboxMode: "workspace-write",
      restrictedTools: ["subagent"],
    });
    const next = await store.bootstrap();
    const saved = next.runs.find((item) => item.id === run.id);
    assert.equal(saved?.agentPreset, "standard");
    assert.equal(saved?.sandboxMode, "workspace-write");
    assert.deepEqual(saved?.restrictedTools, ["subagent"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
