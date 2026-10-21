import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore, StudioStoreError } from "../lib/store.js";

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dsh-studio-test-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    return await run(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readyTask(store, title = "合并测试任务") {
  const data = await store.bootstrap();
  const owner = data.roles[0];
  const reviewer = data.roles[1];
  assert.ok(owner && reviewer);
  let task = await store.createTask({
    title,
    acceptance: ["测试通过", "证据已记录"],
    ownerRoleId: owner.id,
    reviewerRoleId: reviewer.id,
    branch: "task/merge-test",
    priority: "P0",
  });
  await store.transitionTask(task.id, "ready");
  await store.transitionTask(task.id, "running");
  await store.transitionTask(task.id, "review");
  task = await store.updateTask(task.id, {
    acceptance: task.acceptance.map((item) => ({ ...item, done: true })),
    evidence: [
      {
        id: "",
        text: "pnpm test merge — 12 passed",
        createdAt: new Date().toISOString(),
      },
    ],
  });
  return store.transitionTask(task.id, "done");
}

test("seeds a demo project, roles, and tasks", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    assert.ok(data.project);
    assert.equal(data.project.name, "MOBA 垂直切片");
    assert.equal(data.projects.length, 1);
    assert.equal(data.roles.length, 4);
    assert.equal(data.tasks.length, 5);
    assert.equal(data.stats.total, 5);
    assert.ok(data.stats.acceptanceTotal > 0);
    assert.equal(data.features.independentPage, true);
  });
});

test("persists state across store instances", async () => {
  let taskId = "";
  await withStore(async (store, dir) => {
    const task = await store.createTask({
      title: "持久化任务",
      acceptance: ["重启后仍然存在"],
      priority: "P0",
    });
    taskId = task.id;
    const second = new StudioStore({ dataDir: dir });
    await second.init();
    const data = await second.bootstrap();
    assert.ok(data.tasks.some((item) => item.id === taskId));
  });
});

test("requires an acceptance item before a task can be created", async () => {
  await withStore(async (store) => {
    await assert.rejects(
      () => store.createTask({ title: "没有验收" }),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "acceptance_required",
    );
  });
});

test("blocks done until every acceptance item is complete", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const task = await store.createTask({
      title: "验收门禁",
      acceptance: ["测试通过", "证据已记录"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
    });

    await store.transitionTask(task.id, "ready");
    await store.transitionTask(task.id, "running");
    await store.transitionTask(task.id, "review");

    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "acceptance_incomplete",
    );

    const accepted = await store.updateTask(task.id, {
      acceptance: task.acceptance.map((item) => ({ ...item, done: true })),
    });
    assert.equal(accepted.acceptance.every((item) => item.done), true);

    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "evidence_required",
    );

    const withEvidence = await store.updateTask(task.id, {
      evidence: [
        {
          id: "",
          text: "pnpm test ability — 42 passed",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    assert.equal(withEvidence.evidence.length, 1);
    const done = await store.transitionTask(task.id, "done");
    assert.equal(done.status, "done");
  });
});

test("rejects an invalid transition", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const task = data.tasks.find((item) => item.status === "backlog");
    assert.ok(task);
    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "invalid_transition",
    );
  });
});

test("creates a project and switches the active project", async () => {
  await withStore(async (store) => {
    const project = await store.createProject({
      name: "第二个项目",
      description: "验证多项目切换",
    });
    const data = await store.bootstrap();
    assert.equal(data.activeProjectId, project.id);
    assert.equal(data.projects.length, 2);
    assert.equal(data.project?.name, "第二个项目");
    assert.equal(data.tasks.length, 0);
    assert.equal(data.roles.length, 0);
  });
});

test("requires an accepted task before proposing a merge", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const task = data.tasks.find((item) => item.id === "task-002");
    assert.ok(task);
    assert.equal(task.status, "review");
    await assert.rejects(
      () =>
        store.createMergeProposal(task.id, {
          summary: "test",
          rollback: "revert",
        }),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "task_not_accepted",
    );
  });
});

