import { isProjectStage } from "../../shared/types.js";
import { StudioStoreError, newId, type StoreContext } from "./core.js";
import type {
  AddWorkshopNoteInput,
  CreatePrototypeDemoInput,
  CreateWorkshopInput,
  Project,
  PrototypeDemo,
  ProviderProfile,
  Role,
  UpdatePrototypeDemoInput,
  Workshop,
  WorkshopAgendaItem,
  WorkshopAiSummary,
  WorkshopMeetingType,
  WorkshopMessage,
  WorkshopMinutes,
  WorkshopMinutesInput,
  WorkshopNote,
  WorkshopSideChatInput,
  WorkshopSpeakInput,
  UpdateWorkshopMessageInput,
} from "../../shared/types.js";
import {
  optionalText,
  requiredText,
  textList,
} from "./inputs.js";
import { isPrototypeDemoResult } from "./validation.js";
import { findProject, findWorkshop, pickProject } from "./lookups.js";

export async function getWorkshopContext(
  ctx: StoreContext,workshopId: string): Promise<{
    workshop: Workshop;
    project: Project;
    roles: Role[];
    providerProfiles: ProviderProfile[];
  }> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const workshop = findWorkshop(state, workshopId);
      const project = findProject(state, workshop.projectId);
      const roles = state.roles.filter(
        (role) =>
          role.projectId === workshop.projectId &&
          workshop.participantRoleIds.includes(role.id),
      );
      const providerProfiles = state.providerProfiles.filter(
        (profile) =>
          profile.projectId === workshop.projectId &&
          roles.some((role) => role.providerProfileId === profile.id),
      );
      return {
        workshop: structuredClone(workshop),
        project: structuredClone(project),
        roles: structuredClone(roles),
        providerProfiles: structuredClone(providerProfiles),
      };
    });
  }

export async function createPrototypeDemo(
  ctx: StoreContext,
    input: CreatePrototypeDemoInput,
    projectId?: string,
  ): Promise<PrototypeDemo> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = pickProject(state, projectId);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      if (!isPrototypeDemoResult(input.result)) {
        throw new StudioStoreError(
          "invalid_input",
          "Demo 结果必须是 passed 或 failed",
        );
      }
      const at = ctx.now();
      const demo: PrototypeDemo = {
        id: newId("demo"),
        projectId: project.id,
        title: requiredText(input.title, "title", 200),
        entry: optionalText(input.entry, "entry", 1000),
        startCommand: optionalText(input.startCommand, "startCommand", 1000),
        steps: optionalText(input.steps, "steps", 8000),
        result: input.result,
        screenshotPath: optionalText(
          input.screenshotPath,
          "screenshotPath",
          1000,
        ),
        notes: optionalText(input.notes, "notes", 4000),
        recordedBy: "Owner",
        createdAt: at,
        updatedAt: at,
      };
      state.prototypeDemos.push(demo);
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "prototype.demo_recorded",
        at,
        projectId: project.id,
        payload: { demoId: demo.id, result: demo.result },
      });
      await ctx.save();
      return structuredClone(demo);
    });
  }

