import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  AgentExecutor,
  AgentReceipt,
  AgentRun,
  IndependentReview,
  Module,
  Project,
  ProviderProfile,
  Role,
  Task,
} from "../shared/types.js";
import type { StudioStore } from "./store.js";
import { WorkspaceManager } from "./workspace.js";
import type { TaskWorkspace } from "./workspace.js";

export interface MessageContent {
  type: string;
  text?: string;
}

export interface AgentMessage {
  role: string;
  content: MessageContent[];
}

export interface AgentLike {
  status: string;
  session: {
    id: string;
    deriveMessages(): AgentMessage[];
    append(type: string, data: unknown): void;
  };
  followup(message: {
    role?: "user";
    content: Array<{ type: "text"; text: string }>;
    source: { kind: "user" };
  }): unknown;
}

export interface AgentHandleLike {
  agent: AgentLike;
  dispose(): Promise<void>;
}

export interface AgentsLike {
  create(options: {
    sessionId: string;
    agentOptions?: { provider: string; model: string };
    meta: { cwd: string };
    setup?: (agentCtx: unknown, agent: AgentLike) => Promise<void>;
  }): Promise<AgentHandleLike>;
}

export interface AgentPresetsLike {
  mount(agentCtx: unknown, id?: string): Promise<{ id: string }>;
}

export interface AgentDefaultModelLike {
  currentSelection(): { provider: string; model: string };
}

export interface LlmLike {
  listProviders(): Array<{ id: string }>;
  listModels(providerId: string): Promise<Array<{ id: string }>>;
}

export interface TokenMeterLike {
  measure(session: unknown): { totalTokens: number };
}

export interface StudioApprovalLike {
  setPolicy?(agent: AgentLike, policy: "ask" | "never"): void;
}

export interface StudioSandboxPolicyLike {
  setSandboxMode?(session: AgentLike["session"], mode: "read-only" | "workspace-write"): void;
}

export interface DispatcherContext {
  agents: AgentsLike;
  agentPresets: AgentPresetsLike;
  agentDefaultModel: AgentDefaultModelLike;
  llm: LlmLike;
  tokenMeter: TokenMeterLike;
  approval?: StudioApprovalLike;
  sandboxPolicy?: StudioSandboxPolicyLike;
}

const WORKER_PRESET = "standard";
const WORKER_SANDBOX = "workspace-write" as const;
const REVIEW_SANDBOX = "read-only" as const;
const WORKER_RESTRICTED = [
  "subagent",
  "subagent_fork",
  "workflow",
  "ask_user_question",
  "create_goal",
  "update_goal",
  "get_goal",
  "schedule_create",
  "schedule_update",
  "schedule_delete",
  "schedule_list",
  "todo_write",
  "working_directory",
  "plugin_manager",
  "plugin_market",
  "cordis_inspect",
  "cordis_define",
  "cordis_mount",
  "cordis_unmount",
  "cordis_list",
  "cordis_read",
];
const REVIEW_RESTRICTED = [
  ...WORKER_RESTRICTED,
  "write",
  "edit",
  "pwsh",
  "bash",
  "present",
];

export const STUDIO_WORKER_POLICY = {
  sandboxMode: WORKER_SANDBOX,
  restrictedTools: WORKER_RESTRICTED,
} as const;

export const STUDIO_REVIEW_POLICY = {
  sandboxMode: REVIEW_SANDBOX,
  restrictedTools: REVIEW_RESTRICTED,
} as const;

interface StudioRuntime {
  agentPreset: string;
  approvalPolicy: "ask" | "never";
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  restrictedTools: string[];
}

