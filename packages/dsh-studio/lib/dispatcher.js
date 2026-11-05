// src/host/dispatcher.ts
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path2 from "node:path";

// src/host/workspace.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
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
  if (taskId.trim() === "" || taskId === "." || taskId === ".." || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(taskId)) {
    throw new WorkspaceError(
      "invalid_task_id",
      `taskId \u4E0D\u80FD\u4F5C\u4E3A\u76EE\u5F55\u540D\uFF1A${JSON.stringify(taskId)}`
    );
  }
  return taskId;
}
var WorkspaceManager = class {
  async prepare(repoPath, taskId) {
    const resolved = path.resolve(repoPath);
    if (!existsSync(resolved)) {
      throw new WorkspaceError(
        "repo_missing",
        `\u9879\u76EE\u4ED3\u5E93\u4E0D\u5B58\u5728\uFF1A${resolved}`
      );
    }
    const root = git(resolved, ["rev-parse", "--show-toplevel"]);
    const baseSha = git(root, ["rev-parse", "HEAD"]);
    const key = sanitize(taskId);
    const worktreeRoot = path.join(root, ".worktrees");
    const worktreePath = path.resolve(worktreeRoot, key);
    if (!worktreePath.startsWith(`${path.resolve(worktreeRoot)}${path.sep}`)) {
      throw new WorkspaceError(
        "invalid_worktree_path",
        "worktree \u8DEF\u5F84\u8D8A\u51FA .worktrees \u76EE\u5F55"
      );
    }
    const branch = `studio/${key}`;
    await mkdir(worktreeRoot, { recursive: true });
    if (existsSync(worktreePath)) {
      const current = git(worktreePath, ["branch", "--show-current"]);
      if (current !== branch) {
        throw new WorkspaceError(
          "worktree_branch_mismatch",
          `worktree \u5DF2\u5B58\u5728\u4F46\u5206\u652F\u662F\u300C${current}\u300D\uFF0C\u671F\u671B\u300C${branch}\u300D`
        );
      }
      return { repoPath: root, path: worktreePath, branch, baseSha };
    }
    const branches = git(root, ["branch", "--list", branch]);
    if (branches === "") {
      const remote = git(root, [
        "branch",
        "-r",
        "--list",
        `origin/${branch}`
      ]);
      git(root, [
        "worktree",
        "add",
        "-b",
        branch,
        worktreePath,
        remote === "" ? "HEAD" : `origin/${branch}`
      ]);
    } else {
      git(root, ["worktree", "add", worktreePath, branch]);
    }
    return { repoPath: root, path: worktreePath, branch, baseSha };
  }
  commit(worktreePath, message) {
    if (!existsSync(worktreePath)) return null;
    const status = git(worktreePath, ["status", "--short"]);
    if (status === "") return null;
    git(worktreePath, ["add", "-A"]);
    git(worktreePath, [
      "-c",
      "user.name=Studio Agent",
      "-c",
      "user.email=agent@studio.local",
      "commit",
      "-m",
      message
    ]);
    return git(worktreePath, ["rev-parse", "HEAD"]);
  }
  diffStat(worktreePath) {
    if (!existsSync(worktreePath)) return "";
    const status = git(worktreePath, ["status", "--short"]);
    const stat = git(worktreePath, ["diff", "--stat"]);
    return [status, stat].filter((line) => line !== "").join("\n").trim();
  }
  patch(worktreePath, baseSha, includeWorkingTree = false) {
    if (!existsSync(worktreePath)) return "";
    const range = includeWorkingTree ? baseSha : `${baseSha}...HEAD`;
    return git(worktreePath, ["diff", "--no-color", range]);
  }
};

