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

test("dispatches an agent run, records tokens, and moves the task to review", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const task = await store.createTask({
      title: "派单任务",
      acceptance: ["回执可读"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "分析这个任务");
    assert.equal(run.status, "queued");
    const running = await store.bootstrap();
    assert.equal(
      running.tasks.find((item) => item.id === task.id)?.status,
      "running",
    );
    assert.equal(running.runs.length, 1);

    const completed = await store.completeRun(run.id, {
      output: '{"summary":"完成分析"}',
      receipt: {
        summary: "完成分析",
        evidence: ["pnpm test — 17 passed"],
        artifacts: [],
        decisions: [],
        contractDeltas: [],
        rejectedOptions: [],
        blockers: [],
      },
      tokens: 123,
    });
    assert.equal(completed.status, "succeeded");
    const after = await store.bootstrap();
    const updated = after.tasks.find((item) => item.id === task.id);
    assert.equal(updated?.status, "review");
    assert.equal(updated?.evidence.length, 1);
    assert.equal(after.runs[0].tokens, 123);
    assert.equal(after.company.totals.tokensUsed, 123);
  });
});

test("keeps a task out of review when the receipt is incomplete", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const task = await store.createTask({
      title: "缺证据回执",
      acceptance: ["回执完整"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "测试");
    const completed = await store.completeRun(run.id, {
      output: "{}",
      receipt: {
        summary: "",
        evidence: [],
        artifacts: [],
        decisions: [],
        contractDeltas: [],
        rejectedOptions: [],
        blockers: ["没有证据"],
      },
      tokens: 5,
    });
    assert.equal(completed.status, "failed");
    assert.match(completed.error ?? "", /回执不完整/);
    const after = await store.bootstrap();
    assert.equal(
      after.tasks.find((item) => item.id === task.id)?.status,
      "ready",
    );
    assert.equal(after.tasks.find((item) => item.id === task.id)?.evidence.length, 0);
  });
});

test("rejects a run when the role token budget is exhausted", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    assert.ok(owner);
    const role = await store.updateRole(owner.id, { tokenBudget: 10 });
    const task = await store.createTask({
      title: "预算任务",
      acceptance: ["有回执"],
      ownerRoleId: role.id,
      reviewerRoleId: data.roles[1]?.id ?? null,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "预算测试");
    await store.completeRun(run.id, {
      output: "",
      receipt: null,
      tokens: 10,
    });
    const next = await store.createTask({
      title: "预算任务 2",
      acceptance: ["有回执"],
      ownerRoleId: role.id,
      reviewerRoleId: data.roles[1]?.id ?? null,
    });
    await store.transitionTask(next.id, "ready");
    await assert.rejects(
      () => store.beginRun(next.id, "再试一次"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "budget_exceeded",
    );
  });
});

test("creates and decides a boardroom decision", async () => {
  await withStore(async (store) => {
    const decision = await store.createDecision({
      title: "是否把 replay 纳入合并门禁？",
      context: "replay 还没有 CI 载体。",
      recommendation: "先做 replay v1，再入门禁。",
    });
    assert.equal(decision.status, "pending");
    const pending = await store.bootstrap();
    assert.equal(pending.company.totals.pendingDecisions, 1);
    assert.ok(
      pending.company.needs.some(
        (need) => need.kind === "decision" && need.title.includes("replay"),
      ),
    );

    const decided = await store.decideDecision(decision.id, {
      status: "approved",
      decision: "批准，先做 replay v1。",
      note: "Owner 拍板",
    });
    assert.equal(decided.status, "approved");
    assert.equal(decided.decidedBy, "Owner");
    const after = await store.bootstrap();
    assert.equal(after.company.totals.pendingDecisions, 0);
    assert.equal(after.company.totals.decidedDecisions, 1);
    await assert.rejects(
      () =>
        store.decideDecision(decision.id, {
          status: "rejected",
          decision: "重复",
        }),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "decision_decided",
    );
  });
});

test("promotes project-scope agent decisions into the boardroom", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const task = await store.createTask({
      title: "决策任务",
      acceptance: ["有回执"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "提出项目级决策");
    await store.completeRun(run.id, {
      output: "{}",
      receipt: {
        summary: "需要 Owner 裁决",
        evidence: ["已检查"],
        artifacts: [],
        decisions: [
          {
            title: "是否引入 replay 门禁",
            rationale: "影响所有合并",
            scope: "project",
          },
          {
            title: "本轮实现细节",
            rationale: "仅本支线",
            scope: "branch",
          },
        ],
        contractDeltas: [],
        rejectedOptions: [],
        blockers: [],
      },
      tokens: 10,
    });
    const after = await store.bootstrap();
    assert.equal(after.decisions.length, 1);
    assert.equal(after.decisions[0].status, "pending");
    assert.equal(after.decisions[0].title, "是否引入 replay 门禁");
    assert.equal(after.decisions[0].runId, run.id);
    assert.equal(after.company.totals.pendingDecisions, 1);
  });
});

