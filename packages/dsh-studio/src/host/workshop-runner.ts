import { randomUUID } from "node:crypto";

import type { ProviderProfile, Role, Workshop } from "../shared/types.js";
import { bindStudioRuntime, STUDIO_REVIEW_POLICY } from "./dispatcher.js";
import type { AgentHandleLike, DispatcherContext } from "./dispatcher.js";
import type { StudioStore } from "./store.js";

interface WorkshopOutput {
  role: Role;
  summary: string;
  objections: string[];
  risks: string[];
  recommendation: string;
  tokens: number | null;
}

function assistantText(
  messages: Array<{
    role: string;
    content: Array<{ type: string; text?: string }>;
  }>,
): string {
  const assistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (assistant === undefined) return "";
  return assistant.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  const raw = candidate
    .slice(start, end + 1)
    .replace(/"(?:\\.|[^"\\])*"/g, (match) =>
      match.replace(/\r?\n/g, "\\n"),
    );
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const PERSPECTIVE_LABELS: Record<string, string> = {
  experience: "玩家体验",
  competitor: "竞品分析",
  feasibility: "技术可行性",
  contrarian: "反方/唱反调",
};

function perspectiveOf(workshop: Workshop, roleId: string): string {
  const perspective = workshop.participantPerspectives.find(
    (item) => item.roleId === roleId,
  )?.perspective;
  return PERSPECTIVE_LABELS[perspective ?? "experience"] ?? "玩家体验";
}

