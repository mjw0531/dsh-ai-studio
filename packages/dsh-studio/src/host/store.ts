import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ALLOWED_TRANSITIONS,
  STUDIO_PLUGIN_VERSION,
  STUDIO_SCHEMA_VERSION,
  canTransition,
  isTaskPriority,
  isTaskStatus,
} from "../shared/types.js";
import type {
  AcceptanceItem,
  BootstrapResponse,
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  EvidenceItem,
  Project,
  Role,
  StudioEvent,
  StudioState,
  StudioStats,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
} from "../shared/types.js";

export class StudioStoreError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "StudioStoreError";
    this.code = code;
    this.status = status;
  }
}

export interface StudioStoreOptions {
  dataDir?: string;
  now?: () => Date;
}

interface StoreSnapshot {
  state: StudioState;
  warning: string | null;
}

export function defaultStudioDataDir(): string {
  const home = process.env.DSH_HOME?.trim();
  return path.join(
    home !== undefined && home !== "" ? home : path.join(os.homedir(), ".dsh"),
    "studio",
  );
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
  }
  const text = value.trim();
  if (text === "") {
    throw new StudioStoreError("invalid_input", `${field} 不能为空`);
  }
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} 不能超过 ${String(max)} 个字符`,
    );
  }
  return text;
}

function optionalText(value: unknown, field: string, max = 4000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} 不能超过 ${String(max)} 个字符`,
    );
  }
  return text;
}

function textList(value: unknown, field: string, maxItems = 20): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", `${field} 必须是数组`);
  }
  return value
    .slice(0, maxItems)
    .map((item, index) => requiredText(item, `${field}[${String(index)}]`, 400));
}

function normalizeAcceptance(
  value: unknown,
  existing: AcceptanceItem[] = [],
): AcceptanceItem[] {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "acceptance 必须是数组");
  }
  if (value.length === 0) {
    throw new StudioStoreError(
      "acceptance_required",
      "至少需要一条可验证的验收标准",
    );
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 20).map((raw, index) => {
    if (typeof raw === "string") {
      const text = requiredText(raw, `acceptance[${String(index)}]`, 400);
      return { id: newId("acc"), text, done: false };
    }
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `acceptance[${String(index)}] 必须是字符串或对象`,
      );
    }
    const text = requiredText(
      raw.text,
      `acceptance[${String(index)}].text`,
      400,
    );
    const id =
      typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("acc");
    const previous = byId.get(id);
    return {
      id,
      text,
      done: typeof raw.done === "boolean" ? raw.done : (previous?.done ?? false),
    };
  });
}

function normalizeEvidence(
  value: unknown,
  existing: EvidenceItem[],
  at: string,
): EvidenceItem[] {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "evidence 必须是数组");
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 50).map((raw, index) => {
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `evidence[${String(index)}] 必须是对象`,
      );
    }
    const text = requiredText(raw.text, `evidence[${String(index)}].text`, 800);
    const id =
      typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("ev");
    const previous = byId.get(id);
    return {
      id,
      text,
      createdAt:
        previous?.createdAt ??
        (typeof raw.createdAt === "string" ? raw.createdAt : at),
    };
  });
}

function statsFor(tasks: Task[]): StudioStats {
  const stats: StudioStats = {
    total: tasks.length,
    backlog: 0,
    ready: 0,
    running: 0,
    blocked: 0,
    review: 0,
    done: 0,
    acceptanceDone: 0,
    acceptanceTotal: 0,
  };
  for (const task of tasks) {
    stats[task.status] += 1;
    stats.acceptanceTotal += task.acceptance.length;
    stats.acceptanceDone += task.acceptance.filter((item) => item.done).length;
  }
  return stats;
}