test("escalates a cross-branch contract conflict to the boardroom", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);

    const makeRun = async (title, branch, change) => {
      const task = await store.createTask({
        title,
        acceptance: ["有回执"],
        ownerRoleId: owner.id,
        reviewerRoleId: reviewer.id,
        branch,
      });
      await store.transitionTask(task.id, "ready");
      const run = await store.beginRun(task.id, "检查契约");
      await store.completeRun(run.id, {
        output: "{}",
        receipt: {
          summary: `${title} 完成`,
          evidence: ["检查完成"],
          artifacts: [],
          decisions: [],
          contractDeltas: [
            { contract: "docs/contracts/replay-v1.md", change },
          ],
          rejectedOptions: [],
          blockers: [],
        },
        tokens: 10,
      });
      return { task, run };
    };

    const first = await makeRun(
      "支线 A",
      "task/branch-a",
      "A 采用 JSON schema",
    );
    const second = await makeRun(
      "支线 B",
      "task/branch-b",
      "B 采用二进制格式",
    );

    const after = await store.bootstrap();
    assert.ok(after.branches.length >= 2);
    assert.ok(after.branches.some((branch) => branch.taskId === first.task.id));
    assert.ok(after.branches.some((branch) => branch.taskId === second.task.id));
    assert.equal(after.contractChanges.length, 2);
    assert.equal(after.decisions.length, 1);
    assert.match(after.decisions[0].title, /契约冲突/);
    assert.equal(after.decisions[0].status, "pending");
    assert.equal(after.decisions[0].options.length, 2);
    assert.equal(after.decisions[0].runId, second.run.id);
    assert.equal(after.branches.find((b) => b.taskId === first.task.id)?.status, "review");
  });
});

test("blocks a task and escalates after two failed runs", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const task = await store.createTask({
      title: "连续失败任务",
      acceptance: ["有回执"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
      module: "combat",
      contractRef: "docs/contracts/combat.md",
      kind: "fix",
    });
    await store.transitionTask(task.id, "ready");
    for (let index = 0; index < 2; index += 1) {
      const run = await store.beginRun(task.id, "失败测试");
      await store.failRun(run.id, `failure ${String(index + 1)}`);
    }
    const after = await store.bootstrap();
    assert.equal(
      after.tasks.find((item) => item.id === task.id)?.status,
      "blocked",
    );
    assert.equal(after.decisions.length, 1);
    assert.match(after.decisions[0].title, /连续失败/);
    assert.equal(after.decisions[0].status, "pending");
    const resplit = after.tasks.find(
      (item) => item.originTaskId === task.id,
    );
    assert.ok(resplit);
    assert.equal(resplit.status, "backlog");
    assert.equal(resplit.kind, "fix");
    assert.equal(resplit.ownerRoleId, "role-architect");
  });
});

test("schedules an integration ticket every third completed task", async () => {
  await withStore(async (store) => {
    const first = await readyTask(store, "任务 A");
    const second = await readyTask(store, "任务 B");
    assert.ok(first.id && second.id);
    const after = await store.bootstrap();
    const auto = after.tasks.filter((task) =>
      task.title.startsWith("集成验收（自动 #"),
    );
    assert.equal(auto.length, 1);
    assert.equal(auto[0]?.integration, true);
    assert.equal(auto[0]?.status, "backlog");
    assert.equal(auto[0]?.ownerRoleId, "role-lead");
    assert.match(auto[0]?.goal ?? "", /人玩 10 分钟/);
    await readyTask(store, "任务 C");
    const afterMore = await store.bootstrap();
    assert.equal(
      afterMore.tasks.filter((task) =>
        task.title.startsWith("集成验收（自动 #"),
      ).length,
      1,
    );
  });
});

test("blocks a code run that edits the module contract", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const module = await store.createModule({
      name: "replay",
      responsibility: "replay 契约",
      contractPath: "docs/contracts/replay-v1.md",
      allowedPaths: ["src/replay.js"],
      forbiddenPaths: ["src/net/"],
    });
    const task = await store.createTask({
      title: "修改 replay 契约",
      acceptance: ["diff"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
      module: module.name,
      contractRef: module.contractPath,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "test");
    const violations = await store.enforceContractScope(task.id, run.id, [
      "docs/contracts/replay-v1.md",
      "src/net/client.js",
      "src/replay.js",
    ]);
    assert.deepEqual(violations, [
      "docs/contracts/replay-v1.md",
      "src/net/client.js",
    ]);
    const after = await store.bootstrap();
    assert.equal(
      after.tasks.find((item) => item.id === task.id)?.status,
      "blocked",
    );
    assert.equal(after.decisions.length, 1);
    assert.match(after.decisions[0].title, /契约越界/);
  });
});