export async function updatePrototypeDemo(
  ctx: StoreContext,
    demoId: string,
    input: UpdatePrototypeDemoInput,
  ): Promise<PrototypeDemo> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const demo = state.prototypeDemos.find((item) => item.id === demoId);
      if (demo === undefined) {
        throw new StudioStoreError("demo_not_found", "Demo 记录不存在", 404);
      }
      if (input.title !== undefined) {
        demo.title = requiredText(input.title, "title", 200);
      }
      if (input.entry !== undefined) {
        demo.entry = optionalText(input.entry, "entry", 1000);
      }
      if (input.startCommand !== undefined) {
        demo.startCommand = optionalText(
          input.startCommand,
          "startCommand",
          1000,
        );
      }
      if (input.steps !== undefined) {
        demo.steps = optionalText(input.steps, "steps", 8000);
      }
      if (input.result !== undefined) {
        if (!isPrototypeDemoResult(input.result)) {
          throw new StudioStoreError(
            "invalid_input",
            "Demo 结果必须是 passed 或 failed",
          );
        }
        demo.result = input.result;
      }
      if (input.screenshotPath !== undefined) {
        demo.screenshotPath = optionalText(
          input.screenshotPath,
          "screenshotPath",
          1000,
        );
      }
      if (input.notes !== undefined) {
        demo.notes = optionalText(input.notes, "notes", 4000);
      }
      demo.updatedAt = ctx.now();
      state.updatedAt = demo.updatedAt;
      ctx.recordEvent(state, {
        type: "prototype.demo_updated",
        at: demo.updatedAt,
        projectId: demo.projectId,
        payload: { demoId: demo.id, result: demo.result },
      });
      await ctx.save();
      return structuredClone(demo);
    });
  }

export async function createWorkshop(
  ctx: StoreContext,input: CreateWorkshopInput): Promise<Workshop> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const roles = state.roles.filter((role) => role.projectId === project.id);
      const requested = Array.isArray(input.participantRoleIds)
        ? input.participantRoleIds
        : [];
      const participants = (
        requested.length === 0 ? roles.map((role) => role.id) : requested
      ).filter((roleId) =>
        roles.some((role) => role.id === roleId),
      );
      if (participants.length === 0) {
        throw new StudioStoreError(
          "participant_required",
          "研讨会至少需要一个参与角色",
        );
      }
      const meetingType: WorkshopMeetingType =
        input.meetingType === "prd" ||
        input.meetingType === "architecture" ||
        input.meetingType === "balance"
          ? input.meetingType
          : "custom";
      const agenda: WorkshopAgendaItem[] = (input.agenda ?? [])
        .map((text) => text.trim())
        .filter((text) => text !== "")
        .slice(0, 20)
        .map((text) => ({ id: newId("agenda"), text, status: "open" }));
      const at = ctx.now();
      const workshop: Workshop = {
        id: newId("workshop"),
        projectId: project.id,
        title: requiredText(input.title, "title", 200),
        topic: optionalText(input.topic, "topic", 4000),
        stage: isProjectStage(input.stage) ? input.stage : project.stage,
        status: "collecting",
        participantRoleIds: participants,
        meetingType,
        agenda,
        messages: [],
        sideChats: [],
        minutes: null,
        decisionId: null,
        settledAt: null,
        notes: [],
        aiSummary: null,
        synthesis: "",
        decision: "",
        decidedBy: "",
        decidedAt: null,
        createdAt: at,
        updatedAt: at,
      };
      state.workshops.push(workshop);
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "workshop.created",
        at,
        projectId: project.id,
        payload: { workshopId: workshop.id, participants },
      });
      await ctx.save();
      return structuredClone(workshop);
    });
  }

export async function addWorkshopNote(
  ctx: StoreContext,
    workshopId: string,
    input: AddWorkshopNoteInput,
  ): Promise<Workshop> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const workshop = findWorkshop(state, workshopId);
      if (workshop.status === "decided" || workshop.status === "cancelled") {
        throw new StudioStoreError(
          "workshop_closed",
          "已结束的研讨会不能再添加意见",
          409,
        );
      }
      const roleId = requiredText(input.roleId, "roleId", 120);
      const role = state.roles.find(
        (item) =>
          item.id === roleId && item.projectId === workshop.projectId,
      );
      if (
        role === undefined ||
        !workshop.participantRoleIds.includes(roleId)
      ) {
        throw new StudioStoreError(
          "participant_required",
          "该角色不是本次研讨会的参与者",
          409,
        );
      }
      const at = ctx.now();
      const note: WorkshopNote = {
        id: newId("note"),
        roleId,
        roleName: role.name,
        summary: requiredText(input.summary, "summary", 8000),
        objections: textList(input.objections, "objections", 20),
        risks: textList(input.risks, "risks", 20),
        recommendation: optionalText(
          input.recommendation,
          "recommendation",
          4000,
        ),
        createdAt: at,
      };
      const existing = workshop.notes.find((item) => item.roleId === roleId);
      if (existing === undefined) {
        workshop.notes.push(note);
      } else {
        workshop.notes = workshop.notes.map((item) =>
          item.roleId === roleId ? { ...note, id: item.id } : item,
        );
      }
      workshop.status = "collecting";
      workshop.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "workshop.note",
        at,
        projectId: workshop.projectId,
        payload: { workshopId, roleId },
      });
      await ctx.save();
      return structuredClone(workshop);
    });
  }


