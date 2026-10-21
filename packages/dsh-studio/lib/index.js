// src/host/index.ts
import { randomBytes } from "node:crypto";

// src/shared/types.ts
var STUDIO_SCHEMA_VERSION = 3;
var STUDIO_PLUGIN_VERSION = "0.4.0";
var TASK_STATUS_ORDER = [
  "backlog",
  "ready",
  "running",
  "blocked",
  "review",
  "done"
];
var MERGE_STATUS_LABELS = {
  review: "\u5F85\u8BC4\u5BA1",
  approved: "\u5DF2\u6279\u51C6",
  rejected: "\u5DF2\u6253\u56DE",
  merged: "\u5DF2\u5408\u5E76"
};
var ALLOWED_TRANSITIONS = {
  backlog: ["ready"],
  ready: ["backlog", "running"],
  running: ["ready", "blocked", "review"],
  blocked: ["ready", "running"],
  review: ["running", "blocked", "done"],
  done: []
};
function canTransition(from, to) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
function isTaskStatus(value) {
  return typeof value === "string" && TASK_STATUS_ORDER.includes(value);
}
function isTaskPriority(value) {
  return value === "P0" || value === "P1" || value === "P2";
}

// src/host/compat.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
var TESTED_DSH_VERSION = "0.2.1-rc.2";
var SUPPORTED_DSH_RANGE = ">=0.2.1-rc.2";
function normalizeVersion(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}
async function readInstallVersion() {
  const candidates = [];
  const electron = process;
  if (typeof electron.resourcesPath === "string" && electron.resourcesPath !== "") {
    candidates.push(
      path.join(electron.resourcesPath, "app.asar", "dsh", "package.json")
    );
  }
  const exeDir = path.dirname(process.execPath);
  candidates.push(
    path.join(exeDir, "resources", "app.asar", "dsh", "package.json"),
    path.join(exeDir, "resources", "app", "dsh", "package.json")
  );
  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(await readFile(candidate, "utf8"));
      if (typeof manifest === "object" && manifest !== null) {
        const version = normalizeVersion(
          manifest.version
        );
        if (version !== null) return version;
      }
    } catch {
    }
  }
  return null;
}
async function readRuntimeInfo() {
  const envVersion = normalizeVersion(process.env.DSH_CLIENT_VERSION) ?? normalizeVersion(process.env.DSH_VERSION);
  try {
    const mod = await import("@deepseek-ai/dsh-app-boot");
    const version = normalizeVersion(mod.getDshRuntimeVersion());
    if (version !== null) {
      return { version, source: "app-boot" };
    }
  } catch {
  }
  const installVersion = await readInstallVersion();
  if (installVersion !== null) {
    return { version: installVersion, source: "install" };
  }
  if (envVersion !== null && envVersion !== void 0) {
    return { version: envVersion, source: "env" };
  }
  return { version: "unknown", source: "unknown" };
}
function compatibilityOf(version) {
  if (version === "unknown") {
    return {
      status: "unknown",
      testedWith: TESTED_DSH_VERSION,
      message: `\u65E0\u6CD5\u8BFB\u53D6 DSH \u7248\u672C\uFF1B\u63D2\u4EF6\u6309\u80FD\u529B\u63A2\u6D4B\u8FD0\u884C\uFF0C\u5DF2\u5728 ${TESTED_DSH_VERSION} \u4E0A\u9A8C\u8BC1\u3002`
    };
  }
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) {
    return {
      status: "unknown",
      testedWith: TESTED_DSH_VERSION,
      message: `DSH \u7248\u672C\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B\uFF08${version}\uFF09\uFF1B\u6309\u80FD\u529B\u63A2\u6D4B\u8FD0\u884C\u3002`
    };
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const supported = major > 0 || minor >= 2;
  return supported ? {
    status: "supported",
    testedWith: TESTED_DSH_VERSION,
    message: `\u5F53\u524D DSH ${version} \u6EE1\u8DB3 ${SUPPORTED_DSH_RANGE}\uFF1BStudio \u4EC5\u4F9D\u8D56 Web Server \u8DEF\u7531\u3001slots \u548C React\uFF0C\u9047\u5230\u7F3A\u5931\u80FD\u529B\u4F1A\u964D\u7EA7\u800C\u4E0D\u662F\u5D29\u6E83\u3002`
  } : {
    status: "untested",
    testedWith: TESTED_DSH_VERSION,
    message: `\u5F53\u524D DSH ${version} \u4F4E\u4E8E\u5DF2\u9A8C\u8BC1\u57FA\u7EBF ${TESTED_DSH_VERSION}\uFF1B\u9875\u9762\u53EF\u80FD\u65E0\u6CD5\u52A0\u8F7D\uFF0C\u5EFA\u8BAE\u5347\u7EA7 DSH\u3002`
  };
}
function hostCapabilities(ctx, version) {
  const record = typeof ctx === "object" && ctx !== null ? ctx : {};
  return {
    webServer: typeof record.webServer === "object" && record.webServer !== null,
    logger: typeof record.logger === "object" && record.logger !== null,
    effect: typeof record.effect === "function",
    version
  };
}
function safeOrigin(ctx) {
  try {
    const record = typeof ctx === "object" && ctx !== null ? ctx : {};
    const origin = record.webServer?.getOrigin?.();
    return typeof origin === "string" ? origin : null;
  } catch {
    return null;
  }
}

// src/host/dispatcher.ts
import { randomUUID } from "node:crypto";
function assistantText(messages) {
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (assistant === void 0) return "";
  return assistant.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n").trim();
}
function extractJsonObject(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return void 0;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return void 0;
  }
}
function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20);
}
function objectArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) => typeof item === "object" && item !== null && !Array.isArray(item)
  );
}
function textOf(value) {
  return typeof value === "string" ? value.trim() : "";
}
function normalizeReceipt(raw, fallback) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      summary: fallback.slice(0, 2e3),
      evidence: [],
      artifacts: [],
      decisions: [],
      contractDeltas: [],
      rejectedOptions: [],
      blockers: ["\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u53EF\u89E3\u6790\u7684 JSON \u56DE\u6267"]
    };
  }
  const record = raw;
  return {
    summary: textOf(record.summary) || fallback.slice(0, 2e3),
    evidence: stringArray(record.evidence),
    artifacts: objectArray(record.artifacts).map((item) => ({
      kind: textOf(item.kind) || "unknown",
      path: textOf(item.path)
    })).filter((item) => item.path !== "").slice(0, 20),
    decisions: objectArray(record.decisions).map((item) => {
      const scope = item.scope === "project" ? "project" : "branch";
      return {
        title: textOf(item.title),
        rationale: textOf(item.rationale),
        scope
      };
    }).filter((item) => item.title !== "").slice(0, 20),
    contractDeltas: objectArray(record.contractDeltas).map((item) => ({
      contract: textOf(item.contract),
      change: textOf(item.change)
    })).filter((item) => item.contract !== "").slice(0, 20),
    rejectedOptions: objectArray(record.rejectedOptions).map((item) => ({
      option: textOf(item.option),
      reason: textOf(item.reason)
    })).filter((item) => item.option !== "").slice(0, 20),
    blockers: stringArray(record.blockers)
  };
}
function buildPrompt(context) {
  const { task, role, project } = context;
  const acceptance = task.acceptance.map((item, index) => `${String(index + 1)}. ${item.text}`).join("\n");
  return [
    `\u4F60\u662F Studio \u5DE5\u4F5C\u53F0\u91CC\u7684\u89D2\u8272\u300C${role.name}\u300D\uFF08${role.title || "\u672A\u586B\u5199\u804C\u4F4D"}\uFF09\u3002`,
    `\u89D2\u8272\u4F7F\u547D\uFF1A${role.mission || "\u672A\u586B\u5199"}`,
    `\u804C\u8D23\uFF1A${role.responsibilities.join("\uFF1B") || "\u672A\u586B\u5199"}`,
    "",
    `\u9879\u76EE\uFF1A${project.name}`,
    project.description ? `\u9879\u76EE\u63CF\u8FF0\uFF1A${project.description}` : "",
    "",
    `\u4EFB\u52A1\uFF1A${task.title}`,
    `\u4EFB\u52A1\u76EE\u6807\uFF1A${task.goal || "\u672A\u586B\u5199"}`,
    `\u4F18\u5148\u7EA7\uFF1A${task.priority}`,
    `\u5206\u652F\uFF1A${task.branch ?? "\u672A\u521B\u5EFA"}`,
    "\u9A8C\u6536\u6807\u51C6\uFF1A",
    acceptance || "\uFF08\u65E0\uFF09",
    "",
    "\u672C\u8F6E\u53EA\u505A\u5206\u6790/\u89C4\u5212\uFF0C\u4E0D\u8981\u4FEE\u6539\u4EFB\u4F55\u6587\u4EF6\uFF0C\u4E0D\u8981\u6267\u884C\u4F1A\u6539\u53D8\u7CFB\u7EDF\u72B6\u6001\u7684\u547D\u4EE4\u3002",
    "\u8BF7\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF08\u4E0D\u8981\u8F93\u51FA JSON \u4EE5\u5916\u7684\u89E3\u91CA\uFF09\uFF0C\u5B57\u6BB5\u5982\u4E0B\uFF1A",
    '{"summary":"\u4E00\u53E5\u8BDD\u7ED3\u8BBA","evidence":["\u53EF\u590D\u73B0\u7684\u8BC1\u636E/\u68C0\u67E5\u7ED3\u679C"],"artifacts":[{"kind":"plan|diff|test|doc","path":"\u8DEF\u5F84\u6216\u8BF4\u660E"}],"decisions":[{"title":"\u51B3\u7B56","rationale":"\u7406\u7531","scope":"branch|project"}],"contractDeltas":[{"contract":"\u5951\u7EA6\u8DEF\u5F84","change":"\u53D8\u66F4"}],"rejectedOptions":[{"option":"\u88AB\u5426\u51B3\u65B9\u6848","reason":"\u539F\u56E0"}],"blockers":["\u963B\u585E"]}',
    "\u6CA1\u6709\u5185\u5BB9\u7684\u5B57\u6BB5\u7528\u7A7A\u6570\u7EC4\u3002\u4E0D\u8981\u58F0\u79F0\u4EFB\u52A1\u5DF2\u7ECF\u5B8C\u6210\uFF1B\u9A8C\u6536\u7531\u4EBA\u7C7B/Verifier \u51B3\u5B9A\u3002"
  ].filter((line) => line !== "").join("\n");
}
var AgentDispatcher = class {
  ctx;
  store;
  constructor(ctx, store) {
    this.ctx = ctx;
    this.store = store;
  }
  async dispatch(taskId) {
    const context = await this.store.getDispatchContext(taskId);
    const selection = await this.resolveModel(context.role);
    const prompt = buildPrompt(context);
    const run = await this.store.beginRun(taskId, prompt);
    void this.execute(run, selection);
    return run;
  }
  async resolveModel(role) {
    const fallback = this.ctx.agentDefaultModel.currentSelection();
    const wanted = role.model ?? fallback.model;
    const providers = [...this.ctx.llm.listProviders()].sort((left, right) => {
      const score = (id) => id === "deepseek-account" ? 0 : id === "deepseek-official" ? 2 : 1;
      return score(left.id) - score(right.id);
    });
    let first = null;
    for (const provider of providers) {
      const models = await this.ctx.llm.listModels(provider.id);
      const exact = models.find((model) => model.id === wanted);
      if (exact !== void 0) {
        return { provider: provider.id, model: exact.id };
      }
      if (first === null && models.length > 0) {
        first = { provider: provider.id, model: models[0]?.id ?? wanted };
      }
    }
    if (first !== null) return first;
    throw new Error(`\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u8DEF\u7531\uFF08\u8BF7\u6C42\u6A21\u578B\uFF1A${wanted}\uFF09`);
  }
  async execute(run, selection) {
    let handle = null;
    try {
      handle = await this.ctx.agents.create({
        sessionId: `run-${randomUUID()}`,
        meta: { cwd: process.cwd() },
        agentOptions: selection,
        setup: async (agentCtx) => {
          await this.ctx.agentPresets.mount(agentCtx);
        }
      });
      await this.store.attachRunSession(
        run.id,
        handle.agent.session.id,
        selection.model
      );
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: run.prompt }],
        source: { kind: "user" }
      });
      const deadline = Date.now() + 12e4;
      let output = "";
      let idleTicks = 0;
      while (Date.now() < deadline) {
        output = assistantText(handle.agent.session.deriveMessages());
        if (output !== "") break;
        if (handle.agent.status === "idle") {
          idleTicks += 1;
          if (idleTicks >= 10) break;
        } else {
          idleTicks = 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (output === "") {
        throw new Error("Agent \u5728 120 \u79D2\u5185\u6CA1\u6709\u4EA7\u51FA\uFF08\u6CA1\u6709 assistant \u6D88\u606F\uFF09");
      }
      const idleDeadline = Date.now() + 3e4;
      while (handle.agent.status !== "idle" && Date.now() < idleDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const receipt = normalizeReceipt(
        extractJsonObject(output),
        output
      );
      const measured = this.ctx.tokenMeter.measure(handle.agent.session);
      await this.store.completeRun(run.id, {
        output,
        receipt,
        tokens: typeof measured.totalTokens === "number" ? measured.totalTokens : null
      });
    } catch (error) {
      await this.store.failRun(
        run.id,
        error instanceof Error ? error.message : String(error)
      ).catch(() => void 0);
    } finally {
      if (handle !== null) {
        await handle.dispose().catch(() => void 0);
      }
    }
  }
};

