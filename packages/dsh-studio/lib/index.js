// src/host/index.ts
import { randomBytes } from "node:crypto";

// src/shared/types.ts
var STUDIO_SCHEMA_VERSION = 14;
var STUDIO_PLUGIN_VERSION = "1.6.0";
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

// src/host/workspace.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path2 from "node:path";
var WorkspaceError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const detail = error instanceof Error && "stderr" in error ? String(error.stderr ?? "") : String(error);
    throw new WorkspaceError(
      "git_failed",
      `git ${args.join(" ")} \u5931\u8D25\uFF1A${detail.slice(0, 800)}`
    );
  }
}
function sanitize(taskId) {
  return taskId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
}
var WorkspaceManager = class {
  async prepare(repoPath, taskId) {
    const resolved = path2.resolve(repoPath);
    if (!existsSync(resolved)) {
      throw new WorkspaceError(
        "repo_missing",
        `\u9879\u76EE\u4ED3\u5E93\u4E0D\u5B58\u5728\uFF1A${resolved}`
      );
    }
    const root = git(resolved, ["rev-parse", "--show-toplevel"]);
    const worktreeRoot = path2.join(root, ".worktrees");
    const worktreePath = path2.join(worktreeRoot, sanitize(taskId));
    const branch = `studio/${sanitize(taskId)}`;
    await mkdir(worktreeRoot, { recursive: true });
    if (existsSync(worktreePath)) {
      return { repoPath: root, path: worktreePath, branch };
    }
    const branches = git(root, ["branch", "--list", branch]);
    if (branches === "") {
      git(root, ["worktree", "add", "-b", branch, worktreePath, "HEAD"]);
    } else {
      git(root, ["worktree", "add", worktreePath, branch]);
    }
    return { repoPath: root, path: worktreePath, branch };
  }
  diffStat(worktreePath) {
    if (!existsSync(worktreePath)) return "";
    const status = git(worktreePath, ["status", "--short"]);
    const stat = git(worktreePath, ["diff", "--stat"]);
    return [status, stat].filter((line) => line !== "").join("\n").trim();
  }
};

// src/host/dispatcher.ts
function changedFilesFromDiff(diffStat) {
  if (diffStat === null) return [];
  return diffStat.split("\n").map((line) => /^[ MARC?]{1,2} (\S.*)$/.exec(line)?.[1]?.trim() ?? "").filter(Boolean);
}
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
function buildPrompt(context, workspace) {
  const { task, role, project } = context;
  const module = context.module;
  const acceptance = task.acceptance.map((item, index) => `${String(index + 1)}. ${item.text}`).join("\n");
  const mode = workspace === void 0 ? [
    "\u672C\u8F6E\u53EA\u505A\u5206\u6790/\u89C4\u5212\uFF0C\u4E0D\u8981\u4FEE\u6539\u4EFB\u4F55\u6587\u4EF6\uFF0C\u4E0D\u8981\u6267\u884C\u4F1A\u6539\u53D8\u7CFB\u7EDF\u72B6\u6001\u7684\u547D\u4EE4\u3002"
  ] : [
    `\u4EE3\u7801\u6267\u884C\u6A21\u5F0F\uFF1A\u4F60\u5DF2\u5728\u72EC\u7ACB worktree \u4E2D\u5DE5\u4F5C\u3002`,
    `\u4ED3\u5E93\uFF1A${workspace.repoPath}`,
    `\u5DE5\u4F5C\u533A\uFF1A${workspace.path}`,
    `\u5206\u652F\uFF1A${workspace.branch}`,
    "\u53EF\u4EE5\u4FEE\u6539\u5DE5\u4F5C\u533A\u6587\u4EF6\u3001\u8FD0\u884C\u6D4B\u8BD5\u548C\u6784\u5EFA\uFF1B\u4E0D\u8981\u5207\u6362/\u5220\u9664 worktree\uFF0C\u4E0D\u8981 merge\u3001push \u6216\u4FEE\u6539\u4E3B\u5DE5\u4F5C\u533A\u3002",
    "\u53EA\u4FEE\u6539\u6A21\u5757/\u5951\u7EA6\u5141\u8BB8\u7684\u8303\u56F4\uFF1B\u9700\u8981\u6539\u5951\u7EA6\u672C\u8EAB\u65F6\uFF0C\u5728\u56DE\u6267\u91CC\u63D0\u51FA decision\uFF0C\u4E0D\u8981\u76F4\u63A5\u6539\u5951\u7EA6\u3002",
    "\u5B8C\u6210\u540E\u5FC5\u987B\u62A5\u544A\u4F60\u5B9E\u9645\u8FD0\u884C\u8FC7\u7684\u547D\u4EE4\u548C\u6D4B\u8BD5\u7ED3\u679C\u3002"
  ];
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
    `\u7968\u7C7B\u578B\uFF1A${task.kind === "fix" ? "\u6539\u4FEE\u578B\uFF08\u5148\u8BCA\u65AD\u518D\u6539\uFF09" : "\u65B0\u5EFA\u578B\uFF08red\u2192green\uFF09"}`,
    `\u6A21\u5757\uFF1A${task.module ?? "\u672A\u6307\u5B9A"}`,
    module === null ? "" : `\u6A21\u5757\u804C\u8D23\uFF1A${module.responsibility || "\u672A\u586B\u5199"}`,
    module === null ? "" : `\u5141\u8BB8\u8DEF\u5F84\uFF1A${module.allowedPaths.join("\uFF1B") || "\u672A\u9650\u5236"}`,
    module === null ? "" : `\u7981\u6B62\u8DEF\u5F84\uFF1A${module.forbiddenPaths.join("\uFF1B") || "\u65E0"}`,
    module === null || module.contractText === "" ? "" : `\u6A21\u5757\u5951\u7EA6\uFF1A
${module.contractText.slice(0, 6e3)}`,
    `\u5951\u7EA6\uFF1A${task.contractRef ?? module?.contractPath ?? "\u672A\u6307\u5B9A"}`,
    `\u5206\u652F\uFF1A${workspace?.branch ?? task.branch ?? "\u672A\u521B\u5EFA"}`,
    "\u9A8C\u6536\u6807\u51C6\uFF1A",
    acceptance || "\uFF08\u65E0\uFF09",
    "",
    ...mode,
    "\u8BF7\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF08\u4E0D\u8981\u8F93\u51FA JSON \u4EE5\u5916\u7684\u89E3\u91CA\uFF09\uFF0C\u5B57\u6BB5\u5982\u4E0B\uFF1A",
    '{"summary":"\u4E00\u53E5\u8BDD\u7ED3\u8BBA","evidence":["\u53EF\u590D\u73B0\u7684\u8BC1\u636E/\u68C0\u67E5\u7ED3\u679C"],"artifacts":[{"kind":"plan|diff|test|doc","path":"\u8DEF\u5F84\u6216\u8BF4\u660E"}],"decisions":[{"title":"\u51B3\u7B56","rationale":"\u7406\u7531","scope":"branch|project"}],"contractDeltas":[{"contract":"\u5951\u7EA6\u8DEF\u5F84","change":"\u53D8\u66F4"}],"rejectedOptions":[{"option":"\u88AB\u5426\u51B3\u65B9\u6848","reason":"\u539F\u56E0"}],"blockers":["\u963B\u585E"]}',
    "\u6CA1\u6709\u5185\u5BB9\u7684\u5B57\u6BB5\u7528\u7A7A\u6570\u7EC4\u3002\u4E0D\u8981\u58F0\u79F0\u4EFB\u52A1\u5DF2\u7ECF\u5B8C\u6210\uFF1B\u9A8C\u6536\u7531\u4EBA\u7C7B/Verifier \u51B3\u5B9A\u3002"
  ].filter((line) => line !== "").join("\n");
}
function buildReviewPrompt(context) {
  return [
    "\u4F60\u662F Studio \u7684\u72EC\u7ACB\u9A8C\u6536\u8005\u3002\u4E0D\u8981\u76F8\u4FE1\u5B9E\u73B0\u8005\u7684\u81EA\u8FF0\uFF0C\u76F4\u63A5\u770B worktree \u7684 diff \u548C\u9A8C\u8BC1\u8F93\u51FA\u3002",
    `\u9879\u76EE\uFF1A${context.project.name}`,
    `\u4EFB\u52A1\uFF1A${context.task.title}`,
    `\u4EFB\u52A1\u76EE\u6807\uFF1A${context.task.goal || "\u672A\u586B\u5199"}`,
    `\u6A21\u5757\uFF1A${context.task.module ?? "\u672A\u6307\u5B9A"}`,
    `\u5951\u7EA6\uFF1A${context.task.contractRef ?? "\u672A\u6307\u5B9A"}`,
    "\u9A8C\u6536\u6807\u51C6\uFF1A",
    context.task.acceptance.map(
      (item, index) => `${String(index + 1)}. [${item.done ? "x" : " "}] ${item.text}`
    ).join("\n") || "\uFF08\u65E0\uFF09",
    "",
    "\u5B9E\u73B0\u8005 diff\uFF1A",
    context.run?.diffStat ?? "\uFF08\u6CA1\u6709\u4EE3\u7801 diff\uFF09",
    "",
    context.verification === null ? "\u6CA1\u6709 Host \u72EC\u7ACB\u9A8C\u8BC1\u8BB0\u5F55\u3002" : `Host \u72EC\u7ACB\u9A8C\u8BC1\uFF1A${context.verification.command} \u2192 exit ${String(context.verification.exitCode)}\uFF08${context.verification.passed ? "\u901A\u8FC7" : "\u5931\u8D25"}\uFF09
${context.verification.output.slice(0, 6e3)}`,
    "",
    "\u53EA\u8BFB\u8BC4\u5BA1\uFF1A\u4E0D\u8981\u4FEE\u6539\u6587\u4EF6\uFF0C\u4E0D\u8981\u8FD0\u884C\u4F1A\u5199\u6587\u4EF6\u7684\u547D\u4EE4\u3002",
    "\u6307\u51FA\u9A8C\u6536\u6807\u51C6\u662F\u5426\u771F\u7684\u6EE1\u8DB3\u3001diff \u662F\u5426\u8D8A\u754C\u3001\u6D4B\u8BD5\u662F\u5426\u8DB3\u591F\u3002",
    "\u8BF7\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF08\u4E0D\u8981\u8F93\u51FA JSON \u4EE5\u5916\u7684\u89E3\u91CA\uFF09\uFF1A",
    '{"verdict":"pass|fail","summary":"\u4E00\u53E5\u8BDD\u7ED3\u8BBA","findings":["\u5177\u4F53\u53D1\u73B0/\u98CE\u9669"]}'
  ].filter((line) => line !== "").join("\n");
}
var AgentDispatcher = class {
  ctx;
  store;
  workspaces = new WorkspaceManager();
  constructor(ctx, store) {
    this.ctx = ctx;
    this.store = store;
  }
  async dispatch(taskId) {
    const context = await this.store.getDispatchContext(taskId);
    const selection = await this.resolveModel(context.role);
    const workspace = context.project.repoPath === null ? void 0 : await this.workspaces.prepare(context.project.repoPath, taskId);
    const prompt = buildPrompt(context, workspace);
    const run2 = await this.store.beginRun(taskId, prompt, workspace);
    void this.execute(run2, selection, workspace);
    return run2;
  }
  async review(taskId) {
    const context = await this.store.getReviewContext(taskId);
    if (context.run === null || context.run.workspacePath === null) {
      throw new Error("\u8FD9\u4E2A\u4EFB\u52A1\u8FD8\u6CA1\u6709\u53EF\u8BC4\u5BA1\u7684 worktree");
    }
    const selection = await this.resolveModel(context.role);
    const prompt = buildReviewPrompt(context);
    let handle = null;
    let output = "";
    try {
      handle = await this.ctx.agents.create({
        sessionId: `review-${randomUUID()}`,
        meta: { cwd: context.run.workspacePath },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          await this.ctx.agentPresets.mount(agentCtx);
          agent.session.append("approval/policy", { policy: "never" });
        }
      });
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: prompt }],
        source: { kind: "user" }
      });
      const deadline = Date.now() + 18e4;
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
      const record = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
      const verdict = record.verdict === "pass" || record.verdict === "fail" ? record.verdict : "fail";
      const summary = textOf(record.summary) || (output === "" ? "\u72EC\u7ACB\u8BC4\u5BA1\u6CA1\u6709\u4EA7\u51FA" : output.slice(0, 2e3));
      const findings = stringArray(record.findings);
      return await this.store.recordReview(taskId, {
        reviewerRoleId: context.role.id,
        model: selection.model,
        verdict,
        summary,
        findings: findings.length === 0 && output === "" ? ["\u8BC4\u5BA1 Agent \u6CA1\u6709\u8FD4\u56DE\u5185\u5BB9"] : findings,
        tokens: typeof measured.totalTokens === "number" ? measured.totalTokens : null,
        runId: context.run.id
      });
    } finally {
      if (handle !== null) {
        try {
          await handle.dispose();
        } catch {
        }
      }
    }
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
  async execute(run2, selection, workspace) {
    let handle = null;
    try {
      handle = await this.ctx.agents.create({
        sessionId: `run-${randomUUID()}`,
        meta: { cwd: workspace?.path ?? process.cwd() },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          await this.ctx.agentPresets.mount(agentCtx);
          agent.session.append("approval/policy", { policy: "never" });
        }
      });
      await this.store.attachRunSession(
        run2.id,
        handle.agent.session.id,
        selection.model
      );
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: run2.prompt }],
        source: { kind: "user" }
      });
      const deadline = Date.now() + (workspace === void 0 ? 12e4 : 3e5);
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
          `Agent \u5728 ${workspace === void 0 ? "120" : "300"} \u79D2\u5185\u6CA1\u6709\u4EA7\u51FA\uFF08\u6CA1\u6709 assistant \u6D88\u606F\uFF09`
        );
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
      const diffStat = workspace === void 0 ? null : this.workspaces.diffStat(workspace.path);
      await this.store.completeRun(run2.id, {
        output,
        receipt,
        tokens: typeof measured.totalTokens === "number" ? measured.totalTokens : null,
        diffStat
      });
      if (workspace !== void 0) {
        await this.store.enforceContractScope(
          run2.taskId,
          run2.id,
          changedFilesFromDiff(diffStat)
        );
      }
    } catch (error) {
      await this.store.failRun(
        run2.id,
        error instanceof Error ? error.message : String(error)
      ).catch(() => void 0);
    } finally {
      if (handle !== null) {
        await handle.dispose().catch(() => void 0);
      }
    }
  }
};