function appendMessage(
  workshop: Workshop,
  input: {
    roleId: string | null;
    roleName: string;
    kind: WorkshopMessage["kind"];
    content: string;
  },
  at: string,
): WorkshopMessage {
  const message: WorkshopMessage = {
    id: newId("msg"),
    roleId: input.roleId,
    roleName: input.roleName,
    kind: input.kind,
    content: input.content,
    originalContent: input.content,
    editedAt: null,
    createdAt: at,
  };
  workshop.messages.push(message);
  return message;
}

export async function addWorkshopMessage(
  ctx: StoreContext,
  workshopId: string,
  input: { roleId: string | null; roleName: string; content: string },
): Promise<WorkshopMessage> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const workshop = findWorkshop(state, workshopId);
    if (workshop.status === "decided" || workshop.status === "cancelled") {
      throw new StudioStoreError(
        "workshop_closed",
        "已结束的会议不能继续发言",
        409,
      );
    }
    const at = ctx.now();
    const message = appendMessage(
      workshop,
      {
        roleId: input.roleId,
        roleName: input.roleName,
        kind: input.roleId === null ? "owner" : "role",
        content: requiredText(input.content, "content", 12000),
      },
      at,
    );
    workshop.updatedAt = at;
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "workshop.message",
      at,
      projectId: workshop.projectId,
      payload: { workshopId, messageId: message.id, kind: message.kind },
    });
    await ctx.save();
    return structuredClone(message);
  });
}

export async function addWorkshopSideMessage(
  ctx: StoreContext,
  workshopId: string,
  roleId: string,
  input: WorkshopSideChatInput & { roleName: string },
): Promise<WorkshopMessage> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const workshop = findWorkshop(state, workshopId);
    if (!workshop.participantRoleIds.includes(roleId)) {
      throw new StudioStoreError("participant_required", "该角色不在会议中", 409);
    }
    const at = ctx.now();
    let chat = workshop.sideChats.find((item) => item.roleId === roleId);
    if (chat === undefined) {
      chat = { roleId, messages: [], updatedAt: at };
      workshop.sideChats.push(chat);
    }
    const message: WorkshopMessage = {
      id: newId("side"),
      roleId: roleId,
      roleName: input.roleName,
      kind: "role",
      content: requiredText(input.content, "content", 12000),
      originalContent: input.content,
      editedAt: null,
      createdAt: at,
    };
    chat.messages.push(message);
    chat.updatedAt = at;
    workshop.updatedAt = at;
    state.updatedAt = at;
    await ctx.save();
    return structuredClone(message);
  });
}

export async function addWorkshopSideOwnerMessage(
  ctx: StoreContext,
  workshopId: string,
  roleId: string,
  content: string,
): Promise<WorkshopMessage> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const workshop = findWorkshop(state, workshopId);
    if (!workshop.participantRoleIds.includes(roleId)) {
      throw new StudioStoreError("participant_required", "该角色不在会议中", 409);
    }
    const at = ctx.now();
    let chat = workshop.sideChats.find((item) => item.roleId === roleId);
    if (chat === undefined) {
      chat = { roleId, messages: [], updatedAt: at };
      workshop.sideChats.push(chat);
    }
    const message: WorkshopMessage = {
      id: newId("side"),
      roleId: null,
      roleName: "Owner",
      kind: "owner",
      content: requiredText(content, "content", 12000),
      originalContent: content,
      editedAt: null,
      createdAt: at,
    };
    chat.messages.push(message);
    chat.updatedAt = at;
    workshop.updatedAt = at;
    state.updatedAt = at;
    await ctx.save();
    return structuredClone(message);
  });
}