export async function bindStudioRuntime(
  ctx: DispatcherContext,
  agentCtx: unknown,
  agent: AgentLike,
  options: {
    sandboxMode: "read-only" | "workspace-write";
    restrictedTools: string[];
  },
): Promise<StudioRuntime> {
  const mounted = await ctx.agentPresets.mount(agentCtx, WORKER_PRESET);
  if (mounted.id !== WORKER_PRESET) {
    throw new Error(`Agent preset mount returned ${mounted.id}, expected ${WORKER_PRESET}`);
  }
  if (ctx.approval?.setPolicy !== undefined) {
    ctx.approval.setPolicy(agent, "never");
  } else {
    agent.session.append("approval/policy", { policy: "never" });
  }
  if (ctx.sandboxPolicy?.setSandboxMode !== undefined) {
    ctx.sandboxPolicy.setSandboxMode(agent.session, options.sandboxMode);
  } else {
    agent.session.append("sandbox/mode", { mode: options.sandboxMode });
  }
  const tools = (agentCtx as { tools?: { restrict?(filter: { deny: string[] }): unknown } }).tools;
  if (tools?.restrict === undefined) {
    throw new Error(
      "tools.restrict unavailable; refusing to run without a tool boundary",
    );
  }
  tools.restrict({ deny: options.restrictedTools });
  return {
    agentPreset: WORKER_PRESET,
    approvalPolicy: "never",
    sandboxMode: options.sandboxMode,
    restrictedTools: [...options.restrictedTools],
  };
}

interface RunContext {
  task: Task;
  role: Role;
  project: Project;
  module: Module | null;
  providerProfile: ProviderProfile | null;
}

function changedFilesFromDiff(diffStat: string | null): string[] {
  if (diffStat === null) return [];
  return diffStat
    .split("\n")
    .map((line) => /^[ MARC?]{1,2} (\S.*)$/.exec(line)?.[1]?.trim() ?? "")
    .filter(Boolean);
}

function clipPatch(value: string | null): string | null {
  if (value === null || value.length <= 120_000) return value;
  return `${value.slice(0, 120_000)}\n… patch truncated by Host`;
}

function assistantText(messages: AgentMessage[]): string {
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

function balancedJsonAt(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

export function extractJsonObject(text: string): unknown {
  const fenced = [
    ...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
  ].map((match) => match[1] ?? "");
  const sources = [...fenced, text];
  for (const source of sources) {
    const starts: number[] = [];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "{") starts.push(index);
    }
    for (let index = starts.length - 1; index >= 0; index -= 1) {
      const start = starts[index];
      if (start === undefined) continue;
      const candidate = balancedJsonAt(source, start);
      if (candidate === null) continue;
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed)
        ) {
          return parsed;
        }
      } catch {
        // keep scanning; prose often contains unbalanced braces
      }
    }
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function objectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeReceipt(raw: unknown, fallback: string): AgentReceipt {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      summary: fallback.slice(0, 2000),
      evidence: [],
      artifacts: [],
      decisions: [],
      contractDeltas: [],
      rejectedOptions: [],
      blockers: ["模型没有返回可解析的 JSON 回执"],
    };
  }
  const record = raw as Record<string, unknown>;
  return {
    summary: textOf(record.summary) || fallback.slice(0, 2000),
    evidence: stringArray(record.evidence),
    artifacts: objectArray(record.artifacts)
      .map((item) => ({
        kind: textOf(item.kind) || "unknown",
        path: textOf(item.path),
      }))
      .filter((item) => item.path !== "")
      .slice(0, 20),
    decisions: objectArray(record.decisions)
      .map((item) => {
        const scope: "branch" | "project" =
          item.scope === "project" ? "project" : "branch";
        return {
          title: textOf(item.title),
          rationale: textOf(item.rationale),
          scope,
        };
      })
      .filter((item) => item.title !== "")
      .slice(0, 20),
    contractDeltas: objectArray(record.contractDeltas)
      .map((item) => ({
        contract: textOf(item.contract),
        change: textOf(item.change),
      }))
      .filter((item) => item.contract !== "")
      .slice(0, 20),
    rejectedOptions: objectArray(record.rejectedOptions)
      .map((item) => ({
        option: textOf(item.option),
        reason: textOf(item.reason),
      }))
      .filter((item) => item.option !== "")
      .slice(0, 20),
    blockers: stringArray(record.blockers),
  };
}

interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runCli(
  command: string,
  cwd: string,
  prompt: string,
  timeoutMs = 600_000,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", command]
        : ["-lc", command];
    const child = spawn(shell, args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: CliResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error(`外部执行器超过 ${String(timeoutMs / 1000)} 秒未完成`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      finish({ stdout, stderr, code: code ?? 1 });
    });
    child.stdin.end(prompt, "utf8");
  });
}

async function executeExternalCli(
  executor: AgentExecutor,
  prompt: string,
  workspace: TaskWorkspace,
): Promise<{ output: string; code: number; stderr: string }> {
  if (executor === "claude-code") {
    const result = await runCli(
      "claude -p --output-format json --permission-mode acceptEdits",
      workspace.path,
      prompt,
    );
    let output = result.stdout;
    try {
      const parsed: unknown = JSON.parse(result.stdout);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as { result?: unknown }).result === "string"
      ) {
        output = (parsed as { result: string }).result;
      }
    } catch {
      // Plain text is acceptable; receipt extraction still runs below.
    }
    return { output, code: result.code, stderr: result.stderr };
  }

  const temp = await mkdtemp(path.join(os.tmpdir(), "studio-codex-"));
  const messageFile = path.join(temp, "last-message.txt");
  try {
    const result = await runCli(
      `codex exec --json -s workspace-write --output-last-message "${messageFile}" -`,
      workspace.path,
      prompt,
    );
    let output = result.stdout;
    try {
      output = (await readFile(messageFile, "utf8")).trim() || output;
    } catch {
      // Fall back to stdout if Codex did not write the file.
    }
    return { output, code: result.code, stderr: result.stderr };
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined);
  }
}

