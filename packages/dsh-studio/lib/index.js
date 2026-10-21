// src/host/index.ts
import { randomBytes } from "node:crypto";

// src/shared/types.ts
var STUDIO_SCHEMA_VERSION = 1;
var STUDIO_PLUGIN_VERSION = "0.1.0";
var TASK_STATUS_ORDER = [
  "backlog",
  "ready",
  "running",
  "blocked",
  "review",
  "done"
];
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

// src/host/store.ts
import { randomUUID } from "node:crypto";
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
  return `${prefix}-${randomUUID().slice(0, 8)}`;
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
function statsFor(tasks) {
  const stats = {
    total: tasks.length,
    backlog: 0,
    ready: 0,
    running: 0,
    blocked: 0,
    review: 0,
    done: 0,
    acceptanceDone: 0,
    acceptanceTotal: 0
  };
  for (const task of tasks) {
    stats[task.status] += 1;
    stats.acceptanceTotal += task.acceptance.length;
    stats.acceptanceDone += task.acceptance.filter((item) => item.done).length;
  }
  return stats;
}
function isProject(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.description === "string" && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}
function isRole(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.name === "string" && typeof value.title === "string" && typeof value.mission === "string" && Array.isArray(value.responsibilities) && Array.isArray(value.nonGoals) && Array.isArray(value.decisionRights);
}
function isTask(value) {
  return isRecord(value) && typeof value.id === "string" && typeof value.projectId === "string" && typeof value.title === "string" && typeof value.goal === "string" && isTaskStatus(value.status) && isTaskPriority(value.priority) && Array.isArray(value.acceptance) && Array.isArray(value.evidence);
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
  if (!Array.isArray(value.projects) || !Array.isArray(value.roles) || !Array.isArray(value.tasks) || !Array.isArray(value.events)) {
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
      const events = [...state.events].filter((event) => project === null || event.projectId === project.id).slice(-30).reverse();
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
          serverTime: nowIso(this.now)
        },
        projects: [...state.projects],
        activeProjectId: state.activeProjectId,
        project,
        roles,
        tasks,
        stats: statsFor(tasks),
        events,
        features: {
          independentPage: true,
          filePersistence: true,
          agentExecution: false,
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
      assertState(parsed);
      this.state = parsed;
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
    const temp = `${this.file}.${randomUUID()}.tmp`;
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
      id: `acc-demo-${String(index)}-${randomUUID().slice(0, 4)}`,
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
function asCreateProject(body) {
  return {
    name: asString(body.name, "name"),
    description: asOptionalString(body.description, "description")
  };
}
function asCreateRole(body) {
  return {
    name: asString(body.name, "name"),
    title: asOptionalString(body.title, "title"),
    mission: asOptionalString(body.mission, "mission"),
    responsibilities: asStringArray(body.responsibilities, "responsibilities")
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
var StudioRouter = class {
  store;
  token;
  dshVersion;
  compatibility;
  constructor(options) {
    this.store = options.store;
    this.token = options.token;
    this.dshVersion = options.dshVersion;
    this.compatibility = options.compatibility;
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
var inject = ["webServer"];
function injectBoot(html, payload) {
  const json = JSON.stringify(payload).replaceAll("<", "\\u003c");
  const script = `<script>globalThis.__DSH_STUDIO__=${json}</script>`;
  const at = html.indexOf("</head>");
  if (at === -1) return `${script}${html}`;
  return `${html.slice(0, at)}${script}${html.slice(at)}`;
}
async function apply(ctx) {
  const runtime = await readRuntimeInfo();
  const compatibility = compatibilityOf(runtime.version);
  const capabilities = hostCapabilities(ctx, runtime.version);
  if (!capabilities.webServer || typeof ctx.webServer.register !== "function" || typeof ctx.webServer.tapIndex !== "function") {
    ctx.logger?.error(
      "dsh-studio: this DSH build does not expose ctx.webServer.register/tapIndex; the Studio page stays unmounted."
    );
    return;
  }
  const store = new StudioStore();
  await store.init();
  const token = randomBytes(24).toString("hex");
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const router = new StudioRouter({
    store,
    token,
    dshVersion: runtime.version,
    compatibility
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
    const disposeIndex = ctx.webServer.tapIndex(
      (html) => injectBoot(html, {
        token,
        basePath: "/studio-api",
        pluginVersion: STUDIO_PLUGIN_VERSION,
        dshVersion: runtime.version,
        startedAt,
        dataDir: store.dataDir
      })
    );
    return () => {
      disposeRoute();
      disposeIndex();
    };
  };
  if (typeof ctx.effect === "function") {
    ctx.effect(install, "dsh-studio: http + boot payload");
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