test("approves and records a merge proposal", async () => {
  await withStore(async (store) => {
    const task = await readyTask(store);
    const proposal = await store.createMergeProposal(task.id, {
      summary: "实现合并治理",
      rollback: "revert merge commit",
      risk: "medium",
      base: "main",
    });
    assert.equal(proposal.status, "review");
    assert.equal(proposal.branch, "task/merge-test");
    assert.equal(proposal.base, "main");

    const approved = await store.approveMergeProposal(proposal.id, "LGTM");
    assert.equal(approved.status, "approved");
    assert.equal(approved.reviewNote, "LGTM");

    const merged = await store.completeMergeProposal(proposal.id, "abc1234");
    assert.equal(merged.status, "merged");
    assert.equal(merged.mergeCommit, "abc1234");
    assert.ok(merged.mergedAt);

    const data = await store.bootstrap();
    assert.equal(data.stats.mergeReview, 0);
    assert.equal(data.stats.mergeApproved, 0);
    assert.equal(data.stats.mergeMerged, 1);
    await assert.rejects(
      () =>
        store.createMergeProposal(task.id, {
          summary: "duplicate",
          rollback: "revert",
        }),
      (error) =>
        error instanceof StudioStoreError && error.code === "merge_exists",
    );
  });
});

test("rejecting a merge returns the task to execution", async () => {
  await withStore(async (store) => {
    const task = await readyTask(store);
    const proposal = await store.createMergeProposal(task.id, {
      summary: "需要返工",
      rollback: "revert",
      risk: "high",
    });
    const rejected = await store.rejectMergeProposal(
      proposal.id,
      "契约测试未通过",
    );
    assert.equal(rejected.status, "rejected");
    assert.match(rejected.reviewNote, /契约测试/);

    const data = await store.bootstrap();
    const updated = data.tasks.find((item) => item.id === task.id);
    assert.equal(updated?.status, "running");
    assert.equal(data.stats.mergeReview, 0);
    assert.deepEqual(data.mergeProposals.map((item) => item.status), [
      "rejected",
    ]);
  });
});

test("builds the company-level owner dashboard", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const company = data.company;
    assert.equal(company.totals.projects, 1);
    assert.equal(company.totals.activeProjects, 1);
    assert.equal(company.totals.tasks, 5);
    assert.equal(company.projects.length, 1);
    assert.equal(company.projects[0].health, "attention");
    assert.ok(company.needs.some((need) => need.kind === "missing_evidence"));
    assert.ok(company.roles.some((role) => role.roleName === "Builder"));
    assert.ok(company.recentEvents.length > 0);
    assert.ok(company.totals.acceptanceTotal > 0);
  });
});

test("includes an empty project in the company portfolio", async () => {
  await withStore(async (store) => {
    const project = await store.createProject({ name: "空项目" });
    const data = await store.bootstrap();
    assert.equal(data.company.totals.projects, 2);
    assert.ok(
      data.company.needs.some(
        (need) =>
          need.kind === "project_setup" && need.projectId === project.id,
      ),
    );
    assert.ok(
      data.company.projects.some(
        (summary) => summary.project.id === project.id,
      ),
    );
  });
});

test("surfaces a pending merge in the owner inbox", async () => {
  await withStore(async (store) => {
    const task = await readyTask(store);
    await store.createMergeProposal(task.id, {
      summary: "合并治理",
      rollback: "revert",
      risk: "high",
    });
    const data = await store.bootstrap();
    assert.equal(data.company.totals.mergePending, 1);
    assert.ok(
      data.company.needs.some(
        (need) => need.kind === "merge_review" && need.taskId === task.id,
      ),
    );
    assert.ok(data.company.risk.missingEvidence >= 1);
  });
});

test("migrates a schema v1 file by adding merge proposals", async () => {
  await withStore(async (store, dir) => {
    const file = path.join(dir, "studio.json");
    const state = JSON.parse(await readFile(file, "utf8"));
    delete state.mergeProposals;
    state.schemaVersion = 1;
    await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const migratedStore = new StudioStore({ dataDir: dir });
    await migratedStore.init();
    const data = await migratedStore.bootstrap();
    assert.deepEqual(data.mergeProposals, []);
    const migrated = JSON.parse(await readFile(file, "utf8"));
    assert.equal(migrated.schemaVersion, 2);
  });
});