function buildPrompt(
  context: RunContext,
  workspace?: TaskWorkspace,
): string {
  const { task, role, project } = context;
  const module = context.module;
  const acceptance = task.acceptance
    .map((item, index) => `${String(index + 1)}. ${item.text}`)
    .join("\n");
  const mode =
    workspace === undefined
      ? [
          "本轮只做分析/规划，不要修改任何文件，不要执行会改变系统状态的命令。",
        ]
      : [
          `代码执行模式：你已在独立 worktree 中工作。`,
          `仓库：${workspace.repoPath}`,
          `工作区：${workspace.path}`,
          `分支：${workspace.branch}`,
          "可以修改工作区文件、运行测试和构建；不要切换/删除 worktree，不要 merge、push 或修改主工作区。",
          "只修改模块/契约允许的范围；需要改契约本身时，在回执里提出 decision，不要直接改契约。",
          "完成后必须报告你实际运行过的命令和测试结果。",
        ];
  return [
    `你是 Studio 工作台里的角色「${role.name}」（${role.title || "未填写职位"}）。`,
    `角色使命：${role.mission || "未填写"}`,
    `职责：${role.responsibilities.join("；") || "未填写"}`,
    "",
    `项目：${project.name}`,
    project.description ? `项目描述：${project.description}` : "",
    "",
    `任务：${task.title}`,
    `任务目标：${task.goal || "未填写"}`,
    `优先级：${task.priority}`,
    `票类型：${task.kind === "fix" ? "改修型（先诊断再改）" : "新建型（red→green）"}`,
    task.diagnosis === "" ? "" : `诊断：\n${task.diagnosis.slice(0, 4000)}`,
    task.plan === "" ? "" : `修改计划：\n${task.plan.slice(0, 4000)}`,
    `模块：${task.module ?? "未指定"}`,
    module === null ? "" : `模块职责：${module.responsibility || "未填写"}`,
    module === null
      ? ""
      : `允许路径：${module.allowedPaths.join("；") || "未限制"}`,
    module === null
      ? ""
      : `禁止路径：${module.forbiddenPaths.join("；") || "无"}`,
    module === null || module.contractText === ""
      ? ""
      : `模块契约：\n${module.contractText.slice(0, 6000)}`,
    `契约：${task.contractRef ?? module?.contractPath ?? "未指定"}`,
    `分支：${workspace?.branch ?? task.branch ?? "未创建"}`,
    "验收标准：",
    acceptance || "（无）",
    "",
    ...mode,
    "请输出一个 JSON 对象（不要输出 JSON 以外的解释），字段如下：",
    '{"summary":"一句话结论","evidence":["可复现的证据/检查结果"],"artifacts":[{"kind":"plan|diff|test|doc","path":"路径或说明"}],"decisions":[{"title":"决策","rationale":"理由","scope":"branch|project"}],"contractDeltas":[{"contract":"契约路径","change":"变更"}],"rejectedOptions":[{"option":"被否决方案","reason":"原因"}],"blockers":["阻塞"]}',
    "没有内容的字段用空数组。不要声称任务已经完成；验收由人类/Verifier 决定。",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildReviewPrompt(context: {
  task: Task;
  project: Project;
  run: AgentRun | null;
  verification: {
    command: string;
    exitCode: number;
    output: string;
    passed: boolean;
  } | null;
}): string {
  return [
    "你是 Studio 的独立验收者。不要相信实现者的自述，直接看 worktree 的 diff 和验证输出。",
    `项目：${context.project.name}`,
    `任务：${context.task.title}`,
    `任务目标：${context.task.goal || "未填写"}`,
    `模块：${context.task.module ?? "未指定"}`,
    `契约：${context.task.contractRef ?? "未指定"}`,
    "验收标准：",
    context.task.acceptance
      .map(
        (item, index) =>
          `${String(index + 1)}. [${item.done ? "x" : " "}] ${item.text}`,
      )
      .join("\n") || "（无）",
    "",
    `base：${context.run?.baseSha ?? "未记录"}；分支：${context.run?.branchName ?? "未记录"}`,
    "实现者 diff：",
    context.run?.diffPatch ??
      context.run?.diffStat ??
      "（没有代码 diff）",
    "",
    context.verification === null
      ? "没有 Host 独立验证记录。"
      : `Host 独立验证：${context.verification.command} → exit ${String(context.verification.exitCode)}（${context.verification.passed ? "通过" : "失败"}）\n${context.verification.output.slice(0, 6000)}`,
    "",
    "只读评审：不要修改文件，不要运行会写文件的命令。",
    "指出验收标准是否真的满足、diff 是否越界、测试是否足够。",
    "请输出一个 JSON 对象（不要输出 JSON 以外的解释）：",
    '{"verdict":"pass|fail","summary":"一句话结论","findings":["具体发现/风险"]}',
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Host-side adapter between Studio's durable Run record and DSH's Agent API.
 *
 * v0.4 runs in advisory mode: the Agent analyzes/plans and returns a structured
 * receipt; it must not edit project files. Worktree-isolated coding is v0.6.
 */
export class AgentDispatcher {
  private readonly ctx: DispatcherContext;
  private readonly store: StudioStore;
  private readonly workspaces = new WorkspaceManager();

  constructor(ctx: DispatcherContext, store: StudioStore) {
    this.ctx = ctx;
    this.store = store;
  }

  async dispatch(taskId: string): Promise<AgentRun> {
    const context = await this.store.getDispatchContext(taskId);
    const executor =
      context.providerProfile?.executor ?? context.role.executor ?? "dsh";
    if (executor !== "dsh" && context.project.repoPath === null) {
      throw new Error("外部执行器只支持已绑定代码仓库的任务");
    }
    const selection =
      executor === "dsh"
        ? await this.resolveModel(context.role, context.providerProfile)
        : {
            provider: "external",
            model:
              context.providerProfile?.model ??
              context.role.model ??
              executor,
          };
    const workspace =
      context.project.repoPath === null
        ? undefined
        : await this.workspaces.prepare(context.project.repoPath, taskId);
    const prompt = buildPrompt(context, workspace);
    const run = await this.store.beginRun(taskId, prompt, workspace, {
      providerProfileId: context.providerProfile?.id ?? null,
      executor,
      provider: selection.provider,
      model: selection.model,
    });
    if (executor === "dsh") {
      void this.execute(run, selection, workspace);
    } else if (workspace !== undefined) {
      void this.executeExternal(run, prompt, workspace, executor);
    }
    return run;
  }

  async review(taskId: string): Promise<IndependentReview> {
    const context = await this.store.getReviewContext(taskId);
    if (context.run === null || context.run.workspacePath === null) {
      throw new Error("这个任务还没有可评审的 worktree");
    }
    const selection = await this.resolveModel(
      context.role,
      context.providerProfile,
    );
    const prompt = buildReviewPrompt(context);
    let handle: AgentHandleLike | null = null;
    let output = "";
    try {
      handle = await this.ctx.agents.create({
        sessionId: `review-${randomUUID()}`,
        meta: { cwd: context.run.workspacePath },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          await bindStudioRuntime(this.ctx, agentCtx, agent, {
            sandboxMode: REVIEW_SANDBOX,
            restrictedTools: REVIEW_RESTRICTED,
          });
        },
      });
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: prompt }],
        source: { kind: "user" },
      });
      const deadline = Date.now() + 180_000;
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
      const measured = this.ctx.tokenMeter.measure(handle.agent.session);
      const raw = extractJsonObject(output);
      const record =
        typeof raw === "object" && raw !== null && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const verdict =
        record.verdict === "pass" || record.verdict === "fail"
          ? record.verdict
          : "fail";
      const summary =
        textOf(record.summary) ||
        (output === ""
          ? "独立评审没有产出"
          : output.slice(0, 2000));
      const findings = stringArray(record.findings);
      return await this.store.recordReview(taskId, {
        reviewerRoleId: context.role.id,
        model: selection.model,
        verdict,
        summary,
        findings:
          findings.length === 0 && output === ""
            ? ["评审 Agent 没有返回内容"]
            : findings,
        tokens:
          typeof measured.totalTokens === "number"
            ? measured.totalTokens
            : null,
        runId: context.run.id,
      });
    } finally {
      if (handle !== null) {
        try {
          await handle.dispose();
        } catch {
          // best effort
        }
      }
    }
  }

  private async resolveModel(
    role: Role,
    profile: ProviderProfile | null = null,
  ): Promise<{
    provider: string;
    model: string;
  }> {
    const fallback = this.ctx.agentDefaultModel.currentSelection();
    const wanted =
      (profile?.model !== undefined && profile.model !== ""
        ? profile.model
        : undefined) ??
      role.model ??
      fallback.model;
    const preferred = profile?.provider ?? "";
    const providers = [...this.ctx.llm.listProviders()]
      .sort((left, right) => {
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

  private async execute(
    run: AgentRun,
    selection: { provider: string; model: string },
    workspace?: TaskWorkspace,
  ): Promise<void> {
    let handle: AgentHandleLike | null = null;
    let runtime: StudioRuntime | null = null;
    try {
      handle = await this.ctx.agents.create({
        sessionId: `run-${randomUUID()}`,
        meta: { cwd: workspace?.path ?? process.cwd() },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          runtime = await bindStudioRuntime(this.ctx, agentCtx, agent, {
            ...STUDIO_WORKER_POLICY,
          });
        },
      });
      await this.store.attachRunSession(
        run.id,
        handle.agent.session.id,
        selection.model,
      );
      if (runtime !== null) {
        await this.store.recordRunRuntime(run.id, runtime);
      }
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: run.prompt }],
        source: { kind: "user" },
      });

      const deadline = Date.now() + (workspace === undefined ? 120_000 : 300_000);
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
        throw new Error(
          `Agent 在 ${
            workspace === undefined ? "120" : "300"
          } 秒内没有产出（没有 assistant 消息）`,
        );
      }
      const idleDeadline = Date.now() + 30_000;
      while (handle.agent.status !== "idle" && Date.now() < idleDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const receipt = normalizeReceipt(
        extractJsonObject(output),
        output,
      );
      const measured = this.ctx.tokenMeter.measure(handle.agent.session);
      const diffStat =
        workspace === undefined
          ? null
          : this.workspaces.diffStat(workspace.path);
      const workingPatch =
        workspace === undefined
          ? null
          : clipPatch(this.workspaces.patch(workspace.path, workspace.baseSha, true));
      if (workspace !== undefined) {
        const violations = await this.store.enforceContractScope(
          run.taskId,
          run.id,
          changedFilesFromDiff(diffStat),
        );
        if (violations.length > 0) {
          await this.store.completeRun(run.id, {
            output,
            receipt,
            tokens:
              typeof measured.totalTokens === "number"
                ? measured.totalTokens
                : null,
            diffStat,
            diffPatch: workingPatch,
            commitSha: null,
          });
          await this.store.externalizeRunOutput(run.id, output);
          return;
        }
      }
      const commitSha =
        workspace !== undefined && diffStat !== "" && diffStat !== null
          ? this.workspaces.commit(
              workspace.path,
              `studio: complete ${run.taskId} (${run.id})`,
            )
          : null;
      const diffPatch =
        workspace === undefined
          ? null
          : commitSha === null
            ? workingPatch
            : clipPatch(this.workspaces.patch(workspace.path, workspace.baseSha));
      await this.store.completeRun(run.id, {
        output,
        receipt,
        tokens:
          typeof measured.totalTokens === "number"
            ? measured.totalTokens
            : null,
        diffStat,
        diffPatch,
        commitSha,
      });
      await this.store.externalizeRunOutput(run.id, output);
    } catch (error) {
      await this.store
        .failRun(
          run.id,
          error instanceof Error ? error.message : String(error),
        )
        .catch(() => undefined);
    } finally {
      if (handle !== null) {
        await handle.dispose().catch(() => undefined);
      }
    }
  }

  private async executeExternal(
    run: AgentRun,
    prompt: string,
    workspace: TaskWorkspace,
    executor: AgentExecutor,
  ): Promise<void> {
    try {
      const result = await executeExternalCli(executor, prompt, workspace);
      if (result.code !== 0) {
        throw new Error(
          `${executor} 退出码 ${String(result.code)}：${result.stderr.slice(0, 1200)}`,
        );
      }
      const output = result.output.trim();
      const diffStat = this.workspaces.diffStat(workspace.path);
      const workingPatch = clipPatch(
        this.workspaces.patch(workspace.path, workspace.baseSha, true),
      );
      const violations = await this.store.enforceContractScope(
        run.taskId,
        run.id,
        changedFilesFromDiff(diffStat),
      );
      const receipt = normalizeReceipt(extractJsonObject(output), output);
      if (violations.length > 0) {
        await this.store.completeRun(run.id, {
          output,
          receipt,
          tokens: null,
          diffStat,
          diffPatch: workingPatch,
          commitSha: null,
        });
        await this.store.externalizeRunOutput(run.id, output);
        return;
      }
      const commitSha =
        diffStat !== ""
          ? this.workspaces.commit(
              workspace.path,
              `studio: complete ${run.taskId} (${run.id})`,
            )
          : null;
      const diffPatch =
        commitSha === null
          ? workingPatch
          : clipPatch(this.workspaces.patch(workspace.path, workspace.baseSha));
      await this.store.completeRun(run.id, {
        output,
        receipt,
        tokens: null,
        diffStat,
        diffPatch,
        commitSha,
      });
      await this.store.externalizeRunOutput(run.id, output);
    } catch (error) {
      await this.store
        .failRun(
          run.id,
          error instanceof Error ? error.message : String(error),
        )
        .catch(() => undefined);
    }
  }
}