// src/host/docs.ts
import { readFile as readFile3 } from "node:fs/promises";
import path4 from "node:path";

// src/host/store.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { existsSync as existsSync2 } from "node:fs";
import { mkdir as mkdir2, readFile as readFile2, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path3 from "node:path";
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
  return path3.join(
    home !== void 0 && home !== "" ? home : path3.join(os.homedir(), ".dsh"),
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
    tokensUsed: 0,
    pendingDecisions: 0,
    decidedDecisions: 0
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
      (run2) => run2.projectId === project.id
    );
    const projectDecisions = state.decisions.filter(
      (decision) => decision.projectId === project.id
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
      (run2) => run2.status === "running"
    ).length;
    totals.tokensUsed += projectRuns.reduce(
      (sum, run2) => sum + (run2.tokens ?? 0),
      0
    );
    totals.pendingDecisions += projectDecisions.filter(
      (decision) => decision.status === "pending"
    ).length;
    totals.decidedDecisions += projectDecisions.filter(
      (decision) => decision.status !== "pending"
    ).length;
    for (const decision of projectDecisions) {
      if (decision.status !== "pending") continue;
      projectNeeds.push({
        id: `need-decision-${decision.id}`,
        kind: "decision",
        severity: "warning",
        projectId: project.id,
        projectName: project.name,
        taskId: decision.taskId,
        proposalId: null,
        title: `\u5F85\u88C1\u51B3\uFF1A${decision.title}`,
        detail: decision.recommendation === "" ? "\u9700\u8981 Owner \u5728\u8463\u4E8B\u4F1A\u6279\u51C6\u6216\u62D2\u7EDD" : decision.recommendation,
        ageHours: hoursSince(decision.createdAt, now)
      });
    }
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
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.description === "string" && (value.tokenBudget === null || typeof value.tokenBudget === "number") && (value.repoPath === null || typeof value.repoPath === "string") && (value.prdPath === null || value.prdPath === void 0 || typeof value.prdPath === "string") && (value.invariantsPath === null || value.invariantsPath === void 0 || typeof value.invariantsPath === "string") && (value.modulesPath === null || value.modulesPath === void 0 || typeof value.modulesPath === "string") && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}
function isRole(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.name === "string" && typeof value.title === "string" && typeof value.mission === "string" && Array.isArray(value.responsibilities) && Array.isArray(value.nonGoals) && Array.isArray(value.decisionRights) && (value.model === null || typeof value.model === "string") && (value.tokenBudget === null || typeof value.tokenBudget === "number") && (value.dailyTokenBudget === null || typeof value.dailyTokenBudget === "number");
}
function isAgentRunStatus(value) {
  return value === "queued" || value === "running" || value === "succeeded" || value === "failed";
}
function isAgentRun(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && (value.roleId === null || typeof value.roleId === "string") && (value.branchId === null || typeof value.branchId === "string") && (value.branchName === null || typeof value.branchName === "string") && (value.workspacePath === null || typeof value.workspacePath === "string") && (value.diffStat === null || typeof value.diffStat === "string") && (value.sessionId === null || typeof value.sessionId === "string") && isAgentRunStatus(value.status) && (value.model === null || typeof value.model === "string") && typeof value.prompt === "string" && typeof value.output === "string" && (value.receipt === null || isRecord(value.receipt)) && (value.tokens === null || typeof value.tokens === "number") && (value.budgetWarning === null || typeof value.budgetWarning === "string") && (value.error === null || typeof value.error === "string") && typeof value.startedAt === "string" && (value.endedAt === null || typeof value.endedAt === "string");
}
function isTask(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.title === "string" && typeof value.goal === "string" && isTaskStatus(value.status) && isTaskPriority(value.priority) && Array.isArray(value.acceptance) && Array.isArray(value.evidence) && (value.verifyCommand === null || value.verifyCommand === void 0 || typeof value.verifyCommand === "string") && (value.module === null || value.module === void 0 || typeof value.module === "string") && (value.contractRef === null || value.contractRef === void 0 || typeof value.contractRef === "string") && (value.kind === void 0 || value.kind === "new" || value.kind === "fix") && (value.integration === void 0 || typeof value.integration === "boolean") && (value.originTaskId === null || value.originTaskId === void 0 || typeof value.originTaskId === "string") && (value.docsSynced === void 0 || typeof value.docsSynced === "boolean");
}
function isMergeRisk(value) {
  return value === "low" || value === "medium" || value === "high";
}
function isMergeProposal(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && typeof value.branch === "string" && typeof value.base === "string" && typeof value.summary === "string" && isMergeRisk(value.risk) && typeof value.rollback === "string" && (value.status === "review" || value.status === "approved" || value.status === "rejected" || value.status === "merged") && typeof value.reviewNote === "string" && (value.mergeCommit === null || typeof value.mergeCommit === "string") && (value.diffStat === null || value.diffStat === void 0 || typeof value.diffStat === "string") && (Array.isArray(value.changedFiles) || value.changedFiles === void 0) && (value.verificationId === null || value.verificationId === void 0 || typeof value.verificationId === "string") && (value.postMergeVerificationId === null || value.postMergeVerificationId === void 0 || typeof value.postMergeVerificationId === "string") && typeof value.createdAt === "string" && typeof value.updatedAt === "string" && (value.decidedAt === null || typeof value.decidedAt === "string") && (value.mergedAt === null || typeof value.mergedAt === "string");
}
function isDecisionStatus(value) {
  return value === "pending" || value === "approved" || value === "rejected";
}
function isDecision(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && (value.taskId === null || typeof value.taskId === "string") && (value.runId === null || typeof value.runId === "string") && typeof value.title === "string" && typeof value.context === "string" && Array.isArray(value.options) && typeof value.recommendation === "string" && (value.reversible === void 0 || typeof value.reversible === "boolean") && (value.adrDraft === null || value.adrDraft === void 0 || typeof value.adrDraft === "string") && isDecisionStatus(value.status) && typeof value.decision === "string" && typeof value.note === "string" && typeof value.decidedBy === "string" && (value.tokenCost === null || typeof value.tokenCost === "number") && typeof value.createdAt === "string" && (value.decidedAt === null || typeof value.decidedAt === "string");
}
function isBranchStatus(value) {
  return value === "open" || value === "review" || value === "merged" || value === "abandoned";
}
function isBranch(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && (value.taskId === null || typeof value.taskId === "string") && typeof value.name === "string" && typeof value.goal === "string" && (value.roleId === null || typeof value.roleId === "string") && Array.isArray(value.contractKeys) && isBranchStatus(value.status) && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}
function isContractChange(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.branchId === "string" && (value.taskId === null || typeof value.taskId === "string") && (value.runId === null || typeof value.runId === "string") && typeof value.contract === "string" && typeof value.change === "string" && typeof value.createdAt === "string";
}
function isVerification(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && (value.runId === null || typeof value.runId === "string") && typeof value.command === "string" && typeof value.workdir === "string" && typeof value.exitCode === "number" && typeof value.output === "string" && typeof value.passed === "boolean" && typeof value.createdAt === "string";
}
function isReview(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.taskId === "string" && (value.runId === null || typeof value.runId === "string") && (value.reviewerRoleId === null || typeof value.reviewerRoleId === "string") && (value.model === null || typeof value.model === "string") && (value.verdict === "pass" || value.verdict === "fail") && typeof value.summary === "string" && Array.isArray(value.findings) && (value.tokens === null || typeof value.tokens === "number") && typeof value.createdAt === "string";
}
function isModule(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.name === "string" && typeof value.responsibility === "string" && (value.contractPath === null || typeof value.contractPath === "string") && typeof value.contractText === "string" && Array.isArray(value.allowedPaths) && Array.isArray(value.forbiddenPaths) && Array.isArray(value.dependsOn) && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
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
    state = {
      ...state,
      schemaVersion: 3,
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
  if (state.schemaVersion === 3) {
    state = {
      ...state,
      schemaVersion: 4,
      decisions: []
    };
  }
  if (state.schemaVersion === 4) {
    state = {
      ...state,
      schemaVersion: 5,
      runs: state.runs.map((run2) => ({
        ...run2,
        branchId: run2.branchId ?? null
      })),
      branches: state.tasks.filter((task) => task.branch !== null).map((task) => ({
        id: `branch-${task.id}`,
        projectId: task.projectId,
        taskId: task.id,
        name: task.branch,
        goal: task.goal,
        roleId: task.ownerRoleId,
        contractKeys: [],
        status: task.status === "review" ? "review" : "open",
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      })),
      contractChanges: []
    };
  }
  if (state.schemaVersion === 5) {
    state = {
      ...state,
      schemaVersion: 6,
      projects: state.projects.map((project) => ({
        ...project,
        repoPath: project.repoPath ?? null
      })),
      runs: state.runs.map((run2) => ({
        ...run2,
        branchName: run2.branchName ?? null,
        workspacePath: run2.workspacePath ?? null,
        diffStat: run2.diffStat ?? null
      }))
    };
  }
  if (state.schemaVersion === 6) {
    state = {
      ...state,
      schemaVersion: 7,
      tasks: state.tasks.map((task) => ({
        ...task,
        verifyCommand: task.verifyCommand ?? null
      })),
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        diffStat: proposal.diffStat ?? null,
        changedFiles: Array.isArray(proposal.changedFiles) ? proposal.changedFiles : [],
        verificationId: proposal.verificationId ?? null
      })),
      verifications: Array.isArray(
        state.verifications
      ) ? state.verifications : []
    };
  }
  if (state.schemaVersion === 7) {
    state = {
      ...state,
      schemaVersion: 8,
      tasks: state.tasks.map((task) => ({
        ...task,
        module: task.module ?? null,
        contractRef: task.contractRef ?? null,
        kind: task.kind ?? "new"
      }))
    };
  }
  if (state.schemaVersion === 8) {
    state = {
      ...state,
      schemaVersion: 9,
      projects: state.projects.map((project) => ({
        ...project,
        prdPath: project.prdPath ?? null,
        invariantsPath: project.invariantsPath ?? null,
        modulesPath: project.modulesPath ?? null
      })),
      modules: Array.isArray(
        state.modules
      ) ? state.modules : []
    };
  }
  if (state.schemaVersion === 9) {
    state = {
      ...state,
      schemaVersion: 10,
      tasks: state.tasks.map((task) => ({
        ...task,
        integration: task.integration ?? false,
        originTaskId: task.originTaskId ?? null
      }))
    };
  }
  if (state.schemaVersion === 10) {
    state = {
      ...state,
      schemaVersion: 11,
      reviews: Array.isArray(
        state.reviews
      ) ? state.reviews : []
    };
  }
  if (state.schemaVersion === 11) {
    state = {
      ...state,
      schemaVersion: 12,
      tasks: state.tasks.map((task) => ({
        ...task,
        docsSynced: task.docsSynced ?? false
      })),
      decisions: state.decisions.map((decision) => ({
        ...decision,
        reversible: decision.reversible ?? true
      }))
    };
  }
  if (state.schemaVersion === 12) {
    state = {
      ...state,
      schemaVersion: 13,
      decisions: state.decisions.map((decision) => ({
        ...decision,
        adrDraft: decision.adrDraft ?? null
      }))
    };
  }
  if (state.schemaVersion === 13) {
    return {
      ...state,
      schemaVersion: STUDIO_SCHEMA_VERSION,
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        postMergeVerificationId: proposal.postMergeVerificationId ?? null
      }))
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
  if (!Array.isArray(value.projects) || !Array.isArray(value.roles) || !Array.isArray(value.modules) || !Array.isArray(value.tasks) || !Array.isArray(value.mergeProposals) || !Array.isArray(value.runs) || !Array.isArray(value.branches) || !Array.isArray(value.contractChanges) || !Array.isArray(value.decisions) || !Array.isArray(value.verifications) || !Array.isArray(value.reviews) || !Array.isArray(value.events)) {
    throw new Error("Studio state collections are missing");
  }
  if (!value.projects.every(isProject)) {
    throw new Error("Studio state contains an invalid project");
  }
  if (!value.roles.every(isRole)) {
    throw new Error("Studio state contains an invalid role");
  }
  if (!value.modules.every(isModule)) {
    throw new Error("Studio state contains an invalid module");
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
  if (!value.branches.every(isBranch)) {
    throw new Error("Studio state contains an invalid branch");
  }
  if (!value.contractChanges.every(isContractChange)) {
    throw new Error("Studio state contains an invalid contract change");
  }
  if (!value.verifications.every(isVerification)) {
    throw new Error("Studio state contains an invalid verification");
  }
  if (!value.reviews.every(isReview)) {
    throw new Error("Studio state contains an invalid review");
  }
  if (!value.decisions.every(isDecision)) {
    throw new Error("Studio state contains an invalid decision");
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
    this.file = path3.join(this.dataDir, "studio.json");
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
      const modules = project === null ? [] : state.modules.filter((module) => module.projectId === project.id);
      const tasks = project === null ? [] : state.tasks.filter((task) => task.projectId === project.id);
      const mergeProposals = project === null ? [] : state.mergeProposals.filter(
        (proposal) => proposal.projectId === project.id
      );
      const runs = project === null ? [] : state.runs.filter((run2) => run2.projectId === project.id).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      );
      const branches = project === null ? [] : state.branches.filter((branch) => branch.projectId === project.id).sort(
        (left, right) => right.updatedAt.localeCompare(left.updatedAt)
      );
      const contractChanges = project === null ? [] : state.contractChanges.filter(
        (change) => change.projectId === project.id
      );
      const verifications = project === null ? [] : state.verifications.filter((verification) => verification.projectId === project.id).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
      );
      const reviews = project === null ? [] : state.reviews.filter((review) => review.projectId === project.id).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
      );
      const decisions = project === null ? [] : state.decisions.filter((decision) => decision.projectId === project.id).sort((left, right) => {
        if (left.status !== right.status) {
          if (left.status === "pending") return -1;
          if (right.status === "pending") return 1;
        }
        return right.createdAt.localeCompare(left.createdAt);
      });
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
        modules,
        tasks,
        mergeProposals,
        runs,
        branches,
        contractChanges,
        decisions,
        verifications,
        reviews,
        stats: statsFor(tasks, mergeProposals),
        events,
        company: buildCompany(state, now),
        features: {
          independentPage: true,
          filePersistence: true,
          mergeGovernance: true,
          ownerDashboard: true,
          agentExecution: true,
          decisionBoard: true,
          branchBoard: true,
          codeExecution: true,
          verification: true,
          knowledge: true,
          contractGuard: true,
          independentReview: true,
          mergeExecution: true,
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
        repoPath: optionalText(input.repoPath, "repoPath", 1e3) || null,
        prdPath: null,
        invariantsPath: null,
        modulesPath: null,
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
  async updateProject(projectId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === void 0) {
        throw new StudioStoreError("project_not_found", "\u9879\u76EE\u4E0D\u5B58\u5728", 404);
      }
      if (input.repoPath !== void 0) {
        project.repoPath = optionalText(input.repoPath, "repoPath", 1e3) || null;
      }
      if (input.prdPath !== void 0) {
        project.prdPath = optionalText(input.prdPath, "prdPath", 500) || null;
      }
      if (input.invariantsPath !== void 0) {
        project.invariantsPath = optionalText(input.invariantsPath, "invariantsPath", 500) || null;
      }
      if (input.modulesPath !== void 0) {
        project.modulesPath = optionalText(input.modulesPath, "modulesPath", 500) || null;
      }
      const at = nowIso(this.now);
      project.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "project.updated",
        at,
        projectId: project.id,
        payload: { repoPath: project.repoPath }
      });
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
      const module = task.module === null ? void 0 : state.modules.find(
        (item) => item.projectId === task.projectId && item.name === task.module
      );
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        module: module === void 0 ? null : structuredClone(module)
      };
    });
  }
  async getReviewContext(taskId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.reviewerRoleId === null) {
        throw new StudioStoreError(
          "reviewer_required",
          "\u4EFB\u52A1\u6CA1\u6709\u9A8C\u6536\u4EBA\u89D2\u8272\uFF0C\u4E0D\u80FD\u72EC\u7ACB\u8BC4\u5BA1",
          409
        );
      }
      const role = state.roles.find(
        (item) => item.id === task.reviewerRoleId
      );
      const project = state.projects.find(
        (item) => item.id === task.projectId
      );
      if (role === void 0 || project === void 0) {
        throw new StudioStoreError(
          "context_not_found",
          "\u9A8C\u6536\u4EBA\u89D2\u8272\u6216\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      const run2 = [...state.runs].filter(
        (item) => item.taskId === taskId && item.workspacePath !== null
      ).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      )[0];
      const verification = [...state.verifications].filter((item) => item.taskId === taskId).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
      )[0];
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        run: run2 === void 0 ? null : structuredClone(run2),
        verification: verification === void 0 ? null : structuredClone(verification)
      };
    });
  }
  async recordReview(taskId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const at = nowIso(this.now);
      const review = {
        id: newId("review"),
        projectId: task.projectId,
        taskId,
        runId: input.runId ?? null,
        reviewerRoleId: input.reviewerRoleId,
        model: input.model,
        verdict: input.verdict,
        summary: requiredText(input.summary, "summary", 2e3),
        findings: textList(input.findings, "findings", 30),
        tokens: input.tokens,
        createdAt: at
      };
      state.reviews.push(review);
      if (review.verdict === "pass") {
        const text = `\u72EC\u7ACB\u8BC4\u5BA1\u901A\u8FC7\uFF08${input.model}\uFF09\uFF1A${review.summary}`;
        if (!task.evidence.some((item) => item.text === text)) {
          task.evidence.push({ id: newId("ev"), text, createdAt: at });
        }
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: review.verdict === "pass" ? "review.passed" : "review.failed",
        at,
        projectId: task.projectId,
        taskId,
        payload: { reviewId: review.id, model: review.model }
      });
      await this.save();
      return structuredClone(review);
    });
  }
  async getTaskVerificationContext(taskId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const run2 = [...state.runs].filter(
        (item) => item.taskId === taskId && item.workspacePath !== null
      ).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      )[0];
      return {
        task: structuredClone(task),
        run: run2 === void 0 ? null : structuredClone(run2)
      };
    });
  }
  async beginRun(taskId, prompt, workspace) {
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
      const projectSpent = state.runs.filter((run3) => run3.projectId === project.id).reduce((sum, run3) => sum + (run3.tokens ?? 0), 0);
      if (project.tokenBudget !== null && projectSpent >= project.tokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `\u9879\u76EE token \u9884\u7B97\u5DF2\u7528\u5C3D\uFF08${String(projectSpent)} / ${String(
            project.tokenBudget
          )}\uFF09`,
          409
        );
      }
      const roleSpent = state.runs.filter((run3) => run3.roleId === role.id).reduce((sum, run3) => sum + (run3.tokens ?? 0), 0);
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
        (run3) => run3.roleId === role.id && run3.startedAt.slice(0, 10) === today
      ).reduce((sum, run3) => sum + (run3.tokens ?? 0), 0);
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
      if (workspace !== void 0) {
        task.branch = workspace.branch;
      }
      const branch = this.ensureBranch(state, task, at);
      const run2 = {
        id: newId("run"),
        projectId: task.projectId,
        taskId: task.id,
        roleId: role.id,
        branchId: branch.id,
        branchName: workspace?.branch ?? null,
        workspacePath: workspace?.path ?? null,
        diffStat: null,
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
      state.runs.push(run2);
      task.status = "running";
      task.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.dispatched",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: {
          runId: run2.id,
          roleId: role.id,
          model: role.model
        }
      });
      await this.save();
      return structuredClone(run2);
    });
  }
  async attachRunSession(runId, sessionId, model) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run2 = state.runs.find((item) => item.id === runId);
      if (run2 === void 0) return;
      run2.sessionId = sessionId;
      if (model !== void 0) run2.model = model;
      run2.status = "running";
      await this.save();
    });
  }
  async completeRun(runId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run2 = state.runs.find((item) => item.id === runId);
      if (run2 === void 0) {
        throw new StudioStoreError("run_not_found", "Agent Run \u4E0D\u5B58\u5728", 404);
      }
      const at = nowIso(this.now);
      const task = state.tasks.find((item) => item.id === run2.taskId);
      const project = state.projects.find(
        (item) => item.id === run2.projectId
      );
      const role = state.roles.find((item) => item.id === run2.roleId);
      const receiptComplete = input.receipt !== null && typeof input.receipt.summary === "string" && input.receipt.summary.trim() !== "" && Array.isArray(input.receipt.evidence) && input.receipt.evidence.length > 0;
      if (!receiptComplete) {
        run2.status = "failed";
        run2.output = input.output.slice(0, 3e4);
        run2.receipt = input.receipt;
        run2.tokens = input.tokens;
        run2.error = "\u56DE\u6267\u4E0D\u5B8C\u6574\uFF1A\u5FC5\u987B\u5305\u542B\u975E\u7A7A summary \u548C\u81F3\u5C11\u4E00\u6761 evidence\uFF0C\u4EFB\u52A1\u4E0D\u80FD\u8FDB\u5165 review";
        run2.endedAt = at;
        if (task !== void 0 && task.status === "running") {
          task.status = "ready";
          task.updatedAt = at;
        }
        if (task !== void 0) {
          this.escalateRepeatedFailure(
            state,
            task,
            at,
            run2.error,
            run2
          );
        }
        state.updatedAt = at;
        this.recordEvent(state, {
          type: "agent.failed",
          at,
          projectId: run2.projectId,
          taskId: run2.taskId,
          payload: {
            runId: run2.id,
            error: run2.error,
            tokens: run2.tokens
          }
        });
        await this.save();
        return structuredClone(run2);
      }
      const spentProject = state.runs.filter(
        (item) => item.projectId === run2.projectId && item.id !== run2.id
      ).reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const spentRole = state.runs.filter(
        (item) => item.roleId === run2.roleId && item.id !== run2.id
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
      run2.status = "succeeded";
      run2.output = input.output.slice(0, 3e4);
      run2.receipt = input.receipt;
      run2.tokens = input.tokens;
      run2.diffStat = input.diffStat ?? null;
      run2.budgetWarning = warnings.length === 0 ? null : warnings.join("\uFF1B");
      run2.endedAt = at;
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
      if (input.receipt !== null) {
        let branch = run2.branchId === null ? void 0 : state.branches.find((item) => item.id === run2.branchId);
        if (branch === void 0 && task !== void 0) {
          branch = this.ensureBranch(state, task, at);
          run2.branchId = branch.id;
        }
        if (branch !== void 0) {
          branch.status = "review";
          branch.updatedAt = at;
          for (const delta of input.receipt.contractDeltas) {
            const contract = delta.contract.trim();
            const change = delta.change.trim();
            if (contract === "" || change === "") continue;
            if (!branch.contractKeys.includes(contract)) {
              branch.contractKeys.push(contract);
            }
            const conflict = state.contractChanges.find(
              (item) => item.projectId === run2.projectId && item.contract === contract && item.branchId !== branch.id && item.change !== change
            );
            if (!state.contractChanges.some(
              (item) => item.branchId === branch.id && item.contract === contract && item.change === change
            )) {
              state.contractChanges.push({
                id: newId("contract"),
                projectId: run2.projectId,
                branchId: branch.id,
                taskId: run2.taskId,
                runId: run2.id,
                contract,
                change,
                createdAt: at
              });
              this.recordEvent(state, {
                type: "contract.changed",
                at,
                projectId: run2.projectId,
                taskId: run2.taskId,
                payload: {
                  branchId: branch.id,
                  contract,
                  change,
                  runId: run2.id
                }
              });
            }
            if (conflict === void 0) continue;
            const title = `\u5951\u7EA6\u51B2\u7A81\uFF1A${contract.slice(0, 160)}`;
            if (state.decisions.some(
              (item) => item.runId === run2.id && item.title === title
            )) {
              continue;
            }
            const otherBranch = state.branches.find(
              (item) => item.id === conflict.branchId
            );
            const decision = {
              id: newId("dec"),
              projectId: run2.projectId,
              taskId: run2.taskId,
              runId: run2.id,
              title,
              context: `${branch.name}: ${change}
${otherBranch?.name ?? conflict.branchId}: ${conflict.change}`,
              options: [
                {
                  label: `\u91C7\u7528 ${branch.name} \u7684\u53D8\u66F4`,
                  tradeoff: change
                },
                {
                  label: `\u91C7\u7528 ${otherBranch?.name ?? "\u53E6\u4E00\u652F\u7EBF"} \u7684\u53D8\u66F4`,
                  tradeoff: conflict.change
                }
              ],
              recommendation: "\u540C\u4E00\u5951\u7EA6\u51FA\u73B0\u4E24\u6761\u4E0D\u540C\u53D8\u66F4\u3002\u8BF7\u7531 Owner/Architect \u88C1\u51B3\uFF1B\u5728\u88C1\u51B3\u524D\u4E0D\u8981\u5408\u5E76\u4EFB\u610F\u4E00\u6761\u652F\u7EBF\u3002",
              reversible: true,
              adrDraft: null,
              status: "pending",
              decision: "",
              note: "",
              decidedBy: "",
              tokenCost: input.tokens,
              createdAt: at,
              decidedAt: null
            };
            state.decisions.push(decision);
            this.recordEvent(state, {
              type: "decision.escalated",
              at,
              projectId: run2.projectId,
              taskId: run2.taskId,
              payload: {
                decisionId: decision.id,
                contract,
                branchId: branch.id,
                otherBranchId: conflict.branchId,
                runId: run2.id
              }
            });
          }
        }
      }
      if (input.receipt !== null) {
        for (const proposed of input.receipt.decisions) {
          if (proposed.scope !== "project") continue;
          if (state.decisions.some(
            (item) => item.runId === run2.id && item.title === proposed.title
          )) {
            continue;
          }
          const decision = {
            id: newId("dec"),
            projectId: run2.projectId,
            taskId: run2.taskId,
            runId: run2.id,
            title: proposed.title,
            context: proposed.rationale,
            options: [],
            recommendation: proposed.rationale,
            reversible: true,
            adrDraft: null,
            status: "pending",
            decision: "",
            note: "",
            decidedBy: "",
            tokenCost: input.tokens,
            createdAt: at,
            decidedAt: null
          };
          state.decisions.push(decision);
          this.recordEvent(state, {
            type: "decision.proposed",
            at,
            projectId: run2.projectId,
            taskId: run2.taskId,
            payload: {
              decisionId: decision.id,
              runId: run2.id,
              title: decision.title
            }
          });
        }
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.completed",
        at,
        projectId: run2.projectId,
        taskId: run2.taskId,
        payload: {
          runId: run2.id,
          tokens: run2.tokens,
          receipt: input.receipt !== null,
          budgetWarning: run2.budgetWarning
        }
      });
      await this.save();
      return structuredClone(run2);
    });
  }
  async failRun(runId, error) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run2 = state.runs.find((item) => item.id === runId);
      if (run2 === void 0) {
        throw new StudioStoreError("run_not_found", "Agent Run \u4E0D\u5B58\u5728", 404);
      }
      const at = nowIso(this.now);
      run2.status = "failed";
      run2.error = error.slice(0, 4e3);
      run2.endedAt = at;
      const task = state.tasks.find((item) => item.id === run2.taskId);
      if (task !== void 0 && task.status === "running") {
        task.status = "ready";
        task.updatedAt = at;
      }
      if (task !== void 0) {
        this.escalateRepeatedFailure(state, task, at, run2.error, run2);
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.failed",
        at,
        projectId: run2.projectId,
        taskId: run2.taskId,
        payload: { runId: run2.id, error: run2.error }
      });
      await this.save();
      return structuredClone(run2);
    });
  }
  /**
   * Enforces the module contract boundary after a code run. Changing the
   * contract file or a forbidden path blocks the task and escalates a decision;
   * it never silently rewrites the Agent's worktree.
   */
  async enforceContractScope(taskId, runId, changedFiles) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const module = task.module === null ? void 0 : state.modules.find(
        (item) => item.projectId === task.projectId && item.name === task.module
      );
      if (module === void 0) return [];
      const normalize = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
      const contract = normalize(module.contractPath ?? "");
      const forbidden = module.forbiddenPaths.map(normalize).filter(Boolean);
      const allowed = module.allowedPaths.map(normalize).filter(Boolean);
      const violations = changedFiles.map(normalize).filter((file) => {
        if (file === "") return false;
        if (contract !== "" && file === contract) return true;
        if (forbidden.some(
          (path5) => file === path5 || file.startsWith(`${path5}/`)
        )) {
          return true;
        }
        if (allowed.length > 0 && (file.startsWith("src/") || file.startsWith("test/")) && !allowed.some(
          (path5) => file === path5 || file.startsWith(`${path5}/`)
        )) {
          return true;
        }
        return false;
      });
      if (violations.length === 0) return [];
      const at = nowIso(this.now);
      task.status = "blocked";
      task.updatedAt = at;
      const title = `\u5951\u7EA6\u8D8A\u754C\uFF1A${task.title.slice(0, 160)}`;
      if (!state.decisions.some(
        (item) => item.taskId === task.id && item.title === title
      )) {
        const run2 = state.runs.find((item) => item.id === runId);
        state.decisions.push({
          id: newId("dec"),
          projectId: task.projectId,
          taskId: task.id,
          runId,
          title,
          context: `\u6A21\u5757\u300C${module.name}\u300D\u7684\u5951\u7EA6/\u7981\u6B62\u8DEF\u5F84\u88AB\u4FEE\u6539\uFF1A${violations.join("\u3001")}`,
          options: [
            {
              label: "\u9000\u56DE Architect \u4FEE\u8BA2\u5951\u7EA6",
              tradeoff: "\u5148\u786E\u8BA4\u5951\u7EA6\u8FB9\u754C\u662F\u5426\u53D8\u5316\uFF0C\u518D\u91CD\u5F00 ticket"
            },
            {
              label: "\u64A4\u9500\u8D8A\u754C\u6539\u52A8",
              tradeoff: "\u4FDD\u7559\u73B0\u6709\u5951\u7EA6\uFF0C\u8981\u6C42 Agent \u53EA\u6539\u5141\u8BB8\u8DEF\u5F84"
            }
          ],
          recommendation: "\u5B9E\u73B0\u8005\u4E0D\u80FD\u76F4\u63A5\u6539\u5951\u7EA6\u6216\u7981\u6B62\u8DEF\u5F84\uFF1B\u9700\u8981\u5951\u7EA6\u53D8\u66F4\u65F6\uFF0C\u5E94\u7531 Architect/Owner \u5148\u66F4\u65B0\u5951\u7EA6\uFF0C\u518D\u91CD\u65B0\u6D3E\u5355\u3002",
          reversible: true,
          adrDraft: null,
          status: "pending",
          decision: "",
          note: "",
          decidedBy: "",
          tokenCost: run2?.tokens ?? null,
          createdAt: at,
          decidedAt: null
        });
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "contract.violated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { runId, module: module.name, violations }
      });
      await this.save();
      return violations;
    });
  }
  async recordVerification(taskId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      const at = nowIso(this.now);
      const run2 = input.runId ? state.runs.find((item) => item.id === input.runId) : [...state.runs].filter(
        (item) => item.taskId === taskId && item.workspacePath !== null
      ).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      )[0];
      const verification = {
        id: newId("verify"),
        projectId: task.projectId,
        taskId,
        runId: run2?.id ?? null,
        command: requiredText(input.command, "command", 500),
        workdir: requiredText(input.workdir, "workdir", 1e3),
        exitCode: input.exitCode,
        output: input.output.slice(0, 2e4),
        passed: input.passed,
        createdAt: at
      };
      state.verifications.push(verification);
      if (input.passed) {
        const text = `\u9A8C\u8BC1\u901A\u8FC7\uFF1A\`${verification.command}\`\uFF08exit 0\uFF09`;
        if (!task.evidence.some((item) => item.text === text)) {
          task.evidence.push({
            id: newId("ev"),
            text,
            createdAt: at
          });
        }
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: input.passed ? "verification.passed" : "verification.failed",
        at,
        projectId: task.projectId,
        taskId,
        payload: {
          verificationId: verification.id,
          command: verification.command,
          exitCode: verification.exitCode,
          runId: verification.runId
        }
      });
      await this.save();
      return structuredClone(verification);
    });
  }
  async createDecision(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, void 0);
      if (project === null) {
        throw new StudioStoreError("project_required", "\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE");
      }
      let taskId = null;
      if (input.taskId !== void 0 && input.taskId !== null) {
        const task = this.findTask(state, input.taskId);
        if (task.projectId !== project.id) {
          throw new StudioStoreError(
            "task_not_found",
            "\u4EFB\u52A1\u4E0D\u5C5E\u4E8E\u5F53\u524D\u9879\u76EE",
            404
          );
        }
        taskId = task.id;
      }
      const at = nowIso(this.now);
      const decision = {
        id: newId("dec"),
        projectId: project.id,
        taskId,
        runId: null,
        title: requiredText(input.title, "title", 200),
        context: optionalText(input.context, "context", 4e3),
        options: [],
        recommendation: optionalText(
          input.recommendation,
          "recommendation",
          2e3
        ),
        reversible: input.reversible !== false,
        adrDraft: null,
        status: "pending",
        decision: "",
        note: "",
        decidedBy: "",
        tokenCost: null,
        createdAt: at,
        decidedAt: null
      };
      state.decisions.push(decision);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "decision.created",
        at,
        projectId: project.id,
        taskId,
        payload: { decisionId: decision.id, title: decision.title }
      });
      await this.save();
      return structuredClone(decision);
    });
  }
  async decideDecision(decisionId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId
      );
      if (decision === void 0) {
        throw new StudioStoreError(
          "decision_not_found",
          "\u51B3\u7B56\u4E0D\u5B58\u5728",
          404
        );
      }
      if (decision.status !== "pending") {
        throw new StudioStoreError(
          "decision_decided",
          "\u8FD9\u6761\u51B3\u7B56\u5DF2\u7ECF\u6709\u7ED3\u8BBA",
          409
        );
      }
      if (input.status !== "approved" && input.status !== "rejected") {
        throw new StudioStoreError(
          "invalid_input",
          "\u51B3\u7B56\u72B6\u6001\u53EA\u80FD\u662F approved \u6216 rejected"
        );
      }
      if (decision.reversible === false && input.status === "approved" && optionalText(input.decision, "decision", 4e3) === "") {
        throw new StudioStoreError(
          "decision_reason_required",
          "\u4E0D\u53EF\u9006\u51B3\u7B56\u6279\u51C6\u65F6\u5FC5\u987B\u5199\u660E\u7ED3\u8BBA\u548C\u7406\u7531",
          409
        );
      }
      const at = nowIso(this.now);
      decision.status = input.status;
      decision.decision = optionalText(input.decision, "decision", 4e3);
      decision.note = optionalText(input.note, "note", 2e3);
      decision.decidedBy = "Owner";
      decision.decidedAt = at;
      if (input.status === "approved" && decision.reversible === false) {
        decision.adrDraft = [
          `# ADR: ${decision.title}`,
          "",
          `- \u65E5\u671F\uFF1A${at.slice(0, 10)}`,
          "- \u72B6\u6001\uFF1AAccepted",
          "- \u4E0D\u53EF\u9006\uFF1A\u662F",
          "",
          "## \u80CC\u666F",
          decision.context || "\uFF08\u672A\u586B\u5199\uFF09",
          "",
          "## \u51B3\u7B56",
          decision.decision || "\uFF08\u672A\u586B\u5199\uFF09",
          "",
          "## \u7406\u7531",
          decision.note || "\uFF08\u672A\u586B\u5199\uFF09",
          "",
          "## \u5EFA\u8BAE",
          decision.recommendation || "\uFF08\u65E0\uFF09",
          ""
        ].join("\n");
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: input.status === "approved" ? "decision.approved" : "decision.rejected",
        at,
        projectId: decision.projectId,
        taskId: decision.taskId,
        payload: {
          decisionId: decision.id,
          decision: decision.decision,
          note: decision.note
        }
      });
      await this.save();
      return structuredClone(decision);
    });
  }
  async createModule(input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, void 0);
      if (project === null) {
        throw new StudioStoreError("project_required", "\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE");
      }
      const name2 = requiredText(input.name, "name", 120);
      if (state.modules.some(
        (module2) => module2.projectId === project.id && module2.name === name2
      )) {
        throw new StudioStoreError(
          "module_exists",
          "\u540C\u4E00\u9879\u76EE\u4E0B\u6A21\u5757\u540D\u4E0D\u80FD\u91CD\u590D",
          409
        );
      }
      const at = nowIso(this.now);
      const module = {
        id: newId("module"),
        projectId: project.id,
        name: name2,
        responsibility: optionalText(
          input.responsibility,
          "responsibility",
          2e3
        ),
        contractPath: optionalText(input.contractPath, "contractPath", 500) || null,
        contractText: optionalText(
          input.contractText,
          "contractText",
          8e3
        ),
        allowedPaths: textList(input.allowedPaths, "allowedPaths", 30),
        forbiddenPaths: textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30
        ),
        dependsOn: textList(input.dependsOn, "dependsOn", 20),
        createdAt: at,
        updatedAt: at
      };
      state.modules.push(module);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "module.created",
        at,
        projectId: project.id,
        payload: { moduleId: module.id, name: module.name }
      });
      await this.save();
      return structuredClone(module);
    });
  }
  async updateModule(moduleId, input) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const module = state.modules.find((item) => item.id === moduleId);
      if (module === void 0) {
        throw new StudioStoreError("module_not_found", "\u6A21\u5757\u4E0D\u5B58\u5728", 404);
      }
      if (input.responsibility !== void 0) {
        module.responsibility = optionalText(
          input.responsibility,
          "responsibility",
          2e3
        );
      }
      if (input.contractPath !== void 0) {
        module.contractPath = optionalText(input.contractPath, "contractPath", 500) || null;
      }
      if (input.contractText !== void 0) {
        module.contractText = optionalText(
          input.contractText,
          "contractText",
          8e3
        );
      }
      if (input.allowedPaths !== void 0) {
        module.allowedPaths = textList(
          input.allowedPaths,
          "allowedPaths",
          30
        );
      }
      if (input.forbiddenPaths !== void 0) {
        module.forbiddenPaths = textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30
        );
      }
      if (input.dependsOn !== void 0) {
        module.dependsOn = textList(input.dependsOn, "dependsOn", 20);
      }
      const at = nowIso(this.now);
      module.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "module.updated",
        at,
        projectId: module.projectId,
        payload: { moduleId: module.id }
      });
      await this.save();
      return structuredClone(module);
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
        verifyCommand: optionalText(input.verifyCommand, "verifyCommand", 500) || null,
        module: optionalText(input.module, "module", 120) || null,
        contractRef: optionalText(input.contractRef, "contractRef", 300) || null,
        kind: input.kind === "fix" ? "fix" : "new",
        integration: input.integration === true,
        originTaskId: optionalText(input.originTaskId, "originTaskId", 120) || null,
        docsSynced: false,
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
      if (input.verifyCommand !== void 0) {
        task.verifyCommand = optionalText(input.verifyCommand, "verifyCommand", 500) || null;
      }
      if (input.module !== void 0) {
        task.module = optionalText(input.module, "module", 120) || null;
      }
      if (input.contractRef !== void 0) {
        task.contractRef = optionalText(input.contractRef, "contractRef", 300) || null;
      }
      if (input.kind !== void 0) {
        task.kind = input.kind === "fix" ? "fix" : "new";
      }
      if (input.integration !== void 0) {
        task.integration = input.integration === true;
      }
      if (input.docsSynced !== void 0) {
        task.docsSynced = input.docsSynced === true;
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
        const project = state.projects.find(
          (item) => item.id === task.projectId
        );
        const hasCodeRun = state.runs.some(
          (item) => item.taskId === task.id && item.workspacePath !== null
        );
        if (project?.repoPath !== null && project?.repoPath !== void 0 && hasCodeRun && !state.reviews.some(
          (review) => review.taskId === task.id && review.verdict === "pass"
        )) {
          throw new StudioStoreError(
            "review_required",
            "\u4EE3\u7801\u4EFB\u52A1\u5B8C\u6210\u524D\u5FC5\u987B\u6709\u4E00\u6B21\u901A\u8FC7\u7684\u72EC\u7ACB\u8BC4\u5BA1",
            409
          );
        }
        const hasDocs = project !== void 0 && (project.prdPath !== null || project.invariantsPath !== null || project.modulesPath !== null);
        if (hasDocs && !task.docsSynced) {
          throw new StudioStoreError(
            "docs_sync_required",
            "\u9879\u76EE\u5DF2\u7ED1\u5B9A PRD/INVARIANTS/MODULES\uFF0C\u5B8C\u6210\u524D\u5FC5\u987B\u786E\u8BA4\u6587\u6863\u5DF2\u540C\u6B65",
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
      if (next === "done") {
        this.scheduleIntegrationGate(state, task.projectId, at);
      }
      await this.save();
      return structuredClone(task);
    });
  }
  scheduleIntegrationGate(state, projectId, at) {
    const done = state.tasks.filter(
      (item) => item.projectId === projectId && item.status === "done"
    ).length;
    const generated = state.tasks.filter(
      (item) => item.projectId === projectId && item.title.startsWith("\u96C6\u6210\u9A8C\u6536\uFF08\u81EA\u52A8 #")
    ).length;
    if (Math.floor(done / 3) <= generated) return;
    const lead = state.roles.find(
      (role) => role.projectId === projectId && (role.id === "role-lead" || role.title.includes("\u5236\u4F5C\u4EBA"))
    ) ?? state.roles.find((role) => role.projectId === projectId);
    const verifier = state.roles.find(
      (role) => role.projectId === projectId && (role.id === "role-verifier" || role.title.includes("QA"))
    ) ?? lead;
    if (lead === void 0) return;
    const index = generated + 1;
    const task = {
      id: newId("task"),
      projectId,
      title: `\u96C6\u6210\u9A8C\u6536\uFF08\u81EA\u52A8 #${String(index)}\uFF09`,
      goal: "\u6BCF 3 \u4E2A\u5B8C\u6210\u4EFB\u52A1\u540E\u7684\u96C6\u6210 gate\uFF1A\u6253\u5305\u5F53\u524D build\uFF0C\u4EBA\u73A9 10 \u5206\u949F\uFF0C\u8BB0\u5F55\u963B\u65AD\u95EE\u9898\u4E0E\u53EF\u7EE7\u7EED\u8FED\u4EE3\u7684\u5224\u65AD\u3002",
      status: "backlog",
      priority: "P1",
      ownerRoleId: lead.id,
      reviewerRoleId: verifier?.id ?? lead.id,
      acceptance: [
        {
          id: newId("acc"),
          text: "\u6253\u5305\u51FA\u53EF\u8FD0\u884C build",
          done: false
        },
        {
          id: newId("acc"),
          text: "\u4EBA\u73A9 10 \u5206\u949F\u5E76\u8BB0\u5F55\u963B\u65AD\u95EE\u9898",
          done: false
        }
      ],
      evidence: [],
      branch: null,
      verifyCommand: "npm test",
      module: null,
      contractRef: null,
      kind: "new",
      integration: true,
      originTaskId: null,
      docsSynced: false,
      createdAt: at,
      updatedAt: at
    };
    state.tasks.push(task);
    this.recordEvent(state, {
      type: "integration.scheduled",
      at,
      projectId,
      taskId: task.id,
      payload: { index, doneTasks: done }
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
      const project = state.projects.find(
        (item) => item.id === task.projectId
      );
      if (project?.repoPath !== null && project?.repoPath !== void 0) {
        const passed = state.verifications.some(
          (item) => item.taskId === task.id && item.passed
        );
        if (!passed) {
          throw new StudioStoreError(
            "verification_required",
            "\u4EE3\u7801\u9879\u76EE\u63D0\u4EA4\u5408\u5E76\u63D0\u6848\u524D\u5FC5\u987B\u6709\u4E00\u6761\u901A\u8FC7\u7684\u72EC\u7ACB\u9A8C\u8BC1",
            409
          );
        }
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
      const latestRun = [...state.runs].filter((run2) => run2.taskId === task.id).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt)
      )[0];
      const latestVerification = [...state.verifications].filter((verification) => verification.taskId === task.id).sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
      )[0];
      const changedFiles = latestRun?.diffStat === null || latestRun?.diffStat === void 0 ? [] : latestRun.diffStat.split("\n").filter((line) => /^[ MARC?]{1,2} \S/.test(line)).map((line) => line.slice(3).trim()).filter(Boolean);
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
        diffStat: latestRun?.diffStat ?? null,
        changedFiles,
        verificationId: latestVerification?.id ?? null,
        postMergeVerificationId: null,
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
  async getMergeContext(proposalId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      const project = state.projects.find(
        (item) => item.id === proposal.projectId
      );
      const task = state.tasks.find(
        (item) => item.id === proposal.taskId
      );
      if (project === void 0 || task === void 0) {
        throw new StudioStoreError(
          "project_not_found",
          "\u5408\u5E76\u63D0\u6848\u5BF9\u5E94\u7684\u9879\u76EE\u4E0D\u5B58\u5728",
          404
        );
      }
      return {
        proposal: structuredClone(proposal),
        project: structuredClone(project),
        task: structuredClone(task)
      };
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
  async setMergePostVerification(proposalId, verificationId) {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const proposal = this.findMergeProposal(state, proposalId);
      proposal.postMergeVerificationId = verificationId;
      proposal.updatedAt = nowIso(this.now);
      state.updatedAt = proposal.updatedAt;
      await this.save();
      return structuredClone(proposal);
    });
  }
  async load() {
    await mkdir2(this.dataDir, { recursive: true });
    if (!existsSync2(this.file)) {
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
  escalateRepeatedFailure(state, task, at, reason, run2) {
    const failures = state.runs.filter(
      (item) => item.taskId === task.id && item.status === "failed"
    ).length;
    if (failures < 2 || task.status === "done") return;
    task.status = "blocked";
    task.updatedAt = at;
    const hasResplit = state.tasks.some(
      (item) => item.originTaskId === task.id
    );
    if (!hasResplit) {
      const architect = state.roles.find(
        (role) => role.projectId === task.projectId && (role.id === "role-architect" || role.title.includes("\u67B6\u6784"))
      ) ?? state.roles.find((role) => role.id === task.ownerRoleId);
      if (architect !== void 0) {
        const resplit = {
          id: newId("task"),
          projectId: task.projectId,
          title: `\u91CD\u62C6\uFF1A${task.title}`.slice(0, 160),
          goal: `\u539F\u4EFB\u52A1\u8FDE\u7EED\u5931\u8D25 ${String(failures)} \u6B21\u3002\u5148\u8BCA\u65AD\u6839\u56E0\uFF0C\u91CD\u62C6\u4EFB\u52A1/\u5951\u7EA6\uFF0C\u4EA7\u51FA\u53EF\u6267\u884C\u7684\u65B0 ticket \u4E0E\u9A8C\u6536\u6807\u51C6\uFF1B\u4E0D\u8981\u76F4\u63A5\u5199\u4E1A\u52A1\u4EE3\u7801\u3002\u6700\u540E\u4E00\u6B21\u5931\u8D25\uFF1A${reason}`,
          status: "backlog",
          priority: task.priority,
          ownerRoleId: architect.id,
          reviewerRoleId: task.reviewerRoleId,
          acceptance: [
            {
              id: newId("acc"),
              text: "\u7ED9\u51FA\u91CD\u62C6\u540E\u7684\u4EFB\u52A1/\u5951\u7EA6",
              done: false
            },
            {
              id: newId("acc"),
              text: "\u6807\u660E\u53EF\u6267\u884C ticket \u4E0E\u9A8C\u6536\u6807\u51C6",
              done: false
            }
          ],
          evidence: [],
          branch: null,
          verifyCommand: task.verifyCommand,
          module: task.module,
          contractRef: task.contractRef,
          kind: "fix",
          integration: false,
          originTaskId: task.id,
          docsSynced: false,
          createdAt: at,
          updatedAt: at
        };
        state.tasks.push(resplit);
        this.recordEvent(state, {
          type: "task.resplit",
          at,
          projectId: task.projectId,
          taskId: resplit.id,
          payload: {
            originTaskId: task.id,
            ownerRoleId: architect.id
          }
        });
      }
    }
    const title = `\u8FDE\u7EED\u5931\u8D25\uFF1A${task.title.slice(0, 160)}`;
    if (state.decisions.some(
      (item) => item.taskId === task.id && item.title === title
    )) {
      return;
    }
    const decision = {
      id: newId("dec"),
      projectId: task.projectId,
      taskId: task.id,
      runId: run2.id,
      title,
      context: `${String(failures)} \u6B21\u5931\u8D25\uFF1B\u6700\u540E\u4E00\u6B21\uFF1A${reason}`,
      options: [
        {
          label: "\u9000\u56DE Architect \u91CD\u62C6\u4EFB\u52A1/\u5951\u7EA6",
          tradeoff: "\u505C\u6B62\u539F\u5730\u91CD\u8BD5\uFF0C\u5148\u4FEE\u4EFB\u52A1\u5B9A\u4E49\u6216\u5951\u7EA6"
        },
        {
          label: "\u7EE7\u7EED\u91CD\u8BD5",
          tradeoff: "\u4FDD\u7559\u5F53\u524D\u4EFB\u52A1\uFF0C\u4F46\u9700\u8981\u65B0\u7684\u8BC1\u636E"
        }
      ],
      recommendation: "\u540C\u4E00\u4EFB\u52A1\u8FDE\u7EED\u5931\u8D25 2 \u6B21\uFF0C\u6309\u5DE5\u4F5C\u6D41\u5E94\u9000\u56DE\u67B6\u6784\u5E08\u91CD\u62C6\uFF0C\u4E0D\u5141\u8BB8\u7B2C\u4E09\u6B21\u539F\u5730\u91CD\u8BD5\u3002",
      reversible: true,
      adrDraft: null,
      status: "pending",
      decision: "",
      note: "",
      decidedBy: "",
      tokenCost: run2.tokens,
      createdAt: at,
      decidedAt: null
    };
    state.decisions.push(decision);
    this.recordEvent(state, {
      type: "decision.escalated",
      at,
      projectId: task.projectId,
      taskId: task.id,
      payload: {
        decisionId: decision.id,
        failures,
        runId: run2.id
      }
    });
  }
  ensureBranch(state, task, at) {
    const name2 = task.branch ?? `task/${task.id}`;
    if (task.branch === null) task.branch = name2;
    let branch = state.branches.find(
      (item) => item.projectId === task.projectId && item.name === name2
    );
    if (branch === void 0) {
      branch = {
        id: `branch-${task.id}`,
        projectId: task.projectId,
        taskId: task.id,
        name: name2,
        goal: task.goal,
        roleId: task.ownerRoleId,
        contractKeys: [],
        status: "open",
        createdAt: at,
        updatedAt: at
      };
      state.branches.push(branch);
    } else {
      branch.taskId = task.id;
      branch.goal = task.goal;
      branch.roleId = task.ownerRoleId;
      if (branch.status === "abandoned" || branch.status === "merged") {
        branch.status = "open";
      }
      branch.updatedAt = at;
    }
    return branch;
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
      repoPath: null,
      prdPath: null,
      invariantsPath: null,
      modulesPath: null,
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
      verifyCommand: null,
      module: null,
      contractRef: null,
      kind: "new",
      integration: false,
      originTaskId: null,
      docsSynced: false,
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
      modules: [],
      tasks,
      mergeProposals: [],
      runs: [],
      branches: tasks.filter((task2) => task2.branch !== null).map((task2) => ({
        id: `branch-${task2.id}`,
        projectId: task2.projectId,
        taskId: task2.id,
        name: task2.branch,
        goal: task2.goal,
        roleId: task2.ownerRoleId,
        contractKeys: [],
        status: task2.status === "review" ? "review" : "open",
        createdAt: task2.createdAt,
        updatedAt: task2.updatedAt
      })),
      contractChanges: [],
      decisions: [],
      verifications: [],
      reviews: [],
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

// src/host/docs.ts
var MAX_BYTES = 2e5;
var DocsService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async read(relativePath) {
    const data = await this.store.bootstrap();
    if (data.project === null || data.project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "\u9879\u76EE\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u4EE3\u7801\u4ED3\u5E93\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u6587\u6863",
        409
      );
    }
    const root = path4.resolve(data.project.repoPath);
    const resolved = path4.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path4.sep}`)) {
      throw new StudioStoreError(
        "path_outside_repo",
        "\u6587\u6863\u8DEF\u5F84\u5FC5\u987B\u4F4D\u4E8E\u9879\u76EE\u4ED3\u5E93\u5185",
        400
      );
    }
    try {
      const buffer = await readFile3(resolved);
      const truncated = buffer.byteLength > MAX_BYTES;
      return {
        kind: "custom",
        path: relativePath,
        content: buffer.subarray(0, MAX_BYTES).toString("utf8"),
        truncated,
        exists: true
      };
    } catch {
      return {
        kind: "custom",
        path: relativePath,
        content: "",
        truncated: false,
        exists: false
      };
    }
  }
};

// src/host/merge.ts
import { execFile } from "node:child_process";

// src/host/verify.ts
import { exec } from "node:child_process";
import { promisify } from "node:util";
var run = promisify(exec);
async function runVerificationCommand(command, workdir) {
  try {
    const result = await run(command, {
      cwd: workdir,
      timeout: 18e4,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true
    });
    return { output: `${result.stdout}${result.stderr}`, exitCode: 0 };
  } catch (error) {
    const failed = error;
    return {
      output: `${failed.stdout ?? ""}${failed.stderr ?? ""}${failed.message ?? ""}`,
      exitCode: typeof failed.code === "number" ? failed.code : 1
    };
  }
}
var VerificationService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async verify(taskId, command) {
    const context = await this.store.getTaskVerificationContext(taskId);
    if (context.run === null || context.run.workspacePath === null) {
      throw new StudioStoreError(
        "workspace_required",
        "\u8FD9\u4E2A\u4EFB\u52A1\u8FD8\u6CA1\u6709\u53EF\u9A8C\u8BC1\u7684 worktree\uFF1B\u5148\u6D3E\u5355\u6267\u884C\u4E00\u6B21",
        409
      );
    }
    const resolved = (command?.trim() || context.task.verifyCommand || "").trim() || "npm test";
    const workdir = context.run.workspacePath;
    const { output, exitCode } = await runVerificationCommand(
      resolved,
      workdir
    );
    return this.store.recordVerification(taskId, {
      command: resolved,
      workdir,
      exitCode,
      output,
      passed: exitCode === 0,
      runId: context.run.id
    });
  }
};

// src/host/merge.ts
function git2(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: 12e4,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          const failure = error;
          reject(
            new StudioStoreError(
              "git_failed",
              [
                `git ${args.join(" ")} \u5931\u8D25`,
                (failure.stderr ?? stderr ?? "").trim(),
                (failure.stdout ?? stdout ?? "").trim()
              ].filter(Boolean).join("\uFF1A"),
              409
            )
          );
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}
var GitMergeService = class {
  store;
  constructor(store) {
    this.store = store;
  }
  async execute(proposalId) {
    const { proposal, project, task } = await this.store.getMergeContext(proposalId);
    if (proposal.status !== "approved") {
      throw new StudioStoreError(
        "merge_not_approved",
        "\u53EA\u6709\u5DF2\u6279\u51C6\u7684\u5408\u5E76\u63D0\u6848\u53EF\u4EE5\u6267\u884C Git \u5408\u5E76",
        409
      );
    }
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "\u9879\u76EE\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u4EE3\u7801\u4ED3\u5E93",
        409
      );
    }
    const repo = project.repoPath;
    const current = (await git2(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
    if (current !== proposal.base) {
      throw new StudioStoreError(
        "merge_wrong_branch",
        `\u5F53\u524D\u5206\u652F\u662F\u300C${current}\u300D\uFF0C\u8BF7\u5148\u5207\u5230\u57FA\u7840\u5206\u652F\u300C${proposal.base}\u300D\u518D\u6267\u884C\u5408\u5E76`,
        409
      );
    }
    const dirty = (await git2(repo, ["status", "--porcelain"])).stdout.trim();
    if (dirty !== "") {
      throw new StudioStoreError(
        "merge_dirty",
        "\u5DE5\u4F5C\u533A\u4E0D\u5E72\u51C0\uFF1B\u8BF7\u5148\u63D0\u4EA4\u6216\u6E05\u7406\u6539\u52A8\u518D\u5408\u5E76",
        409
      );
    }
    try {
      await git2(repo, ["rev-parse", "--verify", proposal.branch]);
    } catch {
      throw new StudioStoreError(
        "merge_branch_missing",
        `\u627E\u4E0D\u5230\u4EFB\u52A1\u5206\u652F\u300C${proposal.branch}\u300D`,
        409
      );
    }
    const inProgress = await git2(repo, [
      "rev-parse",
      "-q",
      "--verify",
      "MERGE_HEAD"
    ]).then(
      () => true,
      () => false
    );
    if (inProgress) {
      throw new StudioStoreError(
        "merge_in_progress",
        "\u4ED3\u5E93\u91CC\u5DF2\u6709\u672A\u5B8C\u6210\u7684\u5408\u5E76\uFF1B\u8BF7\u5148\u5904\u7406\u6216 abort",
        409
      );
    }
    try {
      await git2(repo, [
        "merge",
        "--no-ff",
        proposal.branch,
        "-m",
        `Merge ${proposal.branch} into ${proposal.base} (Studio ${proposal.id})`
      ]);
    } catch (error) {
      try {
        await git2(repo, ["merge", "--abort"]);
      } catch {
      }
      throw error;
    }
    const commit = (await git2(repo, ["rev-parse", "HEAD"])).stdout.trim();
    const merged = await this.store.completeMergeProposal(
      proposalId,
      commit
    );
    const command = task.verifyCommand?.trim() || "npm test";
    const result = await runVerificationCommand(command, repo);
    const verification = await this.store.recordVerification(task.id, {
      command,
      workdir: repo,
      exitCode: result.exitCode,
      output: result.output,
      passed: result.exitCode === 0,
      runId: null
    });
    return this.store.setMergePostVerification(
      merged.id,
      verification.id
    );
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
function asUpdateProject(body) {
  const optionalPath = (value, field) => value === void 0 ? void 0 : value === null ? null : asString(value, field);
  return {
    repoPath: optionalPath(body.repoPath, "repoPath"),
    prdPath: optionalPath(body.prdPath, "prdPath"),
    invariantsPath: optionalPath(
      body.invariantsPath,
      "invariantsPath"
    ),
    modulesPath: optionalPath(body.modulesPath, "modulesPath")
  };
}
function asCreateModule(body) {
  return {
    name: asString(body.name, "name"),
    responsibility: asOptionalString(body.responsibility, "responsibility"),
    contractPath: asOptionalString(body.contractPath, "contractPath"),
    contractText: asOptionalString(body.contractText, "contractText"),
    allowedPaths: asStringArray(body.allowedPaths, "allowedPaths"),
    forbiddenPaths: asStringArray(body.forbiddenPaths, "forbiddenPaths"),
    dependsOn: asStringArray(body.dependsOn, "dependsOn")
  };
}
function asUpdateModule(body) {
  return {
    responsibility: asOptionalString(body.responsibility, "responsibility"),
    contractPath: body.contractPath === null ? null : asOptionalString(body.contractPath, "contractPath"),
    contractText: asOptionalString(body.contractText, "contractText"),
    allowedPaths: asStringArray(body.allowedPaths, "allowedPaths"),
    forbiddenPaths: asStringArray(body.forbiddenPaths, "forbiddenPaths"),
    dependsOn: asStringArray(body.dependsOn, "dependsOn")
  };
}
function asCreateDecision(body) {
  return {
    title: asString(body.title, "title"),
    context: asOptionalString(body.context, "context"),
    recommendation: asOptionalString(body.recommendation, "recommendation"),
    taskId: body.taskId === null || body.taskId === void 0 ? null : asString(body.taskId, "taskId"),
    reversible: body.reversible !== false
  };
}
function asDecideDecision(body) {
  if (body.status !== "approved" && body.status !== "rejected") {
    throw new HttpError(
      400,
      "invalid_input",
      "status \u53EA\u80FD\u662F approved \u6216 rejected"
    );
  }
  return {
    status: body.status,
    decision: asOptionalString(body.decision, "decision"),
    note: asOptionalString(body.note, "note")
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
  const kind = body.kind === "fix" || body.kind === "new" ? body.kind : void 0;
  return {
    title: asString(body.title, "title"),
    goal: asOptionalString(body.goal, "goal"),
    priority,
    ownerRoleId: owner,
    reviewerRoleId: reviewer,
    acceptance: asStringArray(body.acceptance, "acceptance"),
    branch: asOptionalString(body.branch, "branch") ?? null,
    verifyCommand: asOptionalString(body.verifyCommand, "verifyCommand") ?? null,
    module: asOptionalString(body.module, "module") ?? null,
    contractRef: asOptionalString(body.contractRef, "contractRef") ?? null,
    kind,
    integration: body.integration === true,
    originTaskId: asOptionalString(body.originTaskId, "originTaskId") ?? null
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
  if (body.verifyCommand !== void 0) {
    result.verifyCommand = body.verifyCommand === null ? null : asOptionalString(body.verifyCommand, "verifyCommand");
  }
  if (body.module !== void 0) {
    result.module = body.module === null ? null : asOptionalString(body.module, "module");
  }
  if (body.contractRef !== void 0) {
    result.contractRef = body.contractRef === null ? null : asOptionalString(body.contractRef, "contractRef");
  }
  if (body.kind !== void 0) {
    if (body.kind !== "new" && body.kind !== "fix") {
      throw new HttpError(400, "invalid_input", "kind \u65E0\u6548");
    }
    result.kind = body.kind;
  }
  if (body.integration !== void 0) {
    if (typeof body.integration !== "boolean") {
      throw new HttpError(400, "invalid_input", "integration \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
    }
    result.integration = body.integration;
  }
  if (body.docsSynced !== void 0) {
    if (typeof body.docsSynced !== "boolean") {
      throw new HttpError(400, "invalid_input", "docsSynced \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
    }
    result.docsSynced = body.docsSynced;
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
  verifyTask;
  reviewTask;
  executeMerge;
  readProjectDoc;
  constructor(options) {
    this.store = options.store;
    this.token = options.token;
    this.dshVersion = options.dshVersion;
    this.compatibility = options.compatibility;
    this.connection = options.connection;
    this.getBootPayload = options.getBootPayload;
    this.dispatchTask = options.dispatchTask;
    this.verifyTask = options.verifyTask;
    this.reviewTask = options.reviewTask;
    this.executeMerge = options.executeMerge;
    this.readProjectDoc = options.readProjectDoc;
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
    const projectMatch = /^\/studio-api\/projects\/([^/]+)$/.exec(parsed.pathname);
    if (projectMatch !== null) {
      this.requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const project = await this.store.updateProject(
        decodeSegment(projectMatch[1] ?? ""),
        asUpdateProject(await readJson(req))
      );
      sendJson(res, 200, { ok: true, project });
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
      const run2 = await this.dispatchTask(
        decodeSegment(taskDispatch[1] ?? "")
      );
      sendJson(res, 202, { ok: true, run: run2 });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/project-docs`) {
      this.requireMethod(parsed, ["GET"]);
      const docPath = parsed.url.searchParams.get("path");
      if (docPath === null || docPath.trim() === "") {
        throw new HttpError(400, "invalid_input", "path \u4E0D\u80FD\u4E3A\u7A7A");
      }
      const doc = await this.readProjectDoc(docPath);
      sendJson(res, 200, { ok: true, doc });
      return;
    }
    const taskVerify = /^\/studio-api\/tasks\/([^/]+)\/verify$/.exec(parsed.pathname);
    if (taskVerify !== null) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const command = body.command === void 0 ? void 0 : asOptionalString(body.command, "command");
      const verification = await this.verifyTask(
        decodeSegment(taskVerify[1] ?? ""),
        command
      );
      sendJson(res, 200, { ok: true, verification });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/modules`) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const module = await this.store.createModule(
        asCreateModule(await readJson(req))
      );
      sendJson(res, 201, { ok: true, module });
      return;
    }
    const moduleMatch = /^\/studio-api\/modules\/([^/]+)$/.exec(
      parsed.pathname
    );
    if (moduleMatch !== null) {
      this.requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const module = await this.store.updateModule(
        decodeSegment(moduleMatch[1] ?? ""),
        asUpdateModule(await readJson(req))
      );
      sendJson(res, 200, { ok: true, module });
      return;
    }
    const taskReview = /^\/studio-api\/tasks\/([^/]+)\/review$/.exec(parsed.pathname);
    if (taskReview !== null) {
      this.requireMethod(parsed, ["POST"]);
      const review = await this.reviewTask(
        decodeSegment(taskReview[1] ?? "")
      );
      sendJson(res, 200, { ok: true, review });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/decisions`) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const decision = await this.store.createDecision(
        asCreateDecision(await readJson(req))
      );
      sendJson(res, 201, { ok: true, decision });
      return;
    }
    const decisionDecide = /^\/studio-api\/decisions\/([^/]+)\/decide$/.exec(parsed.pathname);
    if (decisionDecide !== null) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const decision = await this.store.decideDecision(
        decodeSegment(decisionDecide[1] ?? ""),
        asDecideDecision(await readJson(req))
      );
      sendJson(res, 200, { ok: true, decision });
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
    const mergeDecision = /^\/studio-api\/merge-proposals\/([^/]+)\/(approve|reject|merge|execute)$/.exec(
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
      ) : action === "execute" ? await this.executeMerge(proposalId) : await this.store.completeMergeProposal(
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
  const verifier = new VerificationService(store);
  const docs = new DocsService(store);
  const merger = new GitMergeService(store);
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
    dispatchTask: (taskId) => dispatcher.dispatch(taskId),
    verifyTask: (taskId, command) => verifier.verify(taskId, command),
    reviewTask: (taskId) => dispatcher.review(taskId),
    executeMerge: (proposalId) => merger.execute(proposalId),
    readProjectDoc: (path5) => docs.read(path5)
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