export async function updateWorkshopMessage(
  ctx: StoreContext,
  workshopId: string,
  messageId: string,
  input: UpdateWorkshopMessageInput,
): Promise<Workshop> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const workshop = findWorkshop(state, workshopId);
    const everywhere = [
      ...workshop.messages,
      ...workshop.sideChats.flatMap((chat) => chat.messages),
    ];
    const message = everywhere.find((item) => item.id === messageId);
    if (message === undefined) {
      throw new StudioStoreError("message_not_found", "发言不存在", 404);
    }
    const at = ctx.now();
    message.content = requiredText(input.content, "content", 12000);
    message.editedAt = at;
    workshop.updatedAt = at;
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "workshop.message_edited",
      at,
      projectId: workshop.projectId,
      payload: { workshopId, messageId },
    });
    await ctx.save();
    return structuredClone(workshop);
  });
}

export async function setWorkshopAgenda(
  ctx: StoreContext,
  workshopId: string,
  items: Array<{ id: string; status: WorkshopAgendaItem["status"] }>,
): Promise<Workshop> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const workshop = findWorkshop(state, workshopId);
    for (const update of items) {
      const item = workshop.agenda.find((entry) => entry.id === update.id);
      if (item !== undefined) item.status = update.status;
    }
    workshop.updatedAt = ctx.now();
    state.updatedAt = workshop.updatedAt;
    await ctx.save();
    return structuredClone(workshop);
  });
}

export async function settleWorkshop(
  ctx: StoreContext,
  workshopId: string,
): Promise<Workshop> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const workshop = findWorkshop(state, workshopId);
    if (workshop.messages.length === 0 && workshop.notes.length === 0) {
      throw new StudioStoreError("meeting_empty", "会议还没有任何发言", 409);
    }
    if (workshop.agenda.some((item) => item.status === "open")) {
      throw new StudioStoreError(
        "agenda_open",
        "还有议程未关闭；请关闭或标记为暂不解决后再结束会议",
        409,
      );
    }
    const at = ctx.now();
    workshop.status = "settled";
    workshop.settledAt = at;
    workshop.updatedAt = at;
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "workshop.settled",
      at,
      projectId: workshop.projectId,
      payload: { workshopId },
    });
    await ctx.save();
    return structuredClone(workshop);
  });
}

export async function saveWorkshopMinutes(
  ctx: StoreContext,
  workshopId: string,
  input: WorkshopMinutesInput,
  model: string | null = null,
  editedByOwner = true,
): Promise<Workshop> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const workshop = findWorkshop(state, workshopId);
    const at = ctx.now();
    const minutes: WorkshopMinutes = {
      consensus: textList(input.consensus, "consensus", 30),
      disagreements: textList(input.disagreements, "disagreements", 30),
      openQuestions: textList(input.openQuestions, "openQuestions", 30),
      decisionDraft: input.decisionDraft?.trim() ?? "",
      savedAt: at,
      model,
      editedByOwner,
    };
    workshop.minutes = minutes;
    workshop.synthesis = minutes.decisionDraft;
    workshop.updatedAt = at;
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "workshop.minutes_saved",
      at,
      projectId: workshop.projectId,
      payload: { workshopId },
    });
    await ctx.save();
    return structuredClone(workshop);
  });
}

