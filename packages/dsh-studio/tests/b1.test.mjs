import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioRouter } from "../lib/router.js";
import { StudioStore } from "../lib/store.js";

function fakeResponse() {
  return {
    statusCode: 0,
    body: "",
    headers: {},
    headersSent: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(status) {
      this.statusCode = status;
      this.headersSent = true;
    },
    end(body = "") {
      this.body += body;
    },
    destroy() {},
  };
}

function fakeRequest({ method, url, body, headers = {} }) {
  return {
    method,
    url,
    headers: {
      host: "127.0.0.1",
      "content-type": "application/json",
      ...headers,
    },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    },
  };
}

function makeRouter(store, token = "token") {
  const calls = { verify: 0 };
  const stub = async () => {
    throw new Error("not used");
  };
  const router = new StudioRouter({
    store,
    token,
    dshVersion: "0.2.1-rc.5",
    compatibility: {
      status: "supported",
      message: "ok",
      baseline: "0.2.1-rc.2",
    },
    connection: { admit: () => ({ rejection: 401 }) },
    bootNonce: "nonce",
    getBootPayload: () => ({ token }),
    dispatchTask: stub,
    verifyTask: async () => {
      calls.verify += 1;
      return {
        id: "verification",
        taskId: "task",
        command: "true",
        workdir: ".",
        exitCode: 0,
        output: "",
        passed: true,
        createdAt: new Date().toISOString(),
      };
    },
    reviewTask: stub,
    executeMerge: stub,
    rollbackMerge: stub,
    writeAdr: stub,
    exportProjectBundle: stub,
    importProjectBundle: stub,
    readProjectDoc: stub,
    runWorkshop: stub,
    summarizeWorkshop: stub,
    probeProviderProfile: stub,
  });
  return { router, calls };
}

async function call(router, req) {
  const res = fakeResponse();
  await router.handle(req, res);
  return res;
}

test("accepts null optional strings on task create", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-b1-null-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const data = await store.bootstrap();
    const { router } = makeRouter(store, "token");
    const res = await call(
      router,
      fakeRequest({
        method: "POST",
        url: "/studio-api/tasks",
        headers: { "x-studio-token": "token" },
        body: {
          title: "空值任务",
          acceptance: ["完成"],
          ownerRoleId: data.roles[0].id,
          reviewerRoleId: data.roles[1].id,
          branch: null,
          verifyCommand: null,
          module: null,
          contractRef: null,
        },
      }),
    );
    assert.equal(res.statusCode, 201);
    const payload = JSON.parse(res.body);
    assert.equal(payload.task.branch, null);
    assert.equal(payload.task.verifyCommand, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refuses a temporary verify command override", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-b1-verify-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const data = await store.bootstrap();
    const task = await store.createTask({
      title: "验证命令",
      acceptance: ["完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
      verifyCommand: "true",
    });
    const { router, calls } = makeRouter(store, "token");
    await assert.rejects(
      () =>
        router.handle(
          fakeRequest({
            method: "POST",
            url: `/studio-api/tasks/${task.id}/verify`,
            headers: { "x-studio-token": "token" },
            body: { command: "echo pwn" },
          }),
          fakeResponse(),
        ),
      (error) => error.code === "verify_command_override",
    );
    assert.equal(calls.verify, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runs verify from the saved task command without an override", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-b1-verify-ok-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const data = await store.bootstrap();
    const task = await store.createTask({
      title: "验证命令通过",
      acceptance: ["完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
      verifyCommand: "true",
    });
    const { router, calls } = makeRouter(store, "token");
    const res = await call(
      router,
      fakeRequest({
        method: "POST",
        url: `/studio-api/tasks/${task.id}/verify`,
        headers: { "x-studio-token": "token" },
        body: {},
      }),
    );
    assert.equal(res.statusCode, 200);
    assert.equal(calls.verify, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rate-limits repeated boot requests", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-b1-rate-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const { router } = makeRouter(store, "token");
    let lastStatus = 0;
    for (let index = 0; index < 31; index += 1) {
      const res = await call(
        router,
        fakeRequest({
          method: "GET",
          url: "/studio-api/boot",
          headers: { origin: "null" },
        }),
      );
      lastStatus = res.statusCode;
    }
    assert.equal(lastStatus, 429);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("externalizes run output outside studio.json", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-b1-output-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const data = await store.bootstrap();
    const task = await store.createTask({
      title: "输出外置",
      acceptance: ["完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "analysis");
    await store.completeRun(run.id, {
      output: "x".repeat(5000),
      receipt: {
        summary: "完成",
        evidence: ["ok"],
        artifacts: [],
        decisions: [],
        contractDeltas: [],
        rejectedOptions: [],
        blockers: [],
      },
      tokens: null,
    });
    await store.externalizeRunOutput(run.id, "x".repeat(5000));
    const saved = (await store.bootstrap()).runs.find(
      (item) => item.id === run.id,
    );
    assert.ok(saved?.outputPath);
    assert.equal(saved.output.length, 2000);
    assert.equal((await readFile(saved.outputPath, "utf8")).length, 5000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});