// src/host/store.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile as readFile2, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path2 from "node:path";
var StudioStoreError = class extends Error {
  code;
  status;
  constructor(code, message, status = 400) {
    super(message);
    this.name = "StudioStoreError";
    this.code = code;
    this.status = status;
  }
};
function defaultStudioDataDir() {
  const home = process.env.DSH_HOME?.trim();
  return path2.join(
    home !== void 0 && home !== "" ? home : path2.join(os.homedir(), ".dsh"),
    "studio"
  );
}
function nowIso(now) {
  return now().toISOString();
}
function newId(prefix) {
  return `${prefix}-${randomUUID2().slice(0, 8)}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredText(value, field, max = 200) {
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
  }
  const text = value.trim();
  if (text === "") {
    throw new StudioStoreError("invalid_input", `${field} \u4E0D\u80FD\u4E3A\u7A7A`);
  }
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} \u4E0D\u80FD\u8D85\u8FC7 ${String(max)} \u4E2A\u5B57\u7B26`
    );
  }
  return text;
}
function optionalText(value, field, max = 4e3) {
  if (value === void 0 || value === null) return "";
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} \u4E0D\u80FD\u8D85\u8FC7 ${String(max)} \u4E2A\u5B57\u7B26`
    );
  }
  return text;
}
function optionalTokenBudget(value, field) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570 token \u6570`
    );
  }
  return value === 0 ? null : value;
}
function textList(value, field, maxItems = 20) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", `${field} \u5FC5\u987B\u662F\u6570\u7EC4`);
  }
  return value.slice(0, maxItems).map((item, index) => requiredText(item, `${field}[${String(index)}]`, 400));
}
function normalizeAcceptance(value, existing = []) {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "acceptance \u5FC5\u987B\u662F\u6570\u7EC4");
  }
  if (value.length === 0) {
    throw new StudioStoreError(
      "acceptance_required",
      "\u81F3\u5C11\u9700\u8981\u4E00\u6761\u53EF\u9A8C\u8BC1\u7684\u9A8C\u6536\u6807\u51C6"
    );
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 20).map((raw, index) => {
    if (typeof raw === "string") {
      const text2 = requiredText(raw, `acceptance[${String(index)}]`, 400);
      return { id: newId("acc"), text: text2, done: false };
    }
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `acceptance[${String(index)}] \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216\u5BF9\u8C61`
      );
    }
    const text = requiredText(
      raw.text,
      `acceptance[${String(index)}].text`,
      400
    );
    const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("acc");
    const previous = byId.get(id);
    return {
      id,
      text,
      done: typeof raw.done === "boolean" ? raw.done : previous?.done ?? false
    };
  });
}
function normalizeEvidence(value, existing, at) {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "evidence \u5FC5\u987B\u662F\u6570\u7EC4");
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 50).map((raw, index) => {
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `evidence[${String(index)}] \u5FC5\u987B\u662F\u5BF9\u8C61`
      );
    }
    const text = requiredText(raw.text, `evidence[${String(index)}].text`, 800);
    const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("ev");
    const previous = byId.get(id);
    return {
      id,
      text,
      createdAt: previous?.createdAt ?? (typeof raw.createdAt === "string" ? raw.createdAt : at)
    };
  });
}
function statsFor(tasks, proposals = []) {
  const stats = {
    total: tasks.length,
    backlog: 0,
    ready: 0,
    running: 0,
    blocked: 0,
    review: 0,
    done: 0,
    acceptanceDone: 0,
    acceptanceTotal: 0,
    mergeReview: 0,
    mergeApproved: 0,
    mergeMerged: 0
  };
  for (const task of tasks) {
    stats[task.status] += 1;
    stats.acceptanceTotal += task.acceptance.length;
    stats.acceptanceDone += task.acceptance.filter((item) => item.done).length;
  }
  for (const proposal of proposals) {
    if (proposal.status === "review") stats.mergeReview += 1;
    else if (proposal.status === "approved") stats.mergeApproved += 1;
    else if (proposal.status === "merged") stats.mergeMerged += 1;
  }
  return stats;
}
var STALE_TASK_HOURS = 72;
var AGING_MERGE_HOURS = 48;
function hoursSince(iso, now) {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, (now.getTime() - at) / 36e5);
}
function latestIso(values) {
  let latest = null;
  let latestAt = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value === null || value === void 0) continue;
    const at = Date.parse(value);
    if (Number.isNaN(at) || at <= latestAt) continue;
    latest = value;
    latestAt = at;
  }
  return latest;
}
function buildCompany(state, now) {
  const projects = [];
  const needs = [];
  const roles = [];
  const risk = {
    staleTasks: 0,
    agingMerges: 0,
    missingEvidence: 0,
    blocked: 0,
    unowned: 0
  };
  const totals = {
    projects: 0,
    activeProjects: 0,
    tasks: 0,
    openTasks: 0,
    inReview: 0,
    blocked: 0,
    mergePending: 0,
    merged: 0,
    done: 0,
    acceptanceDone: 0,
    acceptanceTotal: 0,
    runs: 0,
    runningRuns: 0,
    tokensUsed: 0
  };
  for (const project of state.projects) {
    const projectTasks = state.tasks.filter(
      (task) => task.projectId === project.id
    );
    const projectProposals = state.mergeProposals.filter(
      (proposal) => proposal.projectId === project.id
    );
    const projectRoles = state.roles.filter(
      (role) => role.projectId === project.id
    );
    const projectRuns = state.runs.filter(
      (run) => run.projectId === project.id
    );
    const roleById = new Map(projectRoles.map((role) => [role.id, role]));
    const stats = statsFor(projectTasks, projectProposals);
    const projectNeeds = [];
    const openTasks = projectTasks.filter((task) => task.status !== "done");
    const activeTasks = projectTasks.filter(
      (task) => task.status === "running" || task.status === "review"
    );
    const activeRoleIds = new Set(
      activeTasks.map((task) => task.ownerRoleId).filter((id) => id !== null)
    );
    for (const task of projectTasks) {
      const owner = task.ownerRoleId === null ? null : roleById.get(task.ownerRoleId);
      const acceptanceDone = task.acceptance.filter((item) => item.done).length;
      const age = hoursSince(task.updatedAt, now);
      if (task.status === "blocked") {
        risk.blocked += 1;
        totals.blocked += 1;
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-blocked`,
          kind: "task_blocked",
          severity: "critical",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `\u4EFB\u52A1\u963B\u585E\uFF1A${task.title}`,
          detail: "\u9700\u8981\u89E3\u9664\u963B\u585E\u3001\u91CD\u65B0\u89C4\u5212\uFF0C\u6216\u7531\u4F60\u51B3\u5B9A\u662F\u5426\u6682\u505C",
          ageHours: age === null ? null : Math.round(age)
        });
      }
      if (task.status === "review" && task.evidence.length === 0) {
        risk.missingEvidence += 1;
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-evidence`,
          kind: "missing_evidence",
          severity: "warning",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `\u7F3A\u8BC1\u636E\uFF1A${task.title}`,
          detail: "\u9A8C\u6536\u524D\u81F3\u5C11\u9700\u8981\u4E00\u6761\u53EF\u590D\u73B0\u7684\u6D4B\u8BD5\u3001\u547D\u4EE4\u6216 replay",
          ageHours: age === null ? null : Math.round(age)
        });
      } else if (task.status === "review") {
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-review`,
          kind: "task_review",
          severity: "warning",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `\u5F85\u9A8C\u6536\uFF1A${task.title}`,
          detail: `${owner?.name ?? "\u672A\u6307\u6D3E"} \xB7 \u9A8C\u6536 ${String(acceptanceDone)}/${String(task.acceptance.length)}`,
          ageHours: age === null ? null : Math.round(age)
        });
      }
      if (task.status !== "done" && age !== null && age > STALE_TASK_HOURS) {
        risk.staleTasks += 1;
        if (task.status !== "blocked" && task.status !== "review") {
          projectNeeds.push({
            id: `need-${project.id}-${task.id}-stale`,
            kind: "stale_task",
            severity: "warning",
            projectId: project.id,
            projectName: project.name,
            taskId: task.id,
            proposalId: null,
            title: `\u4EFB\u52A1\u505C\u6EDE\uFF1A${task.title}`,
            detail: `\u5DF2\u7ECF ${String(Math.round(age))} \u5C0F\u65F6\u6CA1\u6709\u66F4\u65B0`,
            ageHours: Math.round(age)
          });
        }
      }
      if (task.status !== "done" && task.status !== "backlog" && task.ownerRoleId === null) {
        risk.unowned += 1;
        projectNeeds.push({
          id: `need-${project.id}-${task.id}-unowned`,
          kind: "unowned_task",
          severity: "info",
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          proposalId: null,
          title: `\u65E0\u4EBA\u8D1F\u8D23\uFF1A${task.title}`,
          detail: "\u4EFB\u52A1\u5DF2\u8FDB\u5165\u6267\u884C\u533A\uFF0C\u4F46\u6CA1\u6709\u8D1F\u8D23\u4EBA",
          ageHours: age === null ? null : Math.round(age)
        });
      }
    }
    for (const proposal of projectProposals) {
      if (proposal.status !== "review" && proposal.status !== "approved") {
        continue;
      }
      const task = projectTasks.find((item) => item.id === proposal.taskId);
      const age = hoursSince(proposal.createdAt, now);
      if (age !== null && age > AGING_MERGE_HOURS) {
        risk.agingMerges += 1;
      }
      projectNeeds.push({
        id: `need-${project.id}-${proposal.id}-merge`,
        kind: proposal.status === "review" ? "merge_review" : "merge_approved",
        severity: "warning",
        projectId: project.id,
        projectName: project.name,
        taskId: proposal.taskId,
        proposalId: proposal.id,
        title: proposal.status === "review" ? `\u5408\u5E76\u5F85\u8BC4\u5BA1\uFF1A${task?.title ?? proposal.taskId}` : `\u5408\u5E76\u5DF2\u6279\u51C6\uFF0C\u7B49\u5F85\u6267\u884C\uFF1A${task?.title ?? proposal.taskId}`,
        detail: `${proposal.branch} \u2192 ${proposal.base} \xB7 ${proposal.risk}`,
        ageHours: age === null ? null : Math.round(age)
      });
    }
    if (projectRoles.length === 0) {
      projectNeeds.push({
        id: `need-${project.id}-setup`,
        kind: "project_setup",
        severity: "info",
        projectId: project.id,
        projectName: project.name,
        taskId: null,
        proposalId: null,
        title: `\u9879\u76EE\u8FD8\u6CA1\u914D\u7F6E\u89D2\u8272\uFF1A${project.name}`,
        detail: "\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u89D2\u8272\uFF0C\u4EFB\u52A1\u624D\u6709\u8D1F\u8D23\u4EBA\u548C\u9A8C\u6536\u4EBA",
        ageHours: null
      });
    } else if (projectTasks.length === 0) {
      projectNeeds.push({
        id: `need-${project.id}-empty`,
        kind: "project_setup",
        severity: "info",
        projectId: project.id,
        projectName: project.name,
        taskId: null,
        proposalId: null,
        title: `\u9879\u76EE\u8FD8\u6CA1\u6709\u4EFB\u52A1\uFF1A${project.name}`,
        detail: "\u521B\u5EFA\u7B2C\u4E00\u6761\u5E26\u9A8C\u6536\u6807\u51C6\u7684\u4EFB\u52A1\uFF0C\u9879\u76EE\u624D\u5F00\u59CB\u8FD0\u8F6C",
        ageHours: null
      });
    }
    const isActive = projectTasks.some(
      (task) => task.status !== "backlog" && task.status !== "done"
    ) || projectProposals.some(
      (proposal) => proposal.status === "review" || proposal.status === "approved"
    );
    if (isActive) totals.activeProjects += 1;
    totals.projects += 1;
    totals.tasks += stats.total;
    totals.openTasks += openTasks.length;
    totals.inReview += stats.review;
    totals.mergePending += stats.mergeReview + stats.mergeApproved;
    totals.merged += stats.mergeMerged;
    totals.done += stats.done;
    totals.acceptanceDone += stats.acceptanceDone;
    totals.acceptanceTotal += stats.acceptanceTotal;
    totals.runs += projectRuns.length;
    totals.runningRuns += projectRuns.filter(
      (run) => run.status === "running"
    ).length;
    totals.tokensUsed += projectRuns.reduce(
      (sum, run) => sum + (run.tokens ?? 0),
      0
    );
    for (const role of projectRoles) {
      const assigned = projectTasks.filter(
        (task) => task.ownerRoleId === role.id
      );
      const active = assigned.filter(
        (task) => task.status === "running" || task.status === "review"
      ).length;
      const review = assigned.filter((task) => task.status === "review").length;
      const open = assigned.filter((task) => task.status !== "done").length;
      roles.push({
        roleId: role.id,
        roleName: role.name,
        roleTitle: role.title,
        projectId: project.id,
        projectName: project.name,
        activeTasks: active,
        reviewTasks: review,
        openTasks: open,
        state: active >= 3 ? "overloaded" : active >= 1 ? "busy" : "idle"
      });
    }
    const health = projectNeeds.some((need) => need.severity === "critical") ? "critical" : projectNeeds.length > 0 ? "attention" : "steady";
    const lastActivityAt = latestIso([
      project.updatedAt,
      ...projectTasks.map((task) => task.updatedAt),
      ...projectProposals.map((proposal) => proposal.updatedAt),
      ...state.events.filter((event) => event.projectId === project.id).map((event) => event.at)
    ]);
    projects.push({
      project,
      stats,
      roleCount: projectRoles.length,
      activeRoleCount: activeRoleIds.size,
      openTasks: openTasks.length,
      health,
      lastActivityAt,
      openNeeds: projectNeeds.length
    });
    needs.push(...projectNeeds);
  }
  const healthRank = {
    critical: 0,
    attention: 1,
    steady: 2
  };
  projects.sort((left, right) => {
    const byHealth = healthRank[left.health] - healthRank[right.health];
    if (byHealth !== 0) return byHealth;
    return (right.lastActivityAt ?? "").localeCompare(
      left.lastActivityAt ?? ""
    );
  });
  const severityRank = {
    critical: 0,
    warning: 1,
    info: 2
  };
  needs.sort((left, right) => {
    const bySeverity = severityRank[left.severity] - severityRank[right.severity];
    if (bySeverity !== 0) return bySeverity;
    return (right.ageHours ?? 0) - (left.ageHours ?? 0);
  });
  roles.sort((left, right) => right.activeTasks - left.activeTasks);
  return {
    totals,
    projects,
    needs: needs.slice(0, 30),
    roles,
    risk,
    recentEvents: [...state.events].slice(-20).reverse(),
    generatedAt: now.toISOString()
  };
}
function isProject(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.description === "string" && (value.tokenBudget === null || typeof value.tokenBudget === "number") && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}
function isRole(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.name === "string" && typeof value.title === "string" && typeof value.mission === "string" && Array.isArray(value.responsibilities) && Array.isArray(value.nonGoals) && Array.isArray(value.decisionRights) && (value.model === null || typeof value.model === "string") && (value.tokenBudget === null || typeof value.tokenBudget === "number") && (value.dailyTokenBudget === null || typeof value.dailyTokenBudget === "number");
}
function isAgentRunStatus(value) {
  return value === "queued" || value === "running" || value === "succeeded" || value === "failed";
}
function isAgentRun(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && (value.roleId === null || typeof value.roleId === "string") && (value.sessionId === null || typeof value.sessionId === "string") && isAgentRunStatus(value.status) && (value.model === null || typeof value.model === "string") && typeof value.prompt === "string" && typeof value.output === "string" && (value.receipt === null || isRecord(value.receipt)) && (value.tokens === null || typeof value.tokens === "number") && (value.budgetWarning === null || typeof value.budgetWarning === "string") && (value.error === null || typeof value.error === "string") && typeof value.startedAt === "string" && (value.endedAt === null || typeof value.endedAt === "string");
}
function isTask(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.title === "string" && typeof value.goal === "string" && isTaskStatus(value.status) && isTaskPriority(value.priority) && Array.isArray(value.acceptance) && Array.isArray(value.evidence);
}
function isMergeRisk(value) {
  return value === "low" || value === "medium" || value === "high";
}
function isMergeProposal(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && typeof value.branch === "string" && typeof value.base === "string" && typeof value.summary === "string" && isMergeRisk(value.risk) && typeof value.rollback === "string" && (value.status === "review" || value.status === "approved" || value.status === "rejected" || value.status === "merged") && typeof value.reviewNote === "string" && (value.mergeCommit === null || typeof value.mergeCommit === "string") && typeof value.createdAt === "string" && typeof value.updatedAt === "string" && (value.decidedAt === null || typeof value.decidedAt === "string") && (value.mergedAt === null || typeof value.mergedAt === "string");
}
function migrateState(value) {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  let state = value;
  if (state.schemaVersion === 1) {
    state = {
      ...state,
      schemaVersion: 2,
      mergeProposals: []
    };
  }
  if (state.schemaVersion === 2) {
    return {
      ...state,
      schemaVersion: STUDIO_SCHEMA_VERSION,
      projects: state.projects.map((project) => ({
        ...project,
        tokenBudget: project.tokenBudget ?? null
      })),
      roles: state.roles.map((role) => ({
        ...role,
        model: role.model ?? null,
        tokenBudget: role.tokenBudget ?? null,
        dailyTokenBudget: role.dailyTokenBudget ?? null
      })),
      runs: Array.isArray(
        state.runs
      ) ? state.runs : []
    };
  }
  return state;
}
function assertState(value) {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  if (value.schemaVersion !== STUDIO_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Studio schema version: ${String(value.schemaVersion)}`
    );
  }
  if (!Array.isArray(value.projects) || !Array.isArray(value.roles) || !Array.isArray(value.tasks) || !Array.isArray(value.mergeProposals) || !Array.isArray(value.runs) || !Array.isArray(value.events)) {
    throw new Error("Studio state collections are missing");
  }
  if (!value.projects.every(isProject)) {
    throw new Error("Studio state contains an invalid project");
  }
  if (!value.roles.every(isRole)) {
    throw new Error("Studio state contains an invalid role");
  }
  if (!value.tasks.every(isTask)) {
    throw new Error("Studio state contains an invalid task");
  }
  if (!value.mergeProposals.every(isMergeProposal)) {
    throw new Error("Studio state contains an invalid merge proposal");
  }
  if (!value.runs.every(isAgentRun)) {
    throw new Error("Studio state contains an invalid agent run");
  }
}
var StudioStore = class {
  dataDir;
  file;
  now;
  state = null;
  queue = Promise.resolve();
  warning = null;
  constructor(options = {}) {
    this.dataDir = options.dataDir ?? defaultStudioDataDir();
    this.file = path2.join(this.dataDir, "studio.json");
    this.now = options.now ?? (() => /* @__PURE__ */ new Date());
  }
  async init() {
    await this.runExclusive(async () => {
      await this.load();
    });
  }
  getWarning() {
    return this.warning;
  }
  async bootstrap(projectId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, projectId);
      const roles = project === null ? [] : state.roles.filter((role) => role.projectId === project.id);
      const tasks = project === null ? [] : state.tasks.filter((task) => task.projectId === project.id);
      const mergeProposals = project === null ? [] : state.mergeProposals.filter(
        (proposal) => proposal.projectId === project.id
      );
      const runs = project === null ? [] : state.runs.filter((run) => run.projectId === project.id).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      );
      const events = [...state.events].filter((event) => project === null || event.projectId === project.id).slice(-30).reverse();
      const now = this.now();
      return {
        app: {
          pluginVersion: STUDIO_PLUGIN_VERSION,
          dshVersion: "unknown",
          compatibility: {
            status: "unknown",
            testedWith: "0.2.1-rc.2",
            message: ""
          },
          dataDir: this.dataDir,
          schemaVersion: STUDIO_SCHEMA_VERSION,
          serverTime: now.toISOString()
        },
        projects: [...state.projects],
        activeProjectId: state.activeProjectId,
        project,
        roles,
        tasks,
        mergeProposals,
        runs,
        stats: statsFor(tasks, mergeProposals),
        events,
        company: buildCompany(state, now),
        features: {
          independentPage: true,
          filePersistence: true,
          mergeGovernance: true,
          ownerDashboard: true,
          agentExecution: true,
          gitMerge: false
        }
      };
    });
  }
  async createProject(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const at = nowIso(this.now);
      const project = {
        id: newId("proj"),
        name: requiredText(input.name, "name", 80),
        description: optionalText(input.description, "description", 600),
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        createdAt: at,
        updatedAt: at
      };
      state.projects.push(project);
      state.activeProjectId = project.id;
      this.recordEvent(state, {
        type: "project.created",
        at,
        projectId: project.id,
        payload: { name: project.name }
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(project);
    });
  }
  async selectProject(projectId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === void 0) {
        throw new StudioStoreError("project_not_found", "\u9879\u76EE\u4E0D\u5B58\u5728", 404);
      }
      state.activeProjectId = project.id;
      state.updatedAt = nowIso(this.now);
      await this.save();
      return structuredClone(project);
    });
  }
  async getDispatchContext(taskId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.ownerRoleId === null) {
        throw new StudioStoreError(
          "owner_required",
          "\u4EFB\u52A1\u6CA1\u6709\u8D1F\u8D23\u4EBA\u89D2\u8272\uFF0C\u4E0D\u80FD\u6D3E\u5355",
          409
        );
      }
      const role = state.roles.find((item) => item.id === task.ownerRoleId);
      const project = state.projects.find(
        (item) => item.id === task.projectId
      );
      if (role === void 0 || project === void 0) {
        throw new StudioStoreError(
          "context_not_found",
          "\u4EFB\u52A1\u7684\u8D1F\u8D23\u4EBA\u89D2\u8272\u6216\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project)
      };
    });
  }
  async beginRun(taskId, prompt) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status !== "backlog" && task.status !== "ready") {
        throw new StudioStoreError(
          "task_not_dispatchable",
          "\u53EA\u6709\u5F85\u89C4\u5212\u6216\u53EF\u5F00\u59CB\u7684\u4EFB\u52A1\u53EF\u4EE5\u6D3E\u5355",
          409
        );
      }
      if (task.ownerRoleId === null) {
        throw new StudioStoreError(
          "owner_required",
          "\u4EFB\u52A1\u6CA1\u6709\u8D1F\u8D23\u4EBA\u89D2\u8272\uFF0C\u4E0D\u80FD\u6D3E\u5355",
          409
        );
      }
      const role = state.roles.find((item) => item.id === task.ownerRoleId);
      const project = state.projects.find(
        (item) => item.id === task.projectId
      );
      if (role === void 0 || project === void 0) {
        throw new StudioStoreError(
          "context_not_found",
          "\u4EFB\u52A1\u7684\u8D1F\u8D23\u4EBA\u89D2\u8272\u6216\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      const projectSpent = state.runs.filter((run2) => run2.projectId === project.id).reduce((sum, run2) => sum + (run2.tokens ?? 0), 0);
      if (project.tokenBudget !== null && projectSpent >= project.tokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `\u9879\u76EE token \u9884\u7B97\u5DF2\u7528\u5C3D\uFF08${String(projectSpent)} / ${String(
            project.tokenBudget
          )}\uFF09`,
          409
        );
      }
      const roleSpent = state.runs.filter((run2) => run2.roleId === role.id).reduce((sum, run2) => sum + (run2.tokens ?? 0), 0);
      if (role.tokenBudget !== null && roleSpent >= role.tokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `\u89D2\u8272 token \u9884\u7B97\u5DF2\u7528\u5C3D\uFF08${String(roleSpent)} / ${String(
            role.tokenBudget
          )}\uFF09`,
          409
        );
      }
      const today = nowIso(this.now).slice(0, 10);
      const dailySpent = state.runs.filter(
        (run2) => run2.roleId === role.id && run2.startedAt.slice(0, 10) === today
      ).reduce((sum, run2) => sum + (run2.tokens ?? 0), 0);
      if (role.dailyTokenBudget !== null && dailySpent >= role.dailyTokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `\u89D2\u8272\u4ECA\u65E5 token \u9884\u7B97\u5DF2\u7528\u5C3D\uFF08${String(dailySpent)} / ${String(
            role.dailyTokenBudget
          )}\uFF09`,
          409
        );
      }
      const at = nowIso(this.now);
      const run = {
        id: newId("run"),
        projectId: task.projectId,
        taskId: task.id,
        roleId: role.id,
        sessionId: null,
        status: "queued",
        model: role.model,
        prompt,
        output: "",
        receipt: null,
        tokens: null,
        budgetWarning: null,
        error: null,
        startedAt: at,
        endedAt: null
      };
      state.runs.push(run);
      task.status = "running";
      task.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.dispatched",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: {
          runId: run.id,
          roleId: role.id,
          model: role.model
        }
      });
      await this.save();
      return structuredClone(run);
    });
  }
  async attachRunSession(runId, sessionId, model) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === void 0) return;
      run.sessionId = sessionId;
      if (model !== void 0) run.model = model;
      run.status = "running";
      await this.save();
    });
  }
  async completeRun(runId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === void 0) {
        throw new StudioStoreError("run_not_found", "Agent Run \u4E0D\u5B58\u5728", 404);
      }
      const at = nowIso(this.now);
      const task = state.tasks.find((item) => item.id === run.taskId);
      const project = state.projects.find(
        (item) => item.id === run.projectId
      );
      const role = state.roles.find((item) => item.id === run.roleId);
      const receiptComplete = input.receipt !== null && typeof input.receipt.summary === "string" && input.receipt.summary.trim() !== "" && Array.isArray(input.receipt.evidence) && input.receipt.evidence.length > 0;
      if (!receiptComplete) {
        run.status = "failed";
        run.output = input.output.slice(0, 3e4);
        run.receipt = input.receipt;
        run.tokens = input.tokens;
        run.error = "\u56DE\u6267\u4E0D\u5B8C\u6574\uFF1A\u5FC5\u987B\u5305\u542B\u975E\u7A7A summary \u548C\u81F3\u5C11\u4E00\u6761 evidence\uFF0C\u4EFB\u52A1\u4E0D\u80FD\u8FDB\u5165 review";
        run.endedAt = at;
        if (task !== void 0 && task.status === "running") {
          task.status = "ready";
          task.updatedAt = at;
        }
        state.updatedAt = at;
        this.recordEvent(state, {
          type: "agent.failed",
          at,
          projectId: run.projectId,
          taskId: run.taskId,
          payload: {
            runId: run.id,
            error: run.error,
            tokens: run.tokens
          }
        });
        await this.save();
        return structuredClone(run);
      }
      const spentProject = state.runs.filter(
        (item) => item.projectId === run.projectId && item.id !== run.id
      ).reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const spentRole = state.runs.filter(
        (item) => item.roleId === run.roleId && item.id !== run.id
      ).reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const warnings = [];
      if (project !== void 0 && project.tokenBudget !== null && input.tokens !== null && spentProject + input.tokens > project.tokenBudget) {
        warnings.push(
          `\u9879\u76EE token \u9884\u7B97\u8D85\u51FA\uFF1A${String(spentProject + input.tokens)} / ${String(
            project.tokenBudget
          )}`
        );
      }
      if (role !== void 0 && role.tokenBudget !== null && input.tokens !== null && spentRole + input.tokens > role.tokenBudget) {
        warnings.push(
          `\u89D2\u8272 token \u9884\u7B97\u8D85\u51FA\uFF1A${String(spentRole + input.tokens)} / ${String(
            role.tokenBudget
          )}`
        );
      }
      run.status = "succeeded";
      run.output = input.output.slice(0, 3e4);
      run.receipt = input.receipt;
      run.tokens = input.tokens;
      run.budgetWarning = warnings.length === 0 ? null : warnings.join("\uFF1B");
      run.endedAt = at;
      if (task !== void 0) {
        if (input.receipt !== null) {
          const existing = new Set(task.evidence.map((item) => item.text));
          for (const text of input.receipt.evidence.slice(0, 10)) {
            if (existing.has(text)) continue;
            task.evidence.push({
              id: newId("ev"),
              text,
              createdAt: at
            });
          }
          if (task.status === "running") task.status = "review";
        }
        task.updatedAt = at;
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.completed",
        at,
        projectId: run.projectId,
        taskId: run.taskId,
        payload: {
          runId: run.id,
          tokens: run.tokens,
          receipt: input.receipt !== null,
          budgetWarning: run.budgetWarning
        }
      });
      await this.save();
      return structuredClone(run);
    });
  }
  async failRun(runId, error) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === void 0) {
        throw new StudioStoreError("run_not_found", "Agent Run \u4E0D\u5B58\u5728", 404);
      }
      const at = nowIso(this.now);
      run.status = "failed";
      run.error = error.slice(0, 4e3);
      run.endedAt = at;
      const task = state.tasks.find((item) => item.id === run.taskId);
      if (task !== void 0 && task.status === "running") {
        task.status = "ready";
        task.updatedAt = at;
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.failed",
        at,
        projectId: run.projectId,
        taskId: run.taskId,
        payload: { runId: run.id, error: run.error }
      });
      await this.save();
      return structuredClone(run);
    });
  }
  async createRole(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, void 0);
      if (project === null) {
        throw new StudioStoreError("project_required", "\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE");
      }
      const at = nowIso(this.now);
      const role = {
        id: newId("role"),
        projectId: project.id,
        name: requiredText(input.name, "name", 60),
        title: optionalText(input.title, "title", 80),
        mission: optionalText(input.mission, "mission", 600),
        responsibilities: textList(input.responsibilities, "responsibilities"),
        nonGoals: textList(input.nonGoals, "nonGoals"),
        decisionRights: textList(input.decisionRights, "decisionRights"),
        model: optionalText(input.model, "model", 120) || null,
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        dailyTokenBudget: optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget"
        ),
        createdAt: at,
        updatedAt: at
      };
      state.roles.push(role);
      this.recordEvent(state, {
        type: "role.created",
        at,
        projectId: project.id,
        payload: { roleId: role.id, name: role.name }
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(role);
    });
  }
  async updateRole(roleId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const role = state.roles.find((item) => item.id === roleId);
      if (role === void 0) {
        throw new StudioStoreError("role_not_found", "\u89D2\u8272\u4E0D\u5B58\u5728", 404);
      }
      if (input.name !== void 0) {
        role.name = requiredText(input.name, "name", 60);
      }
      if (input.title !== void 0) {
        role.title = optionalText(input.title, "title", 80);
      }
      if (input.mission !== void 0) {
        role.mission = optionalText(input.mission, "mission", 600);
      }
      if (input.responsibilities !== void 0) {
        role.responsibilities = textList(
          input.responsibilities,
          "responsibilities"
        );
      }
      if (input.nonGoals !== void 0) {
        role.nonGoals = textList(input.nonGoals, "nonGoals");
      }
      if (input.decisionRights !== void 0) {
        role.decisionRights = textList(input.decisionRights, "decisionRights");
      }
      if (input.model !== void 0) {
        role.model = optionalText(input.model, "model", 120) || null;
      }
      if (input.tokenBudget !== void 0) {
        role.tokenBudget = optionalTokenBudget(input.tokenBudget, "tokenBudget");
      }
      if (input.dailyTokenBudget !== void 0) {
        role.dailyTokenBudget = optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget"
        );
      }
      role.updatedAt = nowIso(this.now);
      state.updatedAt = role.updatedAt;
      this.recordEvent(state, {
        type: "role.updated",
        at: role.updatedAt,
        projectId: role.projectId,
        payload: { roleId: role.id }
      });
      await this.save();
      return structuredClone(role);
    });
  }
  async createTask(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, void 0);
      if (project === null) {
        throw new StudioStoreError("project_required", "\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE");
      }
      const at = nowIso(this.now);
      const ownerRoleId = this.resolveRoleId(
        state,
        project.id,
        input.ownerRoleId,
        "ownerRoleId"
      );
      const reviewerRoleId = this.resolveRoleId(
        state,
        project.id,
        input.reviewerRoleId,
        "reviewerRoleId"
      );
      const task = {
        id: newId("task"),
        projectId: project.id,
        title: requiredText(input.title, "title", 160),
        goal: optionalText(input.goal, "goal", 2e3),
        status: "backlog",
        priority: isTaskPriority(input.priority) ? input.priority : "P1",
        ownerRoleId,
        reviewerRoleId,
        acceptance: normalizeAcceptance(input.acceptance ?? []),
        evidence: [],
        branch: optionalText(input.branch, "branch", 160) || null,
        createdAt: at,
        updatedAt: at
      };
      state.tasks.push(task);
      this.recordEvent(state, {
        type: "task.created",
        at,
        projectId: project.id,
        taskId: task.id,
        payload: { title: task.title, priority: task.priority }
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(task);
    });
  }
  async updateTask(taskId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status === "done") {
        throw new StudioStoreError(
          "task_locked",
          "\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u4E0D\u80FD\u76F4\u63A5\u4FEE\u6539\uFF0C\u8BF7\u521B\u5EFA\u4E00\u4E2A\u540E\u7EED\u4EFB\u52A1"
        );
      }
      const at = nowIso(this.now);
      if (input.title !== void 0) {
        task.title = requiredText(input.title, "title", 160);
      }
      if (input.goal !== void 0) {
        task.goal = optionalText(input.goal, "goal", 2e3);
      }
      if (input.priority !== void 0) {
        if (!isTaskPriority(input.priority)) {
          throw new StudioStoreError("invalid_input", "priority \u65E0\u6548");
        }
        task.priority = input.priority;
      }
      if (input.ownerRoleId !== void 0) {
        task.ownerRoleId = this.resolveRoleId(
          state,
          task.projectId,
          input.ownerRoleId,
          "ownerRoleId"
        );
      }
      if (input.reviewerRoleId !== void 0) {
        task.reviewerRoleId = this.resolveRoleId(
          state,
          task.projectId,
          input.reviewerRoleId,
          "reviewerRoleId"
        );
      }
      if (input.acceptance !== void 0) {
        task.acceptance = normalizeAcceptance(input.acceptance, task.acceptance);
      }
      if (input.evidence !== void 0) {
        task.evidence = normalizeEvidence(input.evidence, task.evidence, at);
      }
      if (input.branch !== void 0) {
        task.branch = optionalText(input.branch, "branch", 160) || null;
      }
      task.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "task.updated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { fields: Object.keys(input) }
      });
      await this.save();
      return structuredClone(task);
    });
  }
  async transitionTask(taskId, next) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status === next) {
        return structuredClone(task);
      }
      if (!isTaskStatus(next) || !canTransition(task.status, next)) {
        throw new StudioStoreError(
          "invalid_transition",
          `\u4E0D\u80FD\u4ECE\u300C${task.status}\u300D\u76F4\u63A5\u5207\u6362\u5230\u300C${String(next)}\u300D`,
          409
        );
      }
      if (next === "done") {
        if (task.acceptance.length === 0) {
          throw new StudioStoreError(
            "acceptance_required",
            "\u6CA1\u6709\u9A8C\u6536\u6807\u51C6\uFF0C\u4E0D\u80FD\u5B8C\u6210\u4EFB\u52A1",
            409
          );
        }
        const open = task.acceptance.filter((item) => !item.done);
        if (open.length > 0) {
          throw new StudioStoreError(
            "acceptance_incomplete",
            `\u8FD8\u6709 ${String(open.length)} \u6761\u9A8C\u6536\u6807\u51C6\u672A\u5B8C\u6210`,
            409
          );
        }
        if (task.evidence.length === 0) {
          throw new StudioStoreError(
            "evidence_required",
            "\u9A8C\u6536\u524D\u81F3\u5C11\u8BB0\u5F55\u4E00\u6761\u53EF\u590D\u73B0\u7684\u8BC1\u636E\uFF08\u547D\u4EE4\u3001\u6D4B\u8BD5\u6216 replay\uFF09",
            409
          );
        }
      }
      const from = task.status;
      const at = nowIso(this.now);
      task.status = next;
      task.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "task.transitioned",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { from, to: next }
      });
      await this.save();
      return structuredClone(task);
    });
  }
  async listTransitions(taskId) {
    return this.runExclusive(async () => {
      const task = this.findTask(this.requireState(), taskId);
      return [...ALLOWED_TRANSITIONS[task.status]];
    });
  }
  async createMergeProposal(taskId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status !== "done") {
        throw new StudioStoreError(
          "task_not_accepted",
          "\u4EFB\u52A1\u9A8C\u6536\u901A\u8FC7\u540E\u624D\u80FD\u63D0\u4EA4\u5408\u5E76\u63D0\u6848",
          409
        );
      }
      if (task.acceptance.length === 0 || task.acceptance.some((item) => !item.done)) {
        throw new StudioStoreError(
          "acceptance_incomplete",
          "\u6240\u6709\u9A8C\u6536\u6807\u51C6\u5B8C\u6210\u524D\u4E0D\u80FD\u63D0\u4EA4\u5408\u5E76\u63D0\u6848",
          409
        );
      }
      if (task.evidence.length === 0) {
        throw new StudioStoreError(
          "evidence_required",
          "\u63D0\u4EA4\u5408\u5E76\u63D0\u6848\u524D\u81F3\u5C11\u8BB0\u5F55\u4E00\u6761\u8BC1\u636E",
          409
        );
      }
      const active = state.mergeProposals.find(
        (proposal2) => proposal2.taskId === task.id && (proposal2.status === "review" || proposal2.status === "approved" || proposal2.status === "merged")
      );
      if (active !== void 0) {
        throw new StudioStoreError(
          "merge_exists",
          `\u8BE5\u4EFB\u52A1\u5DF2\u6709\u5408\u5E76\u63D0\u6848\uFF08${MERGE_STATUS_LABELS[active.status]}\uFF09`,
          409
        );
      }
      const branch = requiredText(
        input.branch ?? task.branch ?? "",
        "branch",
        160
      );
      const risk = input.risk ?? "medium";
      if (!isMergeRisk(risk)) {
        throw new StudioStoreError("invalid_input", "risk \u5FC5\u987B\u662F low/medium/high");
      }
      const at = nowIso(this.now);
      const proposal = {
        id: newId("merge"),
        projectId: task.projectId,
        taskId: task.id,
        branch,
        base: optionalText(input.base ?? "main", "base", 160) || "main",
        summary: requiredText(input.summary, "summary", 1e3),
        risk,
        rollback: requiredText(input.rollback, "rollback", 1e3),
        status: "review",
        reviewNote: "",
        mergeCommit: null,
        createdAt: at,
        updatedAt: at,
        decidedAt: null,
        mergedAt: null
      };
      if (task.branch !== branch) {
        task.branch = branch;
        task.updatedAt = at;
      }
      state.mergeProposals.push(proposal);
      this.recordEvent(state, {
        type: "merge.proposed",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: {
          proposalId: proposal.id,
          branch: proposal.branch,
          base: proposal.base,
          risk: proposal.risk
        }
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(proposal);
    });
  }
  async approveMergeProposal(proposalId, note) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "review") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `\u53EA\u6709\u5F85\u8BC4\u5BA1\u7684\u5408\u5E76\u63D0\u6848\u53EF\u4EE5\u6279\u51C6\uFF1B\u5F53\u524D\u662F\u300C${MERGE_STATUS_LABELS[proposal.status]}\u300D`,
          409
        );
      }
      const at = nowIso(this.now);
      proposal.status = "approved";
      proposal.reviewNote = optionalText(note, "note", 1e3);
      proposal.decidedAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.approved",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: { proposalId: proposal.id, note: proposal.reviewNote }
      });
      await this.save();
      return structuredClone(proposal);
    });
  }
  async rejectMergeProposal(proposalId, note) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "review") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `\u53EA\u6709\u5F85\u8BC4\u5BA1\u7684\u5408\u5E76\u63D0\u6848\u53EF\u4EE5\u6253\u56DE\uFF1B\u5F53\u524D\u662F\u300C${MERGE_STATUS_LABELS[proposal.status]}\u300D`,
          409
        );
      }
      const at = nowIso(this.now);
      proposal.status = "rejected";
      proposal.reviewNote = requiredText(note, "note", 1e3);
      proposal.decidedAt = at;
      proposal.updatedAt = at;
      const task = state.tasks.find((item) => item.id === proposal.taskId);
      if (task !== void 0 && (task.status === "review" || task.status === "done")) {
        task.status = "running";
        task.updatedAt = at;
        this.recordEvent(state, {
          type: "task.reopened",
          at,
          projectId: task.projectId,
          taskId: task.id,
          payload: { reason: "merge_rejected", proposalId: proposal.id }
        });
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.rejected",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: { proposalId: proposal.id, note: proposal.reviewNote }
      });
      await this.save();
      return structuredClone(proposal);
    });
  }
  async completeMergeProposal(proposalId, mergeCommit) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      if (proposal.status !== "approved") {
        throw new StudioStoreError(
          "invalid_merge_status",
          `\u53EA\u6709\u5DF2\u6279\u51C6\u7684\u5408\u5E76\u63D0\u6848\u53EF\u4EE5\u6807\u8BB0\u5408\u5E76\uFF1B\u5F53\u524D\u662F\u300C${MERGE_STATUS_LABELS[proposal.status]}\u300D`,
          409
        );
      }
      const at = nowIso(this.now);
      proposal.status = "merged";
      proposal.mergeCommit = optionalText(mergeCommit, "mergeCommit", 160) || null;
      proposal.mergedAt = at;
      proposal.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "merge.merged",
        at,
        projectId: proposal.projectId,
        taskId: proposal.taskId,
        payload: {
          proposalId: proposal.id,
          mergeCommit: proposal.mergeCommit
        }
      });
      await this.save();
      return structuredClone(proposal);
    });
  }
  async load() {
    await mkdir(this.dataDir, { recursive: true });
    if (!existsSync(this.file)) {
      this.state = this.seedState();
      await this.save();
      return;
    }
    const raw = await readFile2(this.file, "utf8");
    try {
      const parsed = JSON.parse(raw);
      const migrated = migrateState(parsed);
      assertState(migrated);
      this.state = migrated;
      if (!isRecord(parsed) || parsed.schemaVersion !== STUDIO_SCHEMA_VERSION) {
        await this.save();
      }
    } catch (error) {
      const backup = `${this.file}.corrupt-${String(Date.now())}`;
      await rename(this.file, backup).catch(() => void 0);
      this.state = this.seedState();
      this.warning = `studio.json \u65E0\u6CD5\u8BFB\u53D6\uFF0C\u5DF2\u5907\u4EFD\u5230 ${backup} \u5E76\u91CD\u5EFA\u6F14\u793A\u6570\u636E\uFF1A${error instanceof Error ? error.message : String(error)}`;
      await this.save();
    }
  }
  async save() {
    const state = this.requireState();
    state.updatedAt = nowIso(this.now);
    const serialized = `${JSON.stringify(state, null, 2)}
`;
    const temp = `${this.file}.${randomUUID2()}.tmp`;
    await writeFile(temp, serialized, "utf8");
    try {
      await rename(temp, this.file);
    } catch {
      await rm(this.file, { force: true });
      await rename(temp, this.file);
    }
  }
  requireState() {
    if (this.state === null) {
      throw new StudioStoreError(
        "store_not_ready",
        "Studio \u6570\u636E\u5C1A\u672A\u521D\u59CB\u5316",
        500
      );
    }
    return this.state;
  }
  pickProject(state, projectId) {
    if (projectId !== void 0) {
      const project = state.projects.find((item) => item.id === projectId);
      if (project === void 0) {
        throw new StudioStoreError("project_not_found", "\u9879\u76EE\u4E0D\u5B58\u5728", 404);
      }
      return project;
    }
    if (state.activeProjectId !== null) {
      const active = state.projects.find(
        (item) => item.id === state.activeProjectId
      );
      if (active !== void 0) return active;
    }
    return state.projects[0] ?? null;
  }
  findTask(state, taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task === void 0) {
      throw new StudioStoreError("task_not_found", "\u4EFB\u52A1\u4E0D\u5B58\u5728", 404);
    }
    return task;
  }
  findMergeProposal(state, proposalId) {
    const proposal = state.mergeProposals.find((item) => item.id === proposalId);
    if (proposal === void 0) {
      throw new StudioStoreError("merge_not_found", "\u5408\u5E76\u63D0\u6848\u4E0D\u5B58\u5728", 404);
    }
    return proposal;
  }
  resolveRoleId(state, projectId, value, field) {
    if (value === void 0 || value === null || value === "") return null;
    if (typeof value !== "string") {
      throw new StudioStoreError("invalid_input", `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
    }
    const role = state.roles.find(
      (item) => item.id === value && item.projectId === projectId
    );
    if (role === void 0) {
      throw new StudioStoreError(
        "role_not_found",
        `${field} \u6307\u5411\u7684\u89D2\u8272\u4E0D\u5B58\u5728`,
        404
      );
    }
    return role.id;
  }
  recordEvent(state, input) {
    const event = {
      id: newId("evt"),
      type: input.type,
      at: input.at,
      actor: "human",
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      payload: input.payload ?? {}
    };
    state.events.push(event);
    if (state.events.length > 2e3) {
      state.events.splice(0, state.events.length - 2e3);
    }
  }
  runExclusive(work) {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  seedState() {
    const at = nowIso(this.now);
    const project = {
      id: "proj-demo",
      name: "MOBA \u5782\u76F4\u5207\u7247",
      description: "\u7528\u4E00\u6761\u53EF\u73A9\u7684\u6700\u5C0F\u94FE\u8DEF\u9A8C\u8BC1\u5DE5\u4F5C\u53F0\uFF1A\u4EFB\u52A1\u3001\u89D2\u8272\u3001\u9A8C\u6536\u548C\u72B6\u6001\u673A\u3002",
      tokenBudget: null,
      createdAt: at,
      updatedAt: at
    };
    const role = (id, name2, title, mission, responsibilities, decisionRights = []) => ({
      id,
      projectId: project.id,
      name: name2,
      title,
      mission,
      responsibilities,
      nonGoals: [],
      decisionRights,
      model: null,
      tokenBudget: null,
      dailyTokenBudget: null,
      createdAt: at,
      updatedAt: at
    });
    const roles = [
      role(
        "role-lead",
        "Lead",
        "\u5236\u4F5C\u4EBA / \u8C03\u5EA6",
        "\u628A\u76EE\u6807\u53D8\u6210\u53EF\u6267\u884C\u7684\u4EFB\u52A1\u56FE\uFF0C\u5E76\u4FDD\u6301\u4EA4\u4ED8\u8282\u594F\u3002",
        ["\u62C6\u4EFB\u52A1", "\u6D3E\u5355", "\u8DDF\u8E2A\u963B\u585E", "\u7EC4\u7EC7\u590D\u76D8"],
        ["\u4EFB\u52A1\u4F18\u5148\u7EA7", "\u6D3E\u5355\u5BF9\u8C61"]
      ),
      role(
        "role-architect",
        "Architect",
        "\u67B6\u6784\u5E08",
        "\u5B88\u4F4F\u67B6\u6784\u5B8C\u6574\u6027\u4E0E\u63A5\u53E3\u5951\u7EA6\u3002",
        ["\u5199 ADR", "\u5B9A\u5951\u7EA6", "\u6280\u672F\u88C1\u51B3", "\u8BC4\u5BA1\u9AD8\u98CE\u9669\u53D8\u66F4"],
        ["\u6280\u672F\u65B9\u6848", "\u63A5\u53E3\u5951\u7EA6"]
      ),
      role(
        "role-builder",
        "Builder",
        "Gameplay \u5DE5\u7A0B\u5E08",
        "\u4EA4\u4ED8\u53EF\u8FD0\u884C\u7684\u73A9\u6CD5\u5B9E\u73B0\u548C\u6D4B\u8BD5\u3002",
        ["\u5B9E\u73B0\u6280\u80FD/\u79FB\u52A8/\u51B7\u5374", "\u8865\u5355\u6D4B", "\u7EF4\u62A4\u6784\u5EFA"]
      ),
      role(
        "role-verifier",
        "Verifier",
        "QA / \u9A8C\u6536",
        "\u72EC\u7ACB\u9A8C\u8BC1\u4EA7\u7269\uFF0C\u5B88\u4F4F\u8D28\u91CF\u95E8\u3002",
        ["\u8DD1\u6D4B\u8BD5", "\u590D\u73B0\u7F3A\u9677", "\u68C0\u67E5\u9A8C\u6536\u6807\u51C6", "\u8BB0\u5F55\u8BC1\u636E"],
        ["\u9A8C\u6536\u7ED3\u8BBA"]
      )
    ];
    const acceptance = (...texts) => texts.map((text, index) => ({
      id: `acc-demo-${String(index)}-${randomUUID2().slice(0, 4)}`,
      text,
      done: false
    }));
    const task = (id, title, goal, status, priority, ownerRoleId, reviewerRoleId, items, branch = null) => ({
      id,
      projectId: project.id,
      title,
      goal,
      status,
      priority,
      ownerRoleId,
      reviewerRoleId,
      acceptance: items,
      evidence: [],
      branch,
      createdAt: at,
      updatedAt: at
    });
    const tasks = [
      task(
        "task-001",
        "\u9501\u5B9A\u5782\u76F4\u5207\u7247\u8303\u56F4",
        "\u5199\u6E05\u695A\u8FD9\u4E00\u7248\u505A\u4EC0\u4E48\u3001\u4E0D\u505A\u4EC0\u4E48\uFF0C\u4EE5\u53CA\u53EF\u73A9\u9A8C\u6536\u3002",
        "done",
        "P0",
        "role-lead",
        "role-architect",
        acceptance("\u8303\u56F4\u6587\u6863\u5DF2\u8BC4\u5BA1", "\u975E\u76EE\u6807\u6E05\u5355\u5DF2\u786E\u8BA4", "\u9A8C\u6536\u53E3\u5F84\u5DF2\u5BF9\u9F50").map(
          (item) => ({ ...item, done: true })
        )
      ),
      task(
        "task-002",
        "\u642D\u5EFA 30Hz \u56FA\u5B9A tick \u9AA8\u67B6",
        "\u670D\u52A1\u7AEF\u56FA\u5B9A tick\uFF0C\u5BA2\u6237\u7AEF\u80FD\u7A33\u5B9A\u6D88\u8D39\u5FEB\u7167\u3002",
        "review",
        "P0",
        "role-architect",
        "role-verifier",
        acceptance("tick \u7A33\u5B9A\u5728 30Hz", "\u5FEB\u7167\u53EF\u91CD\u653E", "\u65AD\u7EBF\u91CD\u8FDE\u4E0D\u5D29\u6E83").map(
          (item, index) => ({ ...item, done: index < 2 })
        ),
        "task/002-fixed-tick"
      ),
      task(
        "task-003",
        "\u5B9E\u73B0\u6280\u80FD\u51B7\u5374\u4E0E\u65BD\u6CD5\u524D\u6447",
        "\u4E00\u4E2A\u82F1\u96C4\u7684\u4E00\u4E2A\u6280\u80FD\uFF0C\u5305\u542B\u51B7\u5374\u3001\u524D\u6447\u548C\u6253\u65AD\u3002",
        "running",
        "P0",
        "role-builder",
        "role-architect",
        acceptance("\u51B7\u5374\u6309 tick \u8BA1\u7B97", "\u524D\u6447\u53EF\u88AB\u63A7\u5236\u6253\u65AD", "\u5355\u6D4B\u8986\u76D6\u8FB9\u754C").map(
          (item, index) => ({ ...item, done: index === 0 })
        ),
        "task/003-ability"
      ),
      task(
        "task-004",
        "\u5EFA\u7ACB replay \u4E0E\u6027\u80FD\u57FA\u7EBF",
        "\u6BCF\u6B21\u5408\u5E76\u90FD\u80FD\u8DD1\u540C\u4E00\u6BB5 replay\uFF0C\u5E76\u8BB0\u5F55\u5E27\u65F6\u95F4\u3002",
        "ready",
        "P1",
        "role-verifier",
        "role-lead",
        acceptance("replay \u53EF\u590D\u73B0", "\u6027\u80FD\u57FA\u7EBF\u6709\u9608\u503C")
      ),
      task(
        "task-005",
        "\u9996\u8F6E playtest \u95EE\u9898\u6E05\u5355",
        "\u4EBA\u7C7B\u5B9E\u9645\u73A9\u4E00\u5C40\uFF0C\u8BB0\u5F55\u624B\u611F\u3001\u53EF\u8BFB\u6027\u548C\u963B\u65AD\u95EE\u9898\u3002",
        "backlog",
        "P1",
        "role-lead",
        "role-verifier",
        acceptance("\u81F3\u5C11 1 \u5C40\u5B8C\u6574\u5BF9\u5C40", "\u95EE\u9898\u6309\u963B\u65AD/\u91CD\u8981/\u5EFA\u8BAE\u5206\u7EA7")
      )
    ];
    return {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      createdAt: at,
      updatedAt: at,
      activeProjectId: project.id,
      projects: [project],
      roles,
      tasks,
      mergeProposals: [],
      runs: [],
      events: [
        {
          id: "evt-demo",
          type: "studio.seeded",
          at,
          actor: "system",
          projectId: project.id,
          taskId: null,
          payload: { message: "\u6F14\u793A\u9879\u76EE\u5DF2\u521B\u5EFA" }
        }
      ]
    };
  }
};

// src/host/router.ts
var MAX_BODY_BYTES = 1024 * 1024;
var API_PREFIX = "/studio-api";
var HttpError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
};
function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
function sendJson(res, status, value) {
  const body = `${JSON.stringify(value)}
`;
  setSecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body).toString()
  });
  res.end(body);
}
function sendError(res, status, code, message) {
  const body = { error: { code, message } };
  sendJson(res, status, body);
}
function requestOf(req) {
  const headers = new Headers();
  for (const [name2, value] of Object.entries(req.headers)) {
    if (value === void 0) continue;
    headers.set(name2, Array.isArray(value) ? value.join(", ") : value);
  }
  const host = req.headers.host ?? "127.0.0.1";
  return new Request(`http://${host}${req.url ?? "/"}`, {
    method: "GET",
    headers
  });
}
function assertJsonRequest(req) {
  const contentType = req.headers["content-type"];
  if (typeof contentType === "string" && !contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F application/json"
    );
  }
}
async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, "payload_too_large", "\u8BF7\u6C42\u4F53\u8D85\u8FC7 1 MB \u9650\u5236");
    }
    chunks.push(buffer);
  }
  if (total === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_json", "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON \u5BF9\u8C61");
  }
}
function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "invalid_path", "\u8DEF\u5F84\u53C2\u6570\u7F16\u7801\u65E0\u6548");
  }
}
function asString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "invalid_input", `${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  }
  return value;
}
function asOptionalString(value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_input", `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
  }
  return value;
}
function asStringArray(value, field) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpError(400, "invalid_input", `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  }
  return value;
}
function asTaskStatus(value) {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_input", "status \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
  }
  return value;
}
function asOptionalBudget(value, field) {
  if (value === void 0) return void 0;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(
      400,
      "invalid_input",
      `${field} \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570 token \u6570`
    );
  }
  return value === 0 ? null : value;
}
function asCreateProject(body) {
  return {
    name: asString(body.name, "name"),
    description: asOptionalString(body.description, "description"),
    tokenBudget: asOptionalBudget(body.tokenBudget, "tokenBudget")
  };
}
function asCreateRole(body) {
  return {
    name: asString(body.name, "name"),
    title: asOptionalString(body.title, "title"),
    mission: asOptionalString(body.mission, "mission"),
    responsibilities: asStringArray(body.responsibilities, "responsibilities"),
    model: asOptionalString(body.model, "model") ?? null,
    tokenBudget: asOptionalBudget(body.tokenBudget, "tokenBudget"),
    dailyTokenBudget: asOptionalBudget(
      body.dailyTokenBudget,
      "dailyTokenBudget"
    )
  };
}
function asCreateTask(body) {
  const owner = body.ownerRoleId === null || body.ownerRoleId === void 0 ? null : asString(body.ownerRoleId, "ownerRoleId");
  const reviewer = body.reviewerRoleId === null || body.reviewerRoleId === void 0 ? null : asString(body.reviewerRoleId, "reviewerRoleId");
  const priority = body.priority === "P0" || body.priority === "P1" || body.priority === "P2" ? body.priority : "P1";
  return {
    title: asString(body.title, "title"),
    goal: asOptionalString(body.goal, "goal"),
    priority,
    ownerRoleId: owner,
    reviewerRoleId: reviewer,
    acceptance: asStringArray(body.acceptance, "acceptance"),
    branch: asOptionalString(body.branch, "branch") ?? null
  };
}
function asUpdateTask(body) {
  const result = {};
  if (body.title !== void 0) result.title = asString(body.title, "title");
  if (body.goal !== void 0) result.goal = asOptionalString(body.goal, "goal");
  if (body.priority !== void 0) {
    if (body.priority !== "P0" && body.priority !== "P1" && body.priority !== "P2") {
      throw new HttpError(400, "invalid_input", "priority \u65E0\u6548");
    }
    result.priority = body.priority;
  }
  if (body.ownerRoleId !== void 0) {
    result.ownerRoleId = body.ownerRoleId === null ? null : asString(body.ownerRoleId, "ownerRoleId");
  }
  if (body.reviewerRoleId !== void 0) {
    result.reviewerRoleId = body.reviewerRoleId === null ? null : asString(body.reviewerRoleId, "reviewerRoleId");
  }
  if (body.acceptance !== void 0) {
    if (!Array.isArray(body.acceptance)) {
      throw new HttpError(400, "invalid_input", "acceptance \u5FC5\u987B\u662F\u6570\u7EC4");
    }
    result.acceptance = body.acceptance;
  }
  if (body.evidence !== void 0) {
    if (!Array.isArray(body.evidence)) {
      throw new HttpError(400, "invalid_input", "evidence \u5FC5\u987B\u662F\u6570\u7EC4");
    }
    result.evidence = body.evidence;
  }
  if (body.branch !== void 0) {
    result.branch = body.branch === null ? null : asOptionalString(body.branch, "branch");
  }
  return result;
}
function asMergeRisk(value) {
  if (value === void 0) return "medium";
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new HttpError(400, "invalid_input", "risk \u5FC5\u987B\u662F low/medium/high");
}
function asCreateMergeProposal(body) {
  return {
    summary: asString(body.summary, "summary"),
    rollback: asString(body.rollback, "rollback"),
    risk: asMergeRisk(body.risk),
    base: asOptionalString(body.base, "base"),
    branch: asOptionalString(body.branch, "branch")
  };
}
function asNote(body) {
  return asOptionalString(body.note, "note");
}
var StudioRouter = class {
  store;
  token;
  dshVersion;
  compatibility;
  connection;
  getBootPayload;
  dispatchTask;
  constructor(options) {
    this.store = options.store;
    this.token = options.token;
    this.dshVersion = options.dshVersion;
    this.compatibility = options.compatibility;
    this.connection = options.connection;
    this.getBootPayload = options.getBootPayload;
    this.dispatchTask = options.dispatchTask;
  }
  async handle(req, res) {
    const parsed = this.parse(req);
    if (parsed.pathname === `${API_PREFIX}/health`) {
      if (parsed.method !== "GET") {
        throw new HttpError(405, "method_not_allowed", "\u53EA\u652F\u6301 GET");
      }
      sendJson(res, 200, {
        ok: true,
        service: "dsh-studio",
        pluginVersion: STUDIO_PLUGIN_VERSION,
        dshVersion: this.dshVersion,
        compatibility: this.compatibility,
        time: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/boot`) {
      this.requireMethod(parsed, ["GET"]);
      const origin = req.headers.origin;
      const desktopOrigin = typeof origin === "string" && (origin.startsWith("dsh-app://") || origin.startsWith("file://") || origin === "null");
      if (desktopOrigin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      }
      const admission = this.connection.admit(requestOf(req));
      if (admission.rejection !== void 0 && !desktopOrigin) {
        sendError(
          res,
          admission.rejection,
          "unauthorized",
          "DSH \u4F1A\u8BDD\u6CA1\u6709\u901A\u8FC7\u8BA4\u8BC1\uFF0C\u65E0\u6CD5\u83B7\u53D6 Studio \u542F\u52A8\u53C2\u6570"
        );
        return;
      }
      sendJson(res, 200, this.getBootPayload());
      return;
    }
    this.assertAuthorized(req);
    if (parsed.pathname === `${API_PREFIX}/bootstrap`) {
      this.requireMethod(parsed, ["GET"]);
      const projectId = parsed.url.searchParams.get("projectId") ?? void 0;
      const data = await this.store.bootstrap(projectId);
      data.app.dshVersion = this.dshVersion;
      data.app.compatibility = this.compatibility;
      data.app.warning = this.store.getWarning();
      sendJson(res, 200, data);
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/projects`) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const project = await this.store.createProject(
        asCreateProject(await readJson(req))
      );
      sendJson(res, 201, { ok: true, project });
      return;
    }
    const selectProject = /^\/studio-api\/projects\/([^/]+)\/select$/.exec(
      parsed.pathname
    );
    if (selectProject !== null) {
      this.requireMethod(parsed, ["POST"]);
      const project = await this.store.selectProject(
        decodeSegment(selectProject[1] ?? "")
      );
      sendJson(res, 200, { ok: true, project });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/roles`) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const role = await this.store.createRole(
        asCreateRole(await readJson(req))
      );
      sendJson(res, 201, { ok: true, role });
      return;
    }
    const roleMatch = /^\/studio-api\/roles\/([^/]+)$/.exec(parsed.pathname);
    if (roleMatch !== null) {
      this.requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const role = await this.store.updateRole(
        decodeSegment(roleMatch[1] ?? ""),
        {
          name: asOptionalString(body.name, "name"),
          title: asOptionalString(body.title, "title"),
          mission: asOptionalString(body.mission, "mission"),
          responsibilities: asStringArray(
            body.responsibilities,
            "responsibilities"
          ),
          model: asOptionalString(body.model, "model"),
          tokenBudget: asOptionalBudget(body.tokenBudget, "tokenBudget"),
          dailyTokenBudget: asOptionalBudget(
            body.dailyTokenBudget,
            "dailyTokenBudget"
          )
        }
      );
      sendJson(res, 200, { ok: true, role });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/tasks`) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const task = await this.store.createTask(
        asCreateTask(await readJson(req))
      );
      sendJson(res, 201, { ok: true, task });
      return;
    }
    const taskTransition = /^\/studio-api\/tasks\/([^/]+)\/transition$/.exec(parsed.pathname);
    if (taskTransition !== null) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const task = await this.store.transitionTask(
        decodeSegment(taskTransition[1] ?? ""),
        asTaskStatus(body.status)
      );
      sendJson(res, 200, { ok: true, task });
      return;
    }
    const taskDispatch = /^\/studio-api\/tasks\/([^/]+)\/dispatch$/.exec(parsed.pathname);
    if (taskDispatch !== null) {
      this.requireMethod(parsed, ["POST"]);
      const run = await this.dispatchTask(
        decodeSegment(taskDispatch[1] ?? "")
      );
      sendJson(res, 202, { ok: true, run });
      return;
    }
    const taskMerge = /^\/studio-api\/tasks\/([^/]+)\/merge-proposal$/.exec(parsed.pathname);
    if (taskMerge !== null) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const proposal = await this.store.createMergeProposal(
        decodeSegment(taskMerge[1] ?? ""),
        asCreateMergeProposal(await readJson(req))
      );
      sendJson(res, 201, { ok: true, proposal });
      return;
    }
    const mergeDecision = /^\/studio-api\/merge-proposals\/([^/]+)\/(approve|reject|merge)$/.exec(
      parsed.pathname
    );
    if (mergeDecision !== null) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const proposalId = decodeSegment(mergeDecision[1] ?? "");
      const action = mergeDecision[2];
      const proposal = action === "approve" ? await this.store.approveMergeProposal(proposalId, asNote(body)) : action === "reject" ? await this.store.rejectMergeProposal(
        proposalId,
        asNote(body) ?? ""
      ) : await this.store.completeMergeProposal(
        proposalId,
        asOptionalString(body.mergeCommit, "mergeCommit")
      );
      sendJson(res, 200, { ok: true, proposal });
      return;
    }
    const taskMatch = /^\/studio-api\/tasks\/([^/]+)$/.exec(parsed.pathname);
    if (taskMatch !== null) {
      this.requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const task = await this.store.updateTask(
        decodeSegment(taskMatch[1] ?? ""),
        asUpdateTask(await readJson(req))
      );
      sendJson(res, 200, { ok: true, task });
      return;
    }
    throw new HttpError(404, "not_found", "\u63A5\u53E3\u4E0D\u5B58\u5728");
  }
  parse(req) {
    const method = (req.method ?? "GET").toUpperCase();
    const url = new URL(req.url ?? "/", "http://studio.local");
    return {
      method,
      pathname: url.pathname,
      url
    };
  }
  assertAuthorized(req) {
    const headerToken = req.headers["x-studio-token"];
    const authorization = req.headers.authorization;
    const bearer = typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
    const candidate = typeof headerToken === "string" ? headerToken.trim() : bearer;
    if (candidate === "" || candidate !== this.token) {
      throw new HttpError(401, "unauthorized", "\u7F3A\u5C11\u6216\u65E0\u6548\u7684 Studio \u8BBF\u95EE\u4EE4\u724C");
    }
  }
  requireMethod(parsed, methods) {
    if (!methods.includes(parsed.method)) {
      throw new HttpError(
        405,
        "method_not_allowed",
        `\u53EA\u652F\u6301 ${methods.join(", ")}`
      );
    }
  }
};
function handleRouterError(res, error) {
  if (error instanceof StudioStoreError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }
  if (error instanceof HttpError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  sendError(res, 500, "internal_error", message);
}

// src/host/index.ts
var name = "dsh-studio";
var inject = [
  "webServer",
  "connection",
  "agents",
  "agentPresets",
  "agentDefaultModel",
  "llm",
  "tokenMeter"
];
async function apply(ctx) {
  const runtime = await readRuntimeInfo();
  const compatibility = compatibilityOf(runtime.version);
  const capabilities = hostCapabilities(ctx, runtime.version);
  if (!capabilities.webServer || typeof ctx.webServer.register !== "function" || typeof ctx.on !== "function" || typeof ctx.connection?.admit !== "function") {
    ctx.logger?.error(
      "dsh-studio: this DSH build does not expose webServer.register + connection.admit; the Studio page stays unmounted."
    );
    return;
  }
  const store = new StudioStore();
  await store.init();
  const dispatcher = new AgentDispatcher(
    ctx,
    store
  );
  const token = randomBytes(24).toString("hex");
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const bootPayload = {
    token,
    basePath: "/studio-api",
    pluginVersion: STUDIO_PLUGIN_VERSION,
    dshVersion: runtime.version,
    startedAt,
    dataDir: store.dataDir
  };
  const router = new StudioRouter({
    store,
    token,
    dshVersion: runtime.version,
    compatibility,
    connection: ctx.connection,
    getBootPayload: () => bootPayload,
    dispatchTask: (taskId) => dispatcher.dispatch(taskId)
  });
  const install = () => {
    const disposeRoute = ctx.webServer.register({
      kind: "prefix",
      path: "/studio-api",
      handler: async (req, res) => {
        try {
          await router.handle(req, res);
        } catch (error) {
          if (res.headersSent) {
            res.destroy();
            return;
          }
          handleRouterError(res, error);
        }
      }
    });
    const disposeInjection = ctx.on?.("webserver/index-inject", (rows) => {
      rows.push({
        kind: "global",
        name: "__DSH_STUDIO__",
        value: bootPayload
      });
    });
    return () => {
      disposeRoute();
      disposeInjection?.();
    };
  };
  if (typeof ctx.effect === "function") {
    ctx.effect(install, "dsh-studio: route + boot payload");
  } else {
    install();
  }
  ctx.logger?.info(
    `dsh-studio ${STUDIO_PLUGIN_VERSION} ready (DSH ${runtime.version}, origin ${safeOrigin(ctx) ?? "unknown"}, data ${store.dataDir})`
  );
  if (compatibility.status !== "supported") {
    ctx.logger?.warn(`dsh-studio compatibility: ${compatibility.message}`);
  }
}
export {
  apply,
  inject,
  name
};