export async function createWorkshopDecision(
  ctx: StoreContext,
  workshopId: string,
): Promise<Workshop> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const workshop = findWorkshop(state, workshopId);
    if (workshop.minutes === null) {
      throw new StudioStoreError(
        "minutes_required",
        "先保存会议纪要，再生成决策草案",
        409,
      );
    }
    if (workshop.decisionId !== null) {
      throw new StudioStoreError(
        "decision_exists",
        "这场会议已经生成过决策草案",
        409,
      );
    }
    const at = ctx.now();
    const decision = {
      id: newId("decision"),
      projectId: workshop.projectId,
      taskId: null,
      runId: null,
      title: "会议决策：" + workshop.title.slice(0, 190),
      context: [
        workshop.topic,
        workshop.minutes.disagreements.length > 0
          ? "分歧：" + workshop.minutes.disagreements.join("；")
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      options: [],
      recommendation: workshop.minutes.decisionDraft,
      reversible: true,
      adrDraft: null,
      adrPath: null,
      status: "pending" as const,
      decision: "",
      note: "",
      decidedBy: "",
      tokenCost: null,
      createdAt: at,
      decidedAt: null,
    };
    state.decisions.push(decision);
    workshop.decisionId = decision.id;
    workshop.updatedAt = at;
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "workshop.decision_draft",
      at,
      projectId: workshop.projectId,
      payload: { workshopId, decisionId: decision.id },
    });
    await ctx.save();
    return structuredClone(workshop);
  });
}

export async function setWorkshopAiSummary(
  ctx: StoreContext,
    workshopId: string,
    summary: WorkshopAiSummary,
  ): Promise<Workshop> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const workshop = findWorkshop(state, workshopId);
      if (workshop.notes.length === 0) {
        throw new StudioStoreError(
          "workshop_empty",
          "至少需要一条参与者意见才能生成汇总",
          409,
        );
      }
      const at = ctx.now();
      workshop.aiSummary = {
        consensus: textList(summary.consensus, "consensus", 20),
        disagreements: textList(
          summary.disagreements,
          "disagreements",
          20,
        ),
        openQuestions: textList(
          summary.openQuestions,
          "openQuestions",
          20,
        ),
        candidates: textList(summary.candidates, "candidates", 20),
        generatedAt: summary.generatedAt || at,
        model: summary.model,
      };
      workshop.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "workshop.ai_summary",
        at,
        projectId: workshop.projectId,
        payload: { workshopId },
      });
      await ctx.save();
      return structuredClone(workshop);
    });
  }

export async function synthesizeWorkshop(
  ctx: StoreContext,
    workshopId: string,
    synthesis: string,
  ): Promise<Workshop> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const workshop = findWorkshop(state, workshopId);
      if (workshop.notes.length === 0) {
        throw new StudioStoreError(
          "workshop_empty",
          "至少需要一条参与者意见才能汇总",
          409,
        );
      }
      const at = ctx.now();
      workshop.synthesis = requiredText(synthesis, "synthesis", 12000);
      workshop.status = "synthesized";
      workshop.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "workshop.synthesized",
        at,
        projectId: workshop.projectId,
        payload: { workshopId },
      });
      await ctx.save();
      return structuredClone(workshop);
    });
  }

export async function decideWorkshop(
  ctx: StoreContext,
    workshopId: string,
    decision: string,
  ): Promise<Workshop> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const workshop = findWorkshop(state, workshopId);
      if (workshop.synthesis.trim() === "") {
        throw new StudioStoreError(
          "workshop_synthesis_required",
          "先汇总参与者意见，再记录 Owner 决策",
          409,
        );
      }
      const at = ctx.now();
      workshop.decision = requiredText(decision, "decision", 12000);
      workshop.status = "decided";
      workshop.decidedBy = "Owner";
      workshop.decidedAt = at;
      workshop.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "workshop.decided",
        at,
        projectId: workshop.projectId,
        payload: { workshopId },
      });
      await ctx.save();
      return structuredClone(workshop);
    });
  }