// src/host/dispatcher.ts
var WORKER_PRESET = "standard";
var WORKER_SANDBOX = "workspace-write";
var REVIEW_SANDBOX = "read-only";
var WORKER_RESTRICTED = [
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
  "cordis_read"
];
var REVIEW_RESTRICTED = [
  ...WORKER_RESTRICTED,
  "write",
  "edit",
  "pwsh",
  "bash",
  "present"
];
var STUDIO_WORKER_POLICY = {
  sandboxMode: WORKER_SANDBOX,
  restrictedTools: WORKER_RESTRICTED
};
var STUDIO_REVIEW_POLICY = {
  sandboxMode: REVIEW_SANDBOX,
  restrictedTools: REVIEW_RESTRICTED
};
function restrictKnownTools(restrict, deny) {
  let remaining = [...deny];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      restrict({ deny: remaining });
      return remaining;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const quoted = [...message.matchAll(/"([^"]+)"/g)].map(
        (match) => match[1] ?? ""
      );
      const unknown = new Set(quoted.filter(Boolean));
      const next = remaining.filter((name) => !unknown.has(name));
      if (next.length === remaining.length) throw error;
      remaining = next;
    }
  }
  throw new Error("tools.restrict \u65E0\u6CD5\u6536\u655B\u5230\u5F53\u524D\u5BBF\u4E3B\u7684\u5DE5\u5177\u96C6");
}
async function bindStudioRuntime(ctx, agentCtx, agent, options) {
  const mounted = await ctx.agentPresets.mount(agentCtx, WORKER_PRESET);
  if (mounted.id !== WORKER_PRESET) {
    throw new Error(`Agent preset mount returned ${mounted.id}, expected ${WORKER_PRESET}`);
  }
  if (ctx.approval?.setPolicy !== void 0) {
    ctx.approval.setPolicy(agent, "never");
  } else {
    agent.session.append("approval/policy", { policy: "never" });
  }
  if (ctx.sandboxPolicy?.setSandboxMode !== void 0) {
    ctx.sandboxPolicy.setSandboxMode(agent.session, options.sandboxMode);
  } else {
    agent.session.append("sandbox/mode", { mode: options.sandboxMode });
  }
  const tools = agentCtx.tools;
  if (tools?.restrict === void 0) {
    throw new Error(
      "tools.restrict unavailable; refusing to run without a tool boundary"
    );
  }
  const restrictedTools = restrictKnownTools(
    tools.restrict.bind(tools),
    options.restrictedTools
  );
  return {
    agentPreset: WORKER_PRESET,
    approvalPolicy: "never",
    sandboxMode: options.sandboxMode,
    restrictedTools
  };
}
function changedFilesFromDiff(diffStat) {
  if (diffStat === null) return [];
  return diffStat.split("\n").map((line) => /^[ MARC?]{1,2} (\S.*)$/.exec(line)?.[1]?.trim() ?? "").filter(Boolean);
}
function clipPatch(value) {
  if (value === null || value.length <= 12e4) return value;
  return `${value.slice(0, 12e4)}
\u2026 patch truncated by Host`;
}
function assistantText(messages) {
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (assistant === void 0) return "";
  return assistant.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n").trim();
}
function balancedJsonAt(source, start) {
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
function extractJsonObject(text) {
  const fenced = [
    ...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)
  ].map((match) => match[1] ?? "");
  const sources = [...fenced, text];
  for (const source of sources) {
    const starts = [];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "{") starts.push(index);
    }
    for (let index = starts.length - 1; index >= 0; index -= 1) {
      const start = starts[index];
      if (start === void 0) continue;
      const candidate = balancedJsonAt(source, start);
      if (candidate === null) continue;
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
      }
    }
  }
  return void 0;
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
function runCli(command, cwd, prompt, timeoutMs = 6e5) {
  return new Promise((resolve, reject) => {
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];
    const child = spawn(shell, args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error(`\u5916\u90E8\u6267\u884C\u5668\u8D85\u8FC7 ${String(timeoutMs / 1e3)} \u79D2\u672A\u5B8C\u6210`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
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
async function executeExternalCli(executor, prompt, workspace) {
  if (executor === "claude-code") {
    const result = await runCli(
      "claude -p --output-format json --permission-mode acceptEdits",
      workspace.path,
      prompt
    );
    let output = result.stdout;
    try {
      const parsed = JSON.parse(result.stdout);
      if (typeof parsed === "object" && parsed !== null && typeof parsed.result === "string") {
        output = parsed.result;
      }
    } catch {
    }
    return { output, code: result.code, stderr: result.stderr };
  }
  const temp = await mkdtemp(path2.join(os.tmpdir(), "studio-codex-"));
  const messageFile = path2.join(temp, "last-message.txt");
  try {
    const result = await runCli(
      `codex exec --json -s workspace-write --output-last-message "${messageFile}" -`,
      workspace.path,
      prompt
    );
    let output = result.stdout;
    try {
      output = (await readFile(messageFile, "utf8")).trim() || output;
    } catch {
    }
    return { output, code: result.code, stderr: result.stderr };
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => void 0);
  }
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
    task.diagnosis === "" ? "" : `\u8BCA\u65AD\uFF1A
${task.diagnosis.slice(0, 4e3)}`,
    task.plan === "" ? "" : `\u4FEE\u6539\u8BA1\u5212\uFF1A
${task.plan.slice(0, 4e3)}`,
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
    `base\uFF1A${context.run?.baseSha ?? "\u672A\u8BB0\u5F55"}\uFF1B\u5206\u652F\uFF1A${context.run?.branchName ?? "\u672A\u8BB0\u5F55"}`,
    "\u5B9E\u73B0\u8005 diff\uFF1A",
    context.run?.diffPatch ?? context.run?.diffStat ?? "\uFF08\u6CA1\u6709\u4EE3\u7801 diff\uFF09",
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
    const executor = context.providerProfile?.executor ?? context.role.executor ?? "dsh";
    if (executor !== "dsh" && context.project.repoPath === null) {
      throw new Error("\u5916\u90E8\u6267\u884C\u5668\u53EA\u652F\u6301\u5DF2\u7ED1\u5B9A\u4EE3\u7801\u4ED3\u5E93\u7684\u4EFB\u52A1");
    }
    const selection = executor === "dsh" ? await this.resolveModel(context.role, context.providerProfile) : {
      provider: "external",
      model: context.providerProfile?.model ?? context.role.model ?? executor
    };
    const workspace = context.project.repoPath === null ? void 0 : await this.workspaces.prepare(context.project.repoPath, taskId);
    const prompt = buildPrompt(context, workspace);
    const run = await this.store.beginRun(taskId, prompt, workspace, {
      providerProfileId: context.providerProfile?.id ?? null,
      executor,
      provider: selection.provider,
      model: selection.model
    });
    if (executor === "dsh") {
      void this.execute(run, selection, workspace, context.task.timeoutSeconds);
    } else if (workspace !== void 0) {
      void this.executeExternal(run, prompt, workspace, executor);
    }
    return run;
  }
  async review(taskId) {
    const context = await this.store.getReviewContext(taskId);
    if (context.run === null || context.run.workspacePath === null) {
      throw new Error("\u8FD9\u4E2A\u4EFB\u52A1\u8FD8\u6CA1\u6709\u53EF\u8BC4\u5BA1\u7684 worktree");
    }
    const selection = await this.resolveModel(
      context.role,
      context.providerProfile
    );
    const prompt = buildReviewPrompt(context);
    let handle = null;
    let output = "";
    try {
      handle = await this.ctx.agents.create({
        sessionId: `review-${randomUUID()}`,
        meta: { cwd: context.run.workspacePath },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          await bindStudioRuntime(this.ctx, agentCtx, agent, {
            sandboxMode: REVIEW_SANDBOX,
            restrictedTools: REVIEW_RESTRICTED
          });
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
  async resolveModel(role, profile = null) {
    const fallback = this.ctx.agentDefaultModel.currentSelection();
    const wanted = (profile?.model !== void 0 && profile.model !== "" ? profile.model : void 0) ?? role.model ?? fallback.model;
    const preferred = profile?.provider ?? "";
    const providers = [...this.ctx.llm.listProviders()].sort((left, right) => {
      if (preferred !== "") {
        if (left.id === preferred) return -1;
        if (right.id === preferred) return 1;
      }
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
  async execute(run, selection, workspace, timeoutSeconds) {
    let handle = null;
    let runtime = null;
    try {
      handle = await this.ctx.agents.create({
        sessionId: `run-${randomUUID()}`,
        meta: { cwd: workspace?.path ?? process.cwd() },
        agentOptions: selection,
        setup: async (agentCtx, agent) => {
          runtime = await bindStudioRuntime(this.ctx, agentCtx, agent, {
            ...STUDIO_WORKER_POLICY
          });
        }
      });
      await this.store.attachRunSession(
        run.id,
        handle.agent.session.id,
        selection.model
      );
      if (runtime !== null) {
        await this.store.recordRunRuntime(run.id, runtime);
      }
      handle.agent.followup({
        role: "user",
        content: [{ type: "text", text: run.prompt }],
        source: { kind: "user" }
      });
      const timeout = timeoutSeconds ?? (workspace === void 0 ? 120 : 300);
      const deadline = Date.now() + timeout * 1e3;
      let output = "";
      let idleTicks = 0;
      let finished = false;
      while (Date.now() < deadline) {
        output = assistantText(handle.agent.session.deriveMessages());
        if (handle.agent.status === "idle") {
          if (output !== "") {
            finished = true;
            break;
          }
          idleTicks += 1;
          if (idleTicks >= 10) {
            finished = true;
            break;
          }
        } else {
          idleTicks = 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (!finished) {
        await this.store.timeoutRun(
          run.id,
          `Agent \u5728 ${String(timeout)} \u79D2\u5185\u6CA1\u6709\u5B8C\u6210\uFF1Bworktree \u5DF2\u4FDD\u7559\uFF0C\u8BF7\u4EBA\u5DE5\u63A5\u7BA1`
        );
        return;
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
      const workingPatch = workspace === void 0 ? null : clipPatch(this.workspaces.patch(workspace.path, workspace.baseSha, true));
      if (workspace !== void 0) {
        const violations = await this.store.enforceContractScope(
          run.taskId,
          run.id,
          changedFilesFromDiff(diffStat)
        );
        if (violations.length > 0) {
          await this.store.completeRun(run.id, {
            output,
            receipt,
            tokens: typeof measured.totalTokens === "number" ? measured.totalTokens : null,
            diffStat,
            diffPatch: workingPatch,
            commitSha: null
          });
          await this.store.externalizeRunOutput(run.id, output);
          return;
        }
      }
      const commitSha = workspace !== void 0 && diffStat !== "" && diffStat !== null ? this.workspaces.commit(
        workspace.path,
        `studio: complete ${run.taskId} (${run.id})`
      ) : null;
      const diffPatch = workspace === void 0 ? null : commitSha === null ? workingPatch : clipPatch(this.workspaces.patch(workspace.path, workspace.baseSha));
      await this.store.completeRun(run.id, {
        output,
        receipt,
        tokens: typeof measured.totalTokens === "number" ? measured.totalTokens : null,
        diffStat,
        diffPatch,
        commitSha
      });
      await this.store.externalizeRunOutput(run.id, output);
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
  async executeExternal(run, prompt, workspace, executor) {
    try {
      const result = await executeExternalCli(executor, prompt, workspace);
      if (result.code !== 0) {
        throw new Error(
          `${executor} \u9000\u51FA\u7801 ${String(result.code)}\uFF1A${result.stderr.slice(0, 1200)}`
        );
      }
      const output = result.output.trim();
      const diffStat = this.workspaces.diffStat(workspace.path);
      const workingPatch = clipPatch(
        this.workspaces.patch(workspace.path, workspace.baseSha, true)
      );
      const violations = await this.store.enforceContractScope(
        run.taskId,
        run.id,
        changedFilesFromDiff(diffStat)
      );
      const receipt = normalizeReceipt(extractJsonObject(output), output);
      if (violations.length > 0) {
        await this.store.completeRun(run.id, {
          output,
          receipt,
          tokens: null,
          diffStat,
          diffPatch: workingPatch,
          commitSha: null
        });
        await this.store.externalizeRunOutput(run.id, output);
        return;
      }
      const commitSha = diffStat !== "" ? this.workspaces.commit(
        workspace.path,
        `studio: complete ${run.taskId} (${run.id})`
      ) : null;
      const diffPatch = commitSha === null ? workingPatch : clipPatch(this.workspaces.patch(workspace.path, workspace.baseSha));
      await this.store.completeRun(run.id, {
        output,
        receipt,
        tokens: null,
        diffStat,
        diffPatch,
        commitSha
      });
      await this.store.externalizeRunOutput(run.id, output);
    } catch (error) {
      await this.store.failRun(
        run.id,
        error instanceof Error ? error.message : String(error)
      ).catch(() => void 0);
    }
  }
};
export {
  AgentDispatcher,
  STUDIO_REVIEW_POLICY,
  STUDIO_WORKER_POLICY,
  bindStudioRuntime,
  extractJsonObject
};