function buildPrompt(workshop: Workshop, role: Role): string {
  return [
    `你是「${role.name}」（${role.title || "参与角色"}）。`,
    `你的会议视角：${perspectiveOf(workshop, role.id)}`,
    `研讨会主题：${workshop.title}`,
    workshop.topic ? `议题：${workshop.topic}` : "",
    `项目阶段：${workshop.stage}`,
    "",
    "这是一次独立评审。你看不到其他参与者的意见；不要假设他们同意你。",
    "不要修改文件，不要执行 merge，不要替 Owner 做最终决策。",
    "",
    "请只返回 JSON，不要 Markdown：",
    '{"summary":"你的结论与理由","objections":["反对意见"],"risks":["风险"],"recommendation":"建议"}',
    "JSON 字符串内不要出现真实换行；需要分段时用空格或分号。",
    "",
    "如果信息不足，在 summary 中明确写出缺失信息，不要编造。",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export class WorkshopRunner {
  private readonly store: StudioStore;
  private readonly ctx: DispatcherContext;

  constructor(store: StudioStore, ctx: DispatcherContext) {
    this.store = store;
    this.ctx = ctx;
  }

  async run(workshopId: string): Promise<Workshop> {
    const context = await this.store.getWorkshopContext(workshopId);
    if (
      context.workshop.status === "decided" ||
      context.workshop.status === "cancelled"
    ) {
      throw new Error("研讨会已经结束，不能再运行 AI 评审");
    }
    const settled = await Promise.allSettled(
      context.roles.map((role) =>
        this.ask(
          context.workshop,
          context.project.repoPath,
          role,
          context.providerProfiles.find(
            (profile) => profile.id === role.providerProfileId,
          ) ?? null,
        ),
      ),
    );
    for (const [index, result] of settled.entries()) {
      const role = context.roles[index];
      if (role === undefined) continue;
      if (result.status === "fulfilled") {
        await this.store.addWorkshopNote(workshopId, {
          roleId: role.id,
          summary: result.value.summary,
          objections: result.value.objections,
          risks: result.value.risks,
          recommendation: result.value.recommendation,
        });
      } else {
        await this.store.addWorkshopNote(workshopId, {
          roleId: role.id,
          summary: `AI 评审失败：${
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          }`,
          objections: [],
          risks: ["该角色的意见缺失，不能视为同意。"],
          recommendation: "",
        });
      }
    }
    return (await this.store.getWorkshopContext(workshopId)).workshop;
  }

  async summarize(workshopId: string): Promise<Workshop> {
    const context = await this.store.getWorkshopContext(workshopId);
    if (context.workshop.notes.length === 0) {
      throw new Error("至少需要一条参与者意见才能生成汇总");
    }
    const role = context.roles[0];
    const profile =
      role === undefined
        ? null
        : (context.providerProfiles.find(
            (item) => item.id === role.providerProfileId,
          ) ?? null);
    const selection =
      role === undefined
        ? this.ctx.agentDefaultModel.currentSelection()
        : await this.resolveModel(role, profile);
    const noteText = context.workshop.notes
      .map(
        (note) =>
          `## ${note.roleName}\n${note.summary}\n反对：${note.objections.join("；")}\n风险：${note.risks.join("；")}\n建议：${note.recommendation}`,
      )
      .join("\n\n");
    const prompt = [
      "你是研讨会主持人。请汇总以下独立意见，不要替 Owner 做最终决策。",
      `主题：${context.workshop.title}`,
      context.workshop.topic ? `议题：${context.workshop.topic}` : "",
      "",
      noteText,
      "",
      "只返回 JSON，不要 Markdown：",
      '{"consensus":["共识"],"disagreements":["分歧"],"openQuestions":["未决问题"],"candidates":["候选方案"]}',
      "保留分歧，不要强行统一；不要编造未出现的信息。",
    ]
      .filter((line) => line !== "")
      .join("\n");
    let handle: AgentHandleLike | null = null;
    try {
      handle = await this.ctx.agents.create({
        sessionId: `workshop-summary-${randomUUID()}`,
        meta: { cwd: context.project.repoPath ?? process.cwd() },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          await bindStudioRuntime(this.ctx, agentCtx, agent, STUDIO_REVIEW_POLICY);
        },
      });
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: prompt }],
        source: { kind: "user" },
      });
      const deadline = Date.now() + 120_000;
      let output = "";
      while (Date.now() < deadline) {
        output = assistantText(handle.agent.session.deriveMessages());
        if (handle.agent.status === "idle" && output !== "") break;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (output === "") throw new Error("Agent 在 120 秒内没有产出汇总");
      const record = extractJson(output);
      return this.store.setWorkshopAiSummary(workshopId, {
        consensus: strings(record.consensus),
        disagreements: strings(record.disagreements),
        openQuestions: strings(record.openQuestions),
        candidates: strings(record.candidates),
        generatedAt: new Date().toISOString(),
        model: selection.model,
      });
    } finally {
      await handle?.dispose().catch(() => undefined);
    }
  }


  async say(
    workshopId: string,
    targetRoleId: string,
    ownerMessage: string,
  ): Promise<Workshop> {
    const context = await this.store.getWorkshopContext(workshopId);
    const role = context.roles.find((item) => item.id === targetRoleId);
    if (role === undefined) throw new Error("参会角色不存在");
    const profile =
      context.providerProfiles.find(
        (item) => item.id === role.providerProfileId,
      ) ?? null;
    const prompt = [
      `你是「${role.name}」（${role.title || "参会角色"}）。`,
      `你的会议视角：${perspectiveOf(context.workshop, role.id)}`,
      `会议：${context.workshop.title}`,
      context.workshop.topic ? `议题：${context.workshop.topic}` : "",
      "你正在参加一场由 Owner 主持的会议。以下是公开会议记录。",
      "你看不到其他人的单聊，也不要假设他们同意你。",
      "只回复你的观点；不要修改文件、不要执行命令、不要替 Owner 决策。",
      "公开记录：",
      this.transcript(context.workshop),
      "",
      "Owner 刚刚说：",
      ownerMessage,
      "",
      "请直接回答 Owner 点名的问题，控制在 800 字以内。",
    ]
      .filter((line) => line !== "")
      .join("\n");
    const output = await this.runText(context.project.repoPath, role, profile, prompt);
    await this.store.addWorkshopMessage(workshopId, {
      roleId: role.id,
      roleName: role.name,
      content: output,
    });
    return (await this.store.getWorkshopContext(workshopId)).workshop;
  }

  async sideSay(
    workshopId: string,
    targetRoleId: string,
    ownerMessage: string,
  ): Promise<Workshop> {
    const context = await this.store.getWorkshopContext(workshopId);
    const role = context.roles.find((item) => item.id === targetRoleId);
    if (role === undefined) throw new Error("参会角色不存在");
    const profile =
      context.providerProfiles.find(
        (item) => item.id === role.providerProfileId,
      ) ?? null;
    const chat = context.workshop.sideChats.find(
      (item) => item.roleId === targetRoleId,
    );
    const sideText =
      chat?.messages
        .map((message) => `${message.roleName}：${message.content}`)
        .join("\n") ?? "";
    const prompt = [
      `你是「${role.name}」（${role.title || "参会角色"}）。`,
      `你的会议视角：${perspectiveOf(context.workshop, role.id)}`,
      `会议：${context.workshop.title}`,
      context.workshop.topic ? `议题：${context.workshop.topic}` : "",
      "这是 Owner 与你的单独沟通，不会自动进入公开会议记录。",
      "公开会议记录仅供你理解上下文；不要引用你未看到的单聊。",
      this.transcript(context.workshop),
      "",
      sideText ? `你们之前的单聊：\n${sideText}` : "",
      "",
      `Owner 私下对你说：\n${ownerMessage}`,
      "",
      "直接回答 Owner，控制在 600 字以内。",
    ]
      .filter((line) => line !== "")
      .join("\n");
    const output = await this.runText(context.project.repoPath, role, profile, prompt);
    await this.store.addWorkshopSideMessage(workshopId, targetRoleId, {
      roleName: role.name,
      content: output,
    });
    return (await this.store.getWorkshopContext(workshopId)).workshop;
  }

  async summarizeMeeting(workshopId: string): Promise<Workshop> {
    const context = await this.store.getWorkshopContext(workshopId);
    const role = context.roles[0];
    if (role === undefined) throw new Error("会议没有参会角色");
    const profile =
      context.providerProfiles.find(
        (item) => item.id === role.providerProfileId,
      ) ?? null;
    const prompt = [
      "你是会议记录员。请汇总公开会议记录，不要替 Owner 做最终决策。",
      `会议：${context.workshop.title}`,
      context.workshop.topic ? `议题：${context.workshop.topic}` : "",
      "议程：",
      context.workshop.agenda
        .map((item) => `- [${item.status}] ${item.text}`)
        .join("\n") || "（无）",
      "",
      "公开记录：",
      this.transcript(context.workshop),
      "",
      "只返回 JSON，不要 Markdown：",
      '{"consensus":["共识"],"disagreements":["分歧"],"openQuestions":["未决问题"],"decisionDraft":"建议 Owner 决定的草案"}',
      "必须保留分歧；如果确实没有分歧，在 disagreements 中写「无分歧（需 Owner 复核）」。",
    ]
      .filter((line) => line !== "")
      .join("\n");
    const output = await this.runText(context.project.repoPath, role, profile, prompt);
    const record = extractJson(output);
    return this.store.saveWorkshopMinutes(
      workshopId,
      {
        consensus: strings(record.consensus),
        disagreements: strings(record.disagreements),
        openQuestions: strings(record.openQuestions),
        decisionDraft: text(record.decisionDraft),
        noDisagreementReason:
          strings(record.disagreements).length === 0
            ? "AI 未识别到分歧，需 Owner 复核"
            : null,
      },
      role.model ?? null,
      false,
    );
  }

  private transcript(workshop: Workshop): string {
    return workshop.messages
      .map((message) => `${message.roleName}：${message.content}`)
      .join("\n");
  }

  private async runText(
    repoPath: string | null,
    role: Role,
    profile: ProviderProfile | null,
    prompt: string,
  ): Promise<string> {
    const selection = await this.resolveModel(role, profile);
    let handle: AgentHandleLike | null = null;
    try {
      handle = await this.ctx.agents.create({
        sessionId: `meeting-${randomUUID()}`,
        meta: { cwd: repoPath ?? process.cwd() },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          await bindStudioRuntime(this.ctx, agentCtx, agent, STUDIO_REVIEW_POLICY);
        },
      });
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: prompt }],
        source: { kind: "user" },
      });
      const deadline = Date.now() + 120_000;
      let output = "";
      while (Date.now() < deadline) {
        output = assistantText(handle.agent.session.deriveMessages());
        if (handle.agent.status === "idle" && output !== "") break;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (output === "") throw new Error("参会角色在 120 秒内没有回复");
      return output;
    } finally {
      await handle?.dispose().catch(() => undefined);
    }
  }

  private async ask(
    workshop: Workshop,
    repoPath: string | null,
    role: Role,
    profile: ProviderProfile | null,
  ): Promise<WorkshopOutput> {
    const selection = await this.resolveModel(role, profile);
    let handle: AgentHandleLike | null = null;
    try {
      handle = await this.ctx.agents.create({
        sessionId: `workshop-${randomUUID()}`,
        meta: { cwd: repoPath ?? process.cwd() },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          await bindStudioRuntime(this.ctx, agentCtx, agent, STUDIO_REVIEW_POLICY);
        },
      });
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: buildPrompt(workshop, role) }],
        source: { kind: "user" },
      });
      const deadline = Date.now() + 120_000;
      let output = "";
      let idleTicks = 0;
      while (Date.now() < deadline) {
        output = assistantText(handle.agent.session.deriveMessages());
        if (handle.agent.status === "idle") {
          if (output !== "") break;
          idleTicks += 1;
          if (idleTicks >= 10) break;
        } else {
          idleTicks = 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (output === "") {
        throw new Error("Agent 在 120 秒内没有产出");
      }
      const measured = this.ctx.tokenMeter.measure(handle.agent.session);
      const record = extractJson(output);
      return {
        role,
        summary: text(record.summary) || output.slice(0, 4000),
        objections: strings(record.objections),
        risks: strings(record.risks),
        recommendation: text(record.recommendation),
        tokens:
          typeof measured.totalTokens === "number"
            ? measured.totalTokens
            : null,
      };
    } finally {
      await handle?.dispose().catch(() => undefined);
    }
  }

  private async resolveModel(
    role: Role,
    profile: ProviderProfile | null,
  ): Promise<{ provider: string; model: string }> {
    const fallback = this.ctx.agentDefaultModel.currentSelection();
    const wanted =
      (profile !== null && profile.model !== "" ? profile.model : undefined) ??
      role.model ??
      fallback.model;
    const preferred = profile?.provider ?? "";
    const providers = [...this.ctx.llm.listProviders()].sort((left, right) => {
      if (preferred !== "") {
        if (left.id === preferred) return -1;
        if (right.id === preferred) return 1;
      }
      const score = (id: string): number =>
        id === "deepseek-account" ? 0 : id === "deepseek-official" ? 2 : 1;
      return score(left.id) - score(right.id);
    });
    let first: { provider: string; model: string } | null = null;
    for (const provider of providers) {
      const models = await this.ctx.llm.listModels(provider.id);
      const exact = models.find((model) => model.id === wanted);
      if (exact !== undefined) {
        return { provider: provider.id, model: exact.id };
      }
      if (first === null && models.length > 0) {
        first = { provider: provider.id, model: models[0]?.id ?? wanted };
      }
    }
    if (first !== null) return first;
    throw new Error(`没有可用的模型路由（请求模型：${wanted}）`);
  }
}