function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isRole(value: unknown): value is Role {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.name === "string" &&
    typeof value.title === "string" &&
    typeof value.mission === "string" &&
    Array.isArray(value.responsibilities) &&
    Array.isArray(value.nonGoals) &&
    Array.isArray(value.decisionRights)
  );
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.title === "string" &&
    typeof value.goal === "string" &&
    isTaskStatus(value.status) &&
    isTaskPriority(value.priority) &&
    Array.isArray(value.acceptance) &&
    Array.isArray(value.evidence)
  );
}

function assertState(value: unknown): asserts value is StudioState {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  if (value.schemaVersion !== STUDIO_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Studio schema version: ${String(value.schemaVersion)}`,
    );
  }
  if (
    !Array.isArray(value.projects) ||
    !Array.isArray(value.roles) ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.events)
  ) {
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

export class StudioStore {
  readonly dataDir: string;
  readonly file: string;
  private readonly now: () => Date;
  private state: StudioState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private warning: string | null = null;

  constructor(options: StudioStoreOptions = {}) {
    this.dataDir = options.dataDir ?? defaultStudioDataDir();
    this.file = path.join(this.dataDir, "studio.json");
    this.now = options.now ?? (() => new Date());
  }

  async init(): Promise<void> {
    await this.runExclusive(async () => {
      await this.load();
    });
  }

  getWarning(): string | null {
    return this.warning;
  }

  async bootstrap(projectId?: string): Promise<BootstrapResponse> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, projectId);
      const roles = project === null
        ? []
        : state.roles.filter((role) => role.projectId === project.id);
      const tasks = project === null
        ? []
        : state.tasks.filter((task) => task.projectId === project.id);
      const events = [...state.events]
        .filter((event) => project === null || event.projectId === project.id)
        .slice(-30)
        .reverse();
      return {
        app: {
          pluginVersion: STUDIO_PLUGIN_VERSION,
          dshVersion: "unknown",
          compatibility: {
            status: "unknown",
            testedWith: "0.2.1-rc.2",
            message: "",
          },
          dataDir: this.dataDir,
          schemaVersion: STUDIO_SCHEMA_VERSION,
          serverTime: nowIso(this.now),
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
          gitMerge: false,
        },
      };
    });
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const at = nowIso(this.now);
      const project: Project = {
        id: newId("proj"),
        name: requiredText(input.name, "name", 80),
        description: optionalText(input.description, "description", 600),
        createdAt: at,
        updatedAt: at,
      };
      state.projects.push(project);
      state.activeProjectId = project.id;
      this.recordEvent(state, {
        type: "project.created",
        at,
        projectId: project.id,
        payload: { name: project.name },
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(project);
    });
  }

  async selectProject(projectId: string): Promise<Project> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      state.activeProjectId = project.id;
      state.updatedAt = nowIso(this.now);
      await this.save();
      return structuredClone(project);
    });
  }

  async createRole(input: CreateRoleInput): Promise<Role> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const at = nowIso(this.now);
      const role: Role = {
        id: newId("role"),
        projectId: project.id,
        name: requiredText(input.name, "name", 60),
        title: optionalText(input.title, "title", 80),
        mission: optionalText(input.mission, "mission", 600),
        responsibilities: textList(input.responsibilities, "responsibilities"),
        nonGoals: textList(input.nonGoals, "nonGoals"),
        decisionRights: textList(input.decisionRights, "decisionRights"),
        createdAt: at,
        updatedAt: at,
      };
      state.roles.push(role);
      this.recordEvent(state, {
        type: "role.created",
        at,
        projectId: project.id,
        payload: { roleId: role.id, name: role.name },
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(role);
    });
  }

  async updateRole(
    roleId: string,
    input: Partial<CreateRoleInput>,
  ): Promise<Role> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const role = state.roles.find((item) => item.id === roleId);
      if (role === undefined) {
        throw new StudioStoreError("role_not_found", "角色不存在", 404);
      }
      if (input.name !== undefined) {
        role.name = requiredText(input.name, "name", 60);
      }
      if (input.title !== undefined) {
        role.title = optionalText(input.title, "title", 80);
      }
      if (input.mission !== undefined) {
        role.mission = optionalText(input.mission, "mission", 600);
      }
      if (input.responsibilities !== undefined) {
        role.responsibilities = textList(
          input.responsibilities,
          "responsibilities",
        );
      }
      if (input.nonGoals !== undefined) {
        role.nonGoals = textList(input.nonGoals, "nonGoals");
      }
      if (input.decisionRights !== undefined) {
        role.decisionRights = textList(input.decisionRights, "decisionRights");
      }
      role.updatedAt = nowIso(this.now);
      state.updatedAt = role.updatedAt;
      this.recordEvent(state, {
        type: "role.updated",
        at: role.updatedAt,
        projectId: role.projectId,
        payload: { roleId: role.id },
      });
      await this.save();
      return structuredClone(role);
    });
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = this.pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const at = nowIso(this.now);
      const ownerRoleId = this.resolveRoleId(
        state,
        project.id,
        input.ownerRoleId,
        "ownerRoleId",
      );
      const reviewerRoleId = this.resolveRoleId(
        state,
        project.id,
        input.reviewerRoleId,
        "reviewerRoleId",
      );
      const task: Task = {
        id: newId("task"),
        projectId: project.id,
        title: requiredText(input.title, "title", 160),
        goal: optionalText(input.goal, "goal", 2000),
        status: "backlog",
        priority: isTaskPriority(input.priority) ? input.priority : "P1",
        ownerRoleId,
        reviewerRoleId,
        acceptance: normalizeAcceptance(input.acceptance ?? []),
        evidence: [],
        branch: optionalText(input.branch, "branch", 160) || null,
        createdAt: at,
        updatedAt: at,
      };
      state.tasks.push(task);
      this.recordEvent(state, {
        type: "task.created",
        at,
        projectId: project.id,
        taskId: task.id,
        payload: { title: task.title, priority: task.priority },
      });
      state.updatedAt = at;
      await this.save();
      return structuredClone(task);
    });
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status === "done") {
        throw new StudioStoreError(
          "task_locked",
          "已完成的任务不能直接修改，请创建一个后续任务",
        );
      }
      const at = nowIso(this.now);
      if (input.title !== undefined) {
        task.title = requiredText(input.title, "title", 160);
      }
      if (input.goal !== undefined) {
        task.goal = optionalText(input.goal, "goal", 2000);
      }
      if (input.priority !== undefined) {
        if (!isTaskPriority(input.priority)) {
          throw new StudioStoreError("invalid_input", "priority 无效");
        }
        task.priority = input.priority;
      }
      if (input.ownerRoleId !== undefined) {
        task.ownerRoleId = this.resolveRoleId(
          state,
          task.projectId,
          input.ownerRoleId,
          "ownerRoleId",
        );
      }
      if (input.reviewerRoleId !== undefined) {
        task.reviewerRoleId = this.resolveRoleId(
          state,
          task.projectId,
          input.reviewerRoleId,
          "reviewerRoleId",
        );
      }
      if (input.acceptance !== undefined) {
        task.acceptance = normalizeAcceptance(input.acceptance, task.acceptance);
      }
      if (input.evidence !== undefined) {
        task.evidence = normalizeEvidence(input.evidence, task.evidence, at);
      }
      if (input.branch !== undefined) {
        task.branch = optionalText(input.branch, "branch", 160) || null;
      }
      task.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "task.updated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { fields: Object.keys(input) },
      });
      await this.save();
      return structuredClone(task);
    });
  }

  async transitionTask(taskId: string, next: TaskStatus): Promise<Task> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = this.findTask(state, taskId);
      if (task.status === next) {
        return structuredClone(task);
      }
      if (!isTaskStatus(next) || !canTransition(task.status, next)) {
        throw new StudioStoreError(
          "invalid_transition",
          `不能从「${task.status}」直接切换到「${String(next)}」`,
          409,
        );
      }
      if (next === "done") {
        if (task.acceptance.length === 0) {
          throw new StudioStoreError(
            "acceptance_required",
            "没有验收标准，不能完成任务",
            409,
          );
        }
        const open = task.acceptance.filter((item) => !item.done);
        if (open.length > 0) {
          throw new StudioStoreError(
            "acceptance_incomplete",
            `还有 ${String(open.length)} 条验收标准未完成`,
            409,
          );
        }
        if (task.evidence.length === 0) {
          throw new StudioStoreError(
            "evidence_required",
            "验收前至少记录一条可复现的证据（命令、测试或 replay）",
            409,
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
        payload: { from, to: next },
      });
      await this.save();
      return structuredClone(task);
    });
  }

  async listTransitions(taskId: string): Promise<TaskStatus[]> {
    return this.runExclusive(async () => {
      const task = this.findTask(this.requireState(), taskId);
      return [...ALLOWED_TRANSITIONS[task.status]];
    });
  }

  private async load(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    if (!existsSync(this.file)) {
      this.state = this.seedState();
      await this.save();
      return;
    }
    const raw = await readFile(this.file, "utf8");
    try {
      const parsed: unknown = JSON.parse(raw);
      assertState(parsed);
      this.state = parsed;
    } catch (error) {
      const backup = `${this.file}.corrupt-${String(Date.now())}`;
      await rename(this.file, backup).catch(() => undefined);
      this.state = this.seedState();
      this.warning = `studio.json 无法读取，已备份到 ${backup} 并重建演示数据：${
        error instanceof Error ? error.message : String(error)
      }`;
      await this.save();
    }
  }

  private async save(): Promise<void> {
    const state = this.requireState();
    state.updatedAt = nowIso(this.now);
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    const temp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temp, serialized, "utf8");
    try {
      await rename(temp, this.file);
    } catch {
      // Windows can refuse to replace a file that another process briefly holds.
      await rm(this.file, { force: true });
      await rename(temp, this.file);
    }
  }

  private requireState(): StudioState {
    if (this.state === null) {
      throw new StudioStoreError(
        "store_not_ready",
        "Studio 数据尚未初始化",
        500,
      );
    }
    return this.state;
  }

  private pickProject(
    state: StudioState,
    projectId: string | undefined,
  ): Project | null {
    if (projectId !== undefined) {
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      return project;
    }
    if (state.activeProjectId !== null) {
      const active = state.projects.find(
        (item) => item.id === state.activeProjectId,
      );
      if (active !== undefined) return active;
    }
    return state.projects[0] ?? null;
  }

  private findTask(state: StudioState, taskId: string): Task {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task === undefined) {
      throw new StudioStoreError("task_not_found", "任务不存在", 404);
    }
    return task;
  }

  private resolveRoleId(
    state: StudioState,
    projectId: string,
    value: string | null | undefined,
    field: string,
  ): string | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") {
      throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
    }
    const role = state.roles.find(
      (item) => item.id === value && item.projectId === projectId,
    );
    if (role === undefined) {
      throw new StudioStoreError(
        "role_not_found",
        `${field} 指向的角色不存在`,
        404,
      );
    }
    return role.id;
  }

  private recordEvent(
    state: StudioState,
    input: {
      type: string;
      at: string;
      projectId: string | null;
      taskId?: string | null;
      payload?: Record<string, unknown>;
    },
  ): void {
    const event: StudioEvent = {
      id: newId("evt"),
      type: input.type,
      at: input.at,
      actor: "human",
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      payload: input.payload ?? {},
    };
    state.events.push(event);
    if (state.events.length > 2000) {
      state.events.splice(0, state.events.length - 2000);
    }
  }

  private runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private seedState(): StudioState {
    const at = nowIso(this.now);
    const project: Project = {
      id: "proj-demo",
      name: "MOBA 垂直切片",
      description:
        "用一条可玩的最小链路验证工作台：任务、角色、验收和状态机。",
      createdAt: at,
      updatedAt: at,
    };
    const role = (
      id: string,
      name: string,
      title: string,
      mission: string,
      responsibilities: string[],
      decisionRights: string[] = [],
    ): Role => ({
      id,
      projectId: project.id,
      name,
      title,
      mission,
      responsibilities,
      nonGoals: [],
      decisionRights,
      createdAt: at,
      updatedAt: at,
    });
    const roles: Role[] = [
      role(
        "role-lead",
        "Lead",
        "制作人 / 调度",
        "把目标变成可执行的任务图，并保持交付节奏。",
        ["拆任务", "派单", "跟踪阻塞", "组织复盘"],
        ["任务优先级", "派单对象"],
      ),
      role(
        "role-architect",
        "Architect",
        "架构师",
        "守住架构完整性与接口契约。",
        ["写 ADR", "定契约", "技术裁决", "评审高风险变更"],
        ["技术方案", "接口契约"],
      ),
      role(
        "role-builder",
        "Builder",
        "Gameplay 工程师",
        "交付可运行的玩法实现和测试。",
        ["实现技能/移动/冷却", "补单测", "维护构建"],
      ),
      role(
        "role-verifier",
        "Verifier",
        "QA / 验收",
        "独立验证产物，守住质量门。",
        ["跑测试", "复现缺陷", "检查验收标准", "记录证据"],
        ["验收结论"],
      ),
    ];
    const acceptance = (
      ...texts: string[]
    ): AcceptanceItem[] =>
      texts.map((text, index) => ({
        id: `acc-demo-${String(index)}-${randomUUID().slice(0, 4)}`,
        text,
        done: false,
      }));
    const task = (
      id: string,
      title: string,
      goal: string,
      status: TaskStatus,
      priority: TaskPriority,
      ownerRoleId: string,
      reviewerRoleId: string,
      items: AcceptanceItem[],
      branch: string | null = null,
    ): Task => ({
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
      updatedAt: at,
    });
    const tasks: Task[] = [
      task(
        "task-001",
        "锁定垂直切片范围",
        "写清楚这一版做什么、不做什么，以及可玩验收。",
        "done",
        "P0",
        "role-lead",
        "role-architect",
        acceptance("范围文档已评审", "非目标清单已确认", "验收口径已对齐").map(
          (item) => ({ ...item, done: true }),
        ),
      ),
      task(
        "task-002",
        "搭建 30Hz 固定 tick 骨架",
        "服务端固定 tick，客户端能稳定消费快照。",
        "review",
        "P0",
        "role-architect",
        "role-verifier",
        acceptance("tick 稳定在 30Hz", "快照可重放", "断线重连不崩溃").map(
          (item, index) => ({ ...item, done: index < 2 }),
        ),
        "task/002-fixed-tick",
      ),
      task(
        "task-003",
        "实现技能冷却与施法前摇",
        "一个英雄的一个技能，包含冷却、前摇和打断。",
        "running",
        "P0",
        "role-builder",
        "role-architect",
        acceptance("冷却按 tick 计算", "前摇可被控制打断", "单测覆盖边界").map(
          (item, index) => ({ ...item, done: index === 0 }),
        ),
        "task/003-ability",
      ),
      task(
        "task-004",
        "建立 replay 与性能基线",
        "每次合并都能跑同一段 replay，并记录帧时间。",
        "ready",
        "P1",
        "role-verifier",
        "role-lead",
        acceptance("replay 可复现", "性能基线有阈值"),
      ),
      task(
        "task-005",
        "首轮 playtest 问题清单",
        "人类实际玩一局，记录手感、可读性和阻断问题。",
        "backlog",
        "P1",
        "role-lead",
        "role-verifier",
        acceptance("至少 1 局完整对局", "问题按阻断/重要/建议分级"),
      ),
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
          payload: { message: "演示项目已创建" },
        },
      ],
    };
  }
}
