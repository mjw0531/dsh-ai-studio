import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ProjectBundleService } from "../lib/bundle.js";
import { assertLocalGitIdentity } from "../lib/merge.js";
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

function fakeRequest(headers) {
  return {
    method: "GET",
    url: "/studio-api/boot",
    headers: { host: "127.0.0.1", ...headers },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function makeRouter({ nonce = "nonce-123", admit = true } = {}) {
  const stub = async () => {
    throw new Error("not used");
  };
  return new StudioRouter({
    store: {},
    token: "token",
    dshVersion: "0.2.1-rc.5",
    compatibility: {
      status: "supported",
      message: "ok",
      baseline: "0.2.1-rc.2",
    },
    connection: {
      admit: () =>
        admit ? {} : { rejection: 401 },
    },
    bootNonce: nonce,
    getBootPayload: () => ({ token: "token", nonce }),
    dispatchTask: stub,
    verifyTask: stub,
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
}

async function boot(router, headers) {
  const res = fakeResponse();
  await router.handle(fakeRequest(headers), res);
  return res;
}

test("rejects boot requests from file and null origins", async () => {
  const router = makeRouter();
  assert.equal((await boot(router, { origin: "null" })).statusCode, 401);
  assert.equal(
    (await boot(router, { origin: "file:///C:/evil.html" })).statusCode,
    401,
  );
});

test("requires the desktop nonce for dsh-app boot", async () => {
  const router = makeRouter();
  assert.equal(
    (await boot(router, { origin: "dsh-app://desktop" })).statusCode,
    401,
  );
  assert.equal(
    (
      await boot(router, {
        origin: "dsh-app://desktop",
        "x-dsh-studio-nonce": "wrong",
      })
    ).statusCode,
    401,
  );
  const ok = await boot(router, {
    origin: "dsh-app://desktop",
    "x-dsh-studio-nonce": "nonce-123",
  });
  assert.equal(ok.statusCode, 200);
  assert.match(ok.body, /"token":"token"/);
});

test("same-origin boot still goes through connection.admit", async () => {
  assert.equal((await boot(makeRouter({ admit: false }), {})).statusCode, 401);
  assert.equal((await boot(makeRouter({ admit: true }), {})).statusCode, 200);
});

test("preserves a newer studio.json instead of seeding it", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-schema-newer-"));
  const file = path.join(dir, "studio.json");
  const original = `${JSON.stringify({ schemaVersion: 999, projects: [] })}\n`;
  try {
    await writeFile(file, original, "utf8");
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    assert.match(store.getWarning() ?? "", /高于当前支持/);
    assert.equal(await readFile(file, "utf8"), original);
    await assert.rejects(() => store.bootstrap());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("binds done and merge proposal to the latest code run commit", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-bind-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: dir });
    const task = await store.createTask({
      title: "绑定提交",
      acceptance: ["完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "code", {
      path: dir,
      branch: "studio/bind",
      baseSha: "base-sha",
    });
    await store.completeRun(run.id, {
      output: "ok",
      receipt: {
        summary: "完成",
        evidence: ["测试通过"],
        artifacts: [],
        decisions: [],
        contractDeltas: [],
        rejectedOptions: [],
        blockers: [],
      },
      tokens: null,
      commitSha: "commit-sha",
    });
    await store.recordVerification(task.id, {
      command: "test",
      workdir: dir,
      exitCode: 0,
      output: "ok",
      passed: true,
      runId: "other-run",
    });
    await store.recordReview(task.id, {
      reviewerRoleId: data.roles[1].id,
      model: "test",
      verdict: "pass",
      summary: "通过",
      findings: [],
      tokens: null,
      runId: "other-run",
    });
    await store.updateTask(task.id, {
      acceptance: task.acceptance.map((item) => ({ ...item, done: true })),
      evidence: [
        { id: "ev", text: "ok", createdAt: new Date().toISOString() },
      ],
    });
    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) => error.code === "review_required",
    );
    await store.recordReview(task.id, {
      reviewerRoleId: data.roles[1].id,
      model: "test",
      verdict: "pass",
      summary: "通过",
      findings: [],
      tokens: null,
      runId: run.id,
    });
    await store.transitionTask(task.id, "done");
    await assert.rejects(
      () =>
        store.createMergeProposal(task.id, {
          summary: "合并",
          rollback: "revert",
        }),
      (error) => error.code === "verification_stale",
    );
    await store.recordVerification(task.id, {
      command: "test",
      workdir: dir,
      exitCode: 0,
      output: "ok",
      passed: true,
      runId: run.id,
    });
    const proposal = await store.createMergeProposal(task.id, {
      summary: "合并",
      rollback: "revert",
    });
    assert.equal(proposal.sourceCommit, "commit-sha");
    assert.equal(proposal.baseCommit, "base-sha");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("requires repo-local git identity, not only global config", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "studio-identity-"));
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd: repo,
      windowsHide: true,
    });
    await assert.rejects(
      () => assertLocalGitIdentity(repo),
      (error) => error.code === "git_identity_required",
    );
    execFileSync("git", ["config", "--local", "user.name", "Local"], {
      cwd: repo,
    });
    execFileSync(
      "git",
      ["config", "--local", "user.email", "local@example.com"],
      { cwd: repo },
    );
    await assertLocalGitIdentity(repo);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("exports only the selected project and refuses same-id import", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "studio-slice-repo-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "studio-slice-data-"));
  const archive = path.join(os.tmpdir(), `studio-slice-${Date.now()}.tar.gz`);
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd: repo,
      windowsHide: true,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: repo,
    });
    await writeFile(path.join(repo, "README.md"), "hello\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: repo });
    execFileSync("git", ["commit", "-m", "init"], { cwd: repo });

    const store = new StudioStore({ dataDir });
    await store.init();
    const project = await store.createProject({
      name: "Slice A",
      description: "A",
      repoPath: repo,
    });
    await store.createProject({ name: "Slice B", description: "B" });

    const service = new ProjectBundleService(store);
    const bundle = await service.exportProject(project.id, "0.2.1-rc.5");
    await writeFile(archive, bundle.bytes);
    const entries = execFileSync("tar", ["-tzf", archive], {
      encoding: "utf8",
    });
    assert.match(entries, /project\.json/);
    assert.doesNotMatch(entries, /studio\.json/);
    const slice = JSON.parse(
      execFileSync("tar", ["-xOf", archive, "project.json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(slice.project.id, project.id);
    assert.ok(slice.projects === undefined);
    assert.ok(slice.tasks.every((task) => task.projectId === project.id));

    await assert.rejects(
      () => service.importProject(archive, path.join(repo, "..", "slice-target")),
      (error) => error.code === "project_conflict",
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
    await rm(archive, { force: true });
    await rm(path.join(repo, "..", "slice-target"), {
      recursive: true,
      force: true,
    });
  }
});
