import { randomUUID } from "node:crypto";

import type { ProviderProfile, Role, Workshop } from "../shared/types.js";
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

function buildPrompt(workshop: Workshop, role: Role): string {
  return [
    `你是「${role.name}」（${role.title || "参与角色"}）。`,
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
          await this.ctx.agentPresets.mount(agentCtx);
          agent.session.append("approval/policy", { policy: "never" });
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
          await this.ctx.agentPresets.mount(agentCtx);
          agent.session.append("approval/policy", { policy: "never" });
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