test("requires an independent review before completing a code task", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: "D:\\AIgame" });
    const owner = data.roles[0];
    const reviewer = data.roles[1];
    assert.ok(owner && reviewer);
    const task = await store.createTask({
      title: "需要独立评审",
      acceptance: ["完成"],
      ownerRoleId: owner.id,
      reviewerRoleId: reviewer.id,
    });
    await store.transitionTask(task.id, "ready");
    const run = await store.beginRun(task.id, "code", {
      path: process.cwd(),
      branch: "studio/review-test",
    });
    await store.transitionTask(task.id, "review");
    await store.updateTask(task.id, {
      acceptance: [{ id: "acc-review", text: "完成", done: true }],
      evidence: [
        {
          id: "ev-review",
          text: "diff",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "review_required",
    );
    await store.recordReview(task.id, {
      reviewerRoleId: reviewer.id,
      model: "test-reviewer",
      verdict: "pass",
      summary: "diff 与验证一致",
      findings: [],
      tokens: 12,
      runId: run.id,
    });
    const done = await store.transitionTask(task.id, "done");
    assert.equal(done.status, "done");
  });
});

test("requires docs sync before completing a documented project task", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, {
      prdPath: "docs/PRD.md",
      invariantsPath: null,
      modulesPath: null,
    });
    const task = await store.createTask({
      title: "文档同步任务",
      acceptance: ["实现完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
    });
    await store.transitionTask(task.id, "ready");
    await store.transitionTask(task.id, "running");
    await store.transitionTask(task.id, "review");
    await store.updateTask(task.id, {
      acceptance: task.acceptance.map((item) => ({ ...item, done: true })),
      evidence: [
        {
          id: "ev-docs",
          text: "实现已完成",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await assert.rejects(
      () => store.transitionTask(task.id, "done"),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "docs_sync_required",
    );
    await store.updateTask(task.id, { docsSynced: true });
    const done = await store.transitionTask(task.id, "done");
    assert.equal(done.status, "done");
  });
});

test("requires a reason when approving an irreversible decision", async () => {
  await withStore(async (store) => {
    const decision = await store.createDecision({
      title: "切换网络同步方案",
      context: "不可逆架构选择",
      reversible: false,
    });
    await assert.rejects(
      () =>
        store.decideDecision(decision.id, {
          status: "approved",
          decision: "",
          note: "",
        }),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "decision_reason_required",
    );
    const decided = await store.decideDecision(decision.id, {
      status: "approved",
      decision: "选择状态同步，并写 ADR",
      note: "Owner 批准",
    });
    assert.equal(decided.status, "approved");
    assert.equal(decided.reversible, false);
    assert.match(decided.adrDraft ?? "", /# ADR: 切换网络同步方案/);
    assert.match(decided.adrDraft ?? "", /选择状态同步，并写 ADR/);
  });
});

test("escalates a failed post-merge regression once", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const task = await store.createTask({
      title: "回归失败任务",
      acceptance: ["完成"],
      ownerRoleId: data.roles[0].id,
      reviewerRoleId: data.roles[1].id,
    });
    const input = {
      taskId: task.id,
      proposalId: "merge-test",
      mergeCommit: "abc123",
      command: "npm test",
      exitCode: 1,
      output: "1 failing test",
    };
    const decision = await store.createPostMergeDecision(input);
    assert.ok(decision);
    assert.equal(decision.status, "pending");
    assert.match(decision.title, /合并后回归失败/);
    assert.match(decision.context, /abc123/);
    assert.match(decision.recommendation, /回滚|修复/);
    const duplicate = await store.createPostMergeDecision(input);
    assert.equal(duplicate, null);
  });
});

test("requires a passing verification before merging a code project", async () => {
  await withStore(async (store, dir) => {
    const data = await store.bootstrap();
    await store.updateProject(data.project.id, { repoPath: "D:\\AIgame" });
    const task = await readyTask(store, "需要验证的合并");
    await assert.rejects(
      () =>
        store.createMergeProposal(task.id, {
          summary: "合并",
          rollback: "revert",
        }),
      (error) =>
        error instanceof StudioStoreError &&
        error.code === "verification_required",
    );
    await store.recordVerification(task.id, {
      command: "npm test",
      workdir: dir,
      exitCode: 0,
      output: "ok",
      passed: true,
    });
    const proposal = await store.createMergeProposal(task.id, {
      summary: "合并",
      rollback: "revert",
    });
    assert.equal(proposal.status, "review");
    assert.ok(proposal.verificationId);
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
    assert.deepEqual(data.runs, []);
    assert.deepEqual(data.decisions, []);
    const migrated = JSON.parse(await readFile(file, "utf8"));
    assert.equal(migrated.schemaVersion, 15);
    assert.ok(migrated.runs.every((run) => run.status !== undefined));
    assert.ok(Array.isArray(migrated.reviews));
    assert.ok(Array.isArray(migrated.branches));
    assert.ok(Array.isArray(migrated.contractChanges));
    assert.ok(Array.isArray(migrated.verifications));
    assert.ok(
      migrated.projects.every(
        (project) =>
          project.repoPath === null &&
          project.prdPath === null &&
          project.invariantsPath === null &&
          project.modulesPath === null,
      ),
    );
    assert.ok(Array.isArray(migrated.modules));
    assert.ok(
      migrated.tasks.every(
        (task) =>
          task.verifyCommand === null &&
          task.module === null &&
          task.contractRef === null &&
          task.kind === "new" &&
          task.integration === false &&
          task.originTaskId === null &&
          task.docsSynced === false,
      ),
    );
  });
});
