import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StudioStore } from "../lib/store.js";

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-meeting-test-"));
  try {
    const store = new StudioStore({ dataDir: dir });
    await store.init();
    return await run(store);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("runs a meeting from agenda through minutes and decision draft", async () => {
  await withStore(async (store) => {
    const data = await store.bootstrap();
    const project = data.project;
    const roles = data.roles;
    assert.ok(project);
    assert.ok(roles.length >= 2);

    let workshop = await store.createWorkshop({
      title: "战斗体系评审",
      topic: "首切片战斗手感",
      meetingType: "balance",
      participantRoleIds: [roles[0].id, roles[1].id],
      agenda: ["验收判定是否过重", "冷却是否耦合"],
    });
    assert.equal(workshop.meetingType, "balance");
    assert.equal(workshop.agenda.length, 2);
    assert.equal(workshop.messages.length, 0);
    assert.equal(workshop.participantPerspectives.length, 2);
    const task = await store.createTask({
      title: "会议下游任务",
      acceptance: ["完成"],
      ownerRoleId: roles[0].id,
      reviewerRoleId: roles[1].id,
    });
    workshop = await store.linkWorkshopDownstream(workshop.id, {
      linkedTaskId: task.id,
    });
    assert.equal(workshop.linkedTaskId, task.id);

    const ownerMessage = await store.addWorkshopMessage(workshop.id, {
      roleId: null,
      roleName: "Owner",
      content: "验收角色觉得验收标准过重，@架构师 怎么看？",
    });
    assert.equal(ownerMessage.kind, "owner");

    const roleMessage = await store.addWorkshopMessage(workshop.id, {
      roleId: roles[0].id,
      roleName: roles[0].name,
      content: "建议把伤害结算拆成命中与护甲两步。",
    });
    await store.updateWorkshopMessage(workshop.id, roleMessage.id, {
      content: "建议把伤害结算拆成命中、护甲、减伤三步。",
    });

    await store.addWorkshopSideOwnerMessage(
      workshop.id,
      roles[0].id,
      "私下说，真正风险在同步。",
    );
    const sideReply = await store.addWorkshopSideMessage(
      workshop.id,
      roles[0].id,
      {
        roleName: roles[0].name,
        content: "同步是最大风险，建议先做单机。",
      },
    );
    assert.equal(sideReply.kind, "role");

    await assert.rejects(
      () => store.settleWorkshop(workshop.id),
      (error) => error.code === "agenda_open",
    );
    await store.setWorkshopAgenda(
      workshop.id,
      workshop.agenda.map((item) => ({
        id: item.id,
        status: "closed",
      })),
    );
    const settled = await store.settleWorkshop(workshop.id);
    assert.equal(settled.status, "settled");
    assert.ok(settled.settledAt !== null);

    await assert.rejects(
      () =>
        store.saveWorkshopMinutes(workshop.id, {
          consensus: ["无分歧"],
          disagreements: [],
          openQuestions: [],
          decisionDraft: "无",
        }),
      (error) => error.code === "disagreement_required",
    );
    const withReason = await store.saveWorkshopMinutes(workshop.id, {
      consensus: ["无分歧"],
      disagreements: [],
      openQuestions: [],
      decisionDraft: "无分歧",
      noDisagreementReason: "议题只涉及一个方案",
    });
    assert.equal(withReason.minutes?.noDisagreementReason, "议题只涉及一个方案");
    const withMinutes = await store.saveWorkshopMinutes(workshop.id, {
      consensus: ["先做单机切片"],
      disagreements: ["是否现在做同步"],
      openQuestions: ["同步方案"],
      decisionDraft: "首切片先单机，同步后置。",
    });
    assert.equal(withMinutes.minutes?.editedByOwner, true);

    const withDecision = await store.createWorkshopDecision(workshop.id);
    assert.ok(withDecision.decisionId !== null);
    const after = await store.bootstrap();
    const decision = after.decisions.find(
      (item) => item.id === withDecision.decisionId,
    );
    assert.ok(decision);
    assert.equal(decision.status, "pending");
    assert.match(decision.title, /战斗体系评审/);
  });
});
