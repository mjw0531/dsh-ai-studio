import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ALLOWED_TRANSITIONS,
  MERGE_STATUS_LABELS,
  STUDIO_PLUGIN_VERSION,
  STUDIO_SCHEMA_VERSION,
  canTransition,
  isProjectStage,
  isTaskPriority,
  isTaskStatus,
  nextProjectStage,
} from "../shared/types.js";
import type {
  AcceptanceItem,
  AgentReceipt,
  AgentRun,
  AgentRunStatus,
  BootstrapResponse,
  Branch,
  CompanyBudget,
  CompanyHealth,
  CompanyPriority,
  CompanyProjectSummary,
  RoleCoverage,
  CompanyRisk,
  CompanySummary,
  CompanyTotals,
  ContractChange,
  CreateDecisionInput,
  CreateModuleInput,
  DecideDecisionInput,
  Decision,
  IndependentReview,
  Module,
  UpdateModuleInput,
  CreateMergeProposalInput,
  CreateProjectInput,
  CreateProjectFromTemplateInput,
  CreateRoleInput,
  CreateTaskInput,
  CreateTriggerInput,
  CreateWorkshopInput,
  AddWorkshopNoteInput,
  CreateProviderProfileInput,
  UpdateProviderProfileInput,
  AcceptTriggerInput,
  ApproveStageGateInput,
  EvidenceItem,
  MergeProposal,
  MergeRisk,
  OwnerNeed,
  Project,
  ProjectStage,
  CreatePrototypeDemoInput,
  PrototypeDemo,
  PrototypeDemoResult,
  UpdatePrototypeDemoInput,
  ProviderProfile,
  ProviderProfileHealth,
  Role,
  RoleLoadSummary,
  StageArtifact,
  StageArtifactKind,
  StageCheckItem,
  StageGate,
  StudioEvent,
  StudioState,
  StudioStats,
  Task,
  TaskPriority,
  TaskStatus,
  Thread,
  Trigger,
  TriggerRules,
  TriggerSource,
  TriggerStatus,
  UpdateTriggerRulesInput,
  WebhookIngestResult,
  Workshop,
  WorkshopAiSummary,
  WorkshopNote,
  WorkshopStatus,
  UpdateProjectInput,
  UpdateStageGateInput,
  UpdateTaskInput,
  Verification,
} from "../shared/types.js";
import { migrateState } from "./store/migration.js";
import {
  assertState,
  isMergeRisk,
  isPrototypeDemoResult,
  isStageArtifactKind,
  isTriggerSource,
} from "./store/validation.js";
import {
  buildCompany,
  buildProviderHealth,
  statsFor,
} from "./store/read-model.js";

import { StudioStoreError } from "./store/errors.js";
export { StudioStoreError } from "./store/errors.js";
import { createSeedState } from "./store/seed.js";
import { projectTemplates } from "./store/templates.js";
import {
  findMergeProposal,
  findProject,
  findProviderProfile,
  findStageGate,
  findTask,
  findTrigger,
  findWorkshop,
  pickProject,
  resolveRoleId,
} from "./store/lookups.js";
import type { StoreContext } from "./store/context.js";
import {
  createProviderProfile as createProviderProfileImpl,
  deleteProviderProfile as deleteProviderProfileImpl,
  getProviderProfile as getProviderProfileImpl,
  getRoleProvider as getRoleProviderImpl,
  reassignProviderProfile as reassignProviderProfileImpl,
  updateProviderProfile as updateProviderProfileImpl,
} from "./store/providers.js";
import {
  approveMergeProposal as approveMergeProposalImpl,
  completeMergeProposal as completeMergeProposalImpl,
  createMergeProposal as createMergeProposalImpl,
  getMergeContext as getMergeContextImpl,
  recordRollback as recordRollbackImpl,
  rejectMergeProposal as rejectMergeProposalImpl,
  setMergePostVerification as setMergePostVerificationImpl,
} from "./store/merge.js";
import {
  acceptTrigger as acceptTriggerImpl,
  getTriggerRules as getTriggerRulesImpl,
  ignoreTrigger as ignoreTriggerImpl,
  ingestTrigger as ingestTriggerImpl,
  ingestWebhook as ingestWebhookImpl,
  updateTriggerRules as updateTriggerRulesImpl,
} from "./store/triggers.js";
import {
  defaultStageChecklist,
  defaultTriggerRules,
  isRecord,
  normalizeAcceptance,
  normalizeEvidence,
  normalizeStageArtifacts,
  normalizeStageChecklist,
  normalizeWebhookPayload,
  optionalText,
  optionalTokenBudget,
  requiredText,
  textList,
} from "./store/inputs.js";

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

export class StudioStore {
  readonly dataDir: string;
  readonly file: string;
  private readonly now: () => Date;
  private state: StudioState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private warning: string | null = null;
  private readonly context: StoreContext;

  constructor(options: StudioStoreOptions = {}) {
    this.dataDir = options.dataDir ?? defaultStudioDataDir();
    this.file = path.join(this.dataDir, "studio.json");
    this.now = options.now ?? (() => new Date());
    this.context = {
      runExclusive: (work) => this.runExclusive(work),
      requireState: () => this.requireState(),
      save: () => this.save(),
      recordEvent: (state, input) => this.recordEvent(state, input),
      now: () => nowIso(this.now),
    };
  }

  async init(): Promise<void> {
    await this.runExclusive(async () => {
      await this.load();
    });
  }

  getWarning(): string | null {
    return this.warning;
  }

  async exportState(): Promise<StudioState> {
    return this.runExclusive(async () => {
      return structuredClone(this.requireState());
    });
  }

  async updateCompanyName(name: string): Promise<StudioState> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const value = requiredText(name, "companyName", 80);
      const at = nowIso(this.now);
      state.companyName = value;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "settings.updated",
        at,
        projectId: null,
        taskId: null,
        payload: { companyName: value },
      });
      await this.save();
      return structuredClone(state);
    });
  }

  async importState(raw: unknown): Promise<StudioState> {
    return this.runExclusive(async () => {
      if (!isRecord(raw)) {
        throw new StudioStoreError(
          "invalid_import",
          "导入文件必须是 Studio 导出的 JSON 对象",
          400,
        );
      }
      if (
        typeof raw.schemaVersion !== "number" ||
        raw.schemaVersion > STUDIO_SCHEMA_VERSION
      ) {
        throw new StudioStoreError(
          "unsupported_schema",
          `导入文件的 schemaVersion 必须 <= ${String(STUDIO_SCHEMA_VERSION)}`,
          400,
        );
      }
      let candidate: StudioState;
      try {
        candidate = migrateState(raw as unknown as StudioState);
        assertState(candidate);
      } catch (error) {
        throw new StudioStoreError(
          "invalid_import",
          `导入文件校验失败：${
            error instanceof Error ? error.message : String(error)
          }`,
          400,
        );
      }
      const backup = `${this.file}.pre-import-${String(Date.now())}`;
      if (existsSync(this.file)) {
        await copyFile(this.file, backup);
      }
      this.state = structuredClone(candidate);
      this.warning = `已导入数据；原文件备份到 ${backup}`;
      await this.save();
      return structuredClone(this.requireState());
    });
  }

  async bootstrap(projectId?: string): Promise<BootstrapResponse> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = pickProject(state, projectId);
      const stageGates = project === null
        ? []
        : state.stageGates.filter((gate) => gate.projectId === project.id);
      const triggers = project === null
        ? []
        : state.triggers
            .filter((trigger) => trigger.projectId === project.id)
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            );
      const threads = project === null
        ? []
        : state.threads.filter((thread) => thread.projectId === project.id);
      const workshops = project === null
        ? []
        : state.workshops
            .filter((workshop) => workshop.projectId === project.id)
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            );
      const providerProfiles = project === null
        ? []
        : state.providerProfiles.filter(
            (profile) => profile.projectId === project.id,
          );
      const providerHealth =
        project === null ? [] : buildProviderHealth(state, project.id);
      const prototypeDemos =
        project === null
          ? []
          : state.prototypeDemos
              .filter((demo) => demo.projectId === project.id)
              .sort((left, right) =>
                right.createdAt.localeCompare(left.createdAt),
              );
      const roles = project === null
        ? []
        : state.roles.filter((role) => role.projectId === project.id);
      const modules = project === null
        ? []
        : state.modules.filter((module) => module.projectId === project.id);
      const tasks = project === null
        ? []
        : state.tasks.filter((task) => task.projectId === project.id);
      const mergeProposals = project === null
        ? []
        : state.mergeProposals.filter(
            (proposal) => proposal.projectId === project.id,
          );
      const runs = project === null
        ? []
        : state.runs
            .filter((run) => run.projectId === project.id)
            .sort((left, right) =>
              right.startedAt.localeCompare(left.startedAt),
            );
      const branches = project === null
        ? []
        : state.branches
            .filter((branch) => branch.projectId === project.id)
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            );
      const contractChanges = project === null
        ? []
        : state.contractChanges.filter(
            (change) => change.projectId === project.id,
          );
      const verifications = project === null
        ? []
        : state.verifications
            .filter((verification) => verification.projectId === project.id)
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            );
      const reviews = project === null
        ? []
        : state.reviews
            .filter((review) => review.projectId === project.id)
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            );
      const decisions = project === null
        ? []
        : state.decisions
            .filter((decision) => decision.projectId === project.id)
            .sort((left, right) => {
              if (left.status !== right.status) {
                if (left.status === "pending") return -1;
                if (right.status === "pending") return 1;
              }
              return right.createdAt.localeCompare(left.createdAt);
            });
      const events = [...state.events]
        .filter((event) => project === null || event.projectId === project.id)
        .slice(-30)
        .reverse();
      const now = this.now();
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
          serverTime: now.toISOString(),
        },
        projects: [...state.projects],
        activeProjectId: state.activeProjectId,
        project,
        stageGates,
        triggers,
        threads,
        workshops,
        providerProfiles,
        providerHealth,
        prototypeDemos,
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
          gitMerge: false,
          stageGate: true,
          triggerInbox: true,
          triggerWebhook: true,
          workshop: true,
          providerProfiles: true,
          providerHealth: true,
          prototypeDemoRecord: true,
          projectTemplates: true,
          onboarding: true,
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
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        repoPath: optionalText(input.repoPath, "repoPath", 1000) || null,
        prdPath: null,
        invariantsPath: null,
        modulesPath: null,
        triggerRules: defaultTriggerRules(),
        stage: "discovery",
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

  async createProjectFromTemplate(
    input: CreateProjectFromTemplateInput,
  ): Promise<Project> {
    const template = projectTemplates[input.template];
    if (template === undefined) {
      throw new StudioStoreError(
        "invalid_input",
        "未知的项目模板",
      );
    }
    const project = await this.createProject({
      name: input.name,
      description: input.description,
      repoPath: input.repoPath,
    });
    const roles = new Map<string, Role>();
    for (const spec of template.roles) {
      const role = await this.createRole({
        name: spec.name,
        title: spec.title,
        mission: spec.mission,
        responsibilities: spec.responsibilities,
        decisionRights: spec.decisionRights,
      });
      roles.set(spec.name, role);
    }
    for (const spec of template.tasks) {
      const owner = roles.get(spec.owner);
      const reviewer = roles.get(spec.reviewer);
      await this.createTask({
        title: spec.title,
        goal: spec.goal,
        priority: spec.priority,
        ownerRoleId: owner?.id ?? null,
        reviewerRoleId: reviewer?.id ?? null,
        acceptance: spec.acceptance,
      });
    }
    return project;
  }

  async updateProject(
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      if (input.repoPath !== undefined) {
        project.repoPath =
          optionalText(input.repoPath, "repoPath", 1000) || null;
      }
      if (input.prdPath !== undefined) {
        project.prdPath =
          optionalText(input.prdPath, "prdPath", 500) || null;
      }
      if (input.invariantsPath !== undefined) {
        project.invariantsPath =
          optionalText(input.invariantsPath, "invariantsPath", 500) || null;
      }
      if (input.modulesPath !== undefined) {
        project.modulesPath =
          optionalText(input.modulesPath, "modulesPath", 500) || null;
      }
      const at = nowIso(this.now);
      project.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "project.updated",
        at,
        projectId: project.id,
        payload: { repoPath: project.repoPath },
      });
      await this.save();
      return structuredClone(project);
    });
  }

  async getStageGate(
    projectId: string,
    stage: ProjectStage,
  ): Promise<StageGate> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = findProject(state, projectId);
      const next = nextProjectStage(project.stage);
      if (next === null) {
        throw new StudioStoreError(
          "stage_complete",
          "项目已经进入持续开发，没有下一阶段门禁",
          409,
        );
      }
      if (stage !== next) {
        throw new StudioStoreError(
          "stage_gate_out_of_order",
          `下一阶段是 ${next}，不能创建 ${stage} 门禁`,
          409,
        );
      }
      let gate = state.stageGates.find(
        (item) => item.projectId === projectId && item.stage === stage,
      );
      if (gate === undefined) {
        const at = nowIso(this.now);
        gate = {
          id: newId("gate"),
          projectId,
          stage,
          status: "pending",
          checklist: defaultStageChecklist(stage),
          artifacts: [],
          note: "",
          decisionId: null,
          approvedBy: "",
          approvedAt: null,
          waiverReason: null,
          createdAt: at,
          updatedAt: at,
        };
        state.stageGates.push(gate);
        state.updatedAt = at;
        await this.save();
      }
      return structuredClone(gate);
    });
  }

  async updateStageGate(
    projectId: string,
    stage: ProjectStage,
    input: UpdateStageGateInput,
  ): Promise<StageGate> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = findProject(state, projectId);
      const gate = findStageGate(state, project, stage);
      if (gate.status === "approved") {
        throw new StudioStoreError(
          "stage_gate_locked",
          "阶段门禁已经批准，不能再修改",
          409,
        );
      }
      if (input.checklist !== undefined) {
        gate.checklist = normalizeStageChecklist(input.checklist);
      }
      if (input.artifacts !== undefined) {
        gate.artifacts = normalizeStageArtifacts(input.artifacts);
      }
      if (input.note !== undefined) {
        gate.note = optionalText(input.note, "note", 4000);
      }
      gate.status = "pending";
      gate.approvedBy = "";
      gate.approvedAt = null;
      gate.waiverReason = null;
      gate.updatedAt = nowIso(this.now);
      state.updatedAt = gate.updatedAt;
      await this.save();
      return structuredClone(gate);
    });
  }

  async approveStageGate(
    projectId: string,
    stage: ProjectStage,
    input: ApproveStageGateInput = {},
  ): Promise<StageGate> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = findProject(state, projectId);
      const gate = findStageGate(state, project, stage);
      if (gate.status === "approved") {
        throw new StudioStoreError(
          "stage_gate_locked",
          "阶段门禁已经批准",
          409,
        );
      }
      if (input.checklist !== undefined) {
        gate.checklist = normalizeStageChecklist(input.checklist);
      }
      if (input.artifacts !== undefined) {
        gate.artifacts = normalizeStageArtifacts(input.artifacts);
      }
      if (input.note !== undefined) {
        gate.note = optionalText(input.note, "note", 4000);
      }
      const waiverReason = optionalText(
        input.waiverReason,
        "waiverReason",
        1000,
      );
      const missingDemo =
        stage === "development" &&
        !gate.artifacts.some((artifact) => artifact.kind === "demo") &&
        !state.prototypeDemos.some(
          (demo) =>
            demo.projectId === projectId && demo.result === "passed",
        );
      const incomplete =
        gate.checklist.length === 0 ||
        gate.checklist.some((item) => !item.done) ||
        gate.artifacts.length === 0;
      if ((incomplete || missingDemo) && waiverReason === "") {
        if (missingDemo && !incomplete) {
          throw new StudioStoreError(
            "prototype_demo_required",
            "进入持续开发前必须登记一个 demo 产物（路径或 URL），或填写 Owner 豁免理由",
            409,
          );
        }
        throw new StudioStoreError(
          "stage_gate_not_ready",
          "阶段门禁未完成：请完成所有检查项并至少登记一个产物，或填写 Owner 豁免理由",
          409,
        );
      }
      const at = nowIso(this.now);
      gate.status = "approved";
      gate.approvedBy = "Owner";
      gate.approvedAt = at;
      gate.waiverReason =
        (incomplete || missingDemo) && waiverReason !== ""
          ? waiverReason
          : null;
      gate.updatedAt = at;
      project.stage = stage;
      project.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "stage.approved",
        at,
        projectId,
        payload: {
          stage,
          waiver: gate.waiverReason !== null,
        },
      });
      await this.save();
      return structuredClone(gate);
    });
  }

  async rejectStageGate(
    projectId: string,
    stage: ProjectStage,
    note: string,
  ): Promise<StageGate> {
    return this.runExclusive(async () => {
      if (note.trim() === "") {
        throw new StudioStoreError(
          "decision_reason_required",
          "拒绝阶段门禁必须写明理由",
          400,
        );
      }
      const reason = requiredText(note, "note", 4000);
      const state = this.requireState();
      const project = findProject(state, projectId);
      const gate = findStageGate(state, project, stage);
      if (gate.status === "approved") {
        throw new StudioStoreError(
          "stage_gate_locked",
          "阶段门禁已经批准，不能再拒绝",
          409,
        );
      }
      const at = nowIso(this.now);
      gate.status = "rejected";
      gate.note = reason;
      gate.approvedBy = "";
      gate.approvedAt = null;
      gate.waiverReason = null;
      gate.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "stage.rejected",
        at,
        projectId,
        payload: { stage, note: reason },
      });
      await this.save();
      return structuredClone(gate);
    });
  }

  async ingestTrigger(input: CreateTriggerInput): Promise<Trigger> {
    return ingestTriggerImpl(this.context, input);
  }

  async getTriggerRules(projectId: string): Promise<TriggerRules> {
    return getTriggerRulesImpl(this.context, projectId);
  }

  async updateTriggerRules(
    projectId: string,
    input: UpdateTriggerRulesInput,
  ): Promise<TriggerRules> {
    return updateTriggerRulesImpl(this.context, projectId, input);
  }

  async ingestWebhook(
    projectId: string,
    source: TriggerSource,
    payload: Record<string, unknown>,
  ): Promise<WebhookIngestResult> {
    return ingestWebhookImpl(this.context, projectId, source, payload);
  }

  async acceptTrigger(
    triggerId: string,
    input: AcceptTriggerInput = {},
  ): Promise<{ trigger: Trigger; task: Task }> {
    return acceptTriggerImpl(this.context, triggerId, input);
  }

  async ignoreTrigger(triggerId: string, note = ""): Promise<Trigger> {
    return ignoreTriggerImpl(this.context, triggerId, note);
  }

  async getWorkshopContext(workshopId: string): Promise<{
    workshop: Workshop;
    project: Project;
    roles: Role[];
    providerProfiles: ProviderProfile[];
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
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

  async createPrototypeDemo(
    input: CreatePrototypeDemoInput,
    projectId?: string,
  ): Promise<PrototypeDemo> {
    return this.runExclusive(async () => {
      const state = this.requireState();
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
      const at = nowIso(this.now);
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
      this.recordEvent(state, {
        type: "prototype.demo_recorded",
        at,
        projectId: project.id,
        payload: { demoId: demo.id, result: demo.result },
      });
      await this.save();
      return structuredClone(demo);
    });
  }

  async updatePrototypeDemo(
    demoId: string,
    input: UpdatePrototypeDemoInput,
  ): Promise<PrototypeDemo> {
    return this.runExclusive(async () => {
      const state = this.requireState();
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
      demo.updatedAt = nowIso(this.now);
      state.updatedAt = demo.updatedAt;
      this.recordEvent(state, {
        type: "prototype.demo_updated",
        at: demo.updatedAt,
        projectId: demo.projectId,
        payload: { demoId: demo.id, result: demo.result },
      });
      await this.save();
      return structuredClone(demo);
    });
  }

  async createWorkshop(input: CreateWorkshopInput): Promise<Workshop> {
    return this.runExclusive(async () => {
      const state = this.requireState();
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
      const at = nowIso(this.now);
      const workshop: Workshop = {
        id: newId("workshop"),
        projectId: project.id,
        title: requiredText(input.title, "title", 200),
        topic: optionalText(input.topic, "topic", 4000),
        stage: isProjectStage(input.stage) ? input.stage : project.stage,
        status: "collecting",
        participantRoleIds: participants,
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
      this.recordEvent(state, {
        type: "workshop.created",
        at,
        projectId: project.id,
        payload: { workshopId: workshop.id, participants },
      });
      await this.save();
      return structuredClone(workshop);
    });
  }

  async addWorkshopNote(
    workshopId: string,
    input: AddWorkshopNoteInput,
  ): Promise<Workshop> {
    return this.runExclusive(async () => {
      const state = this.requireState();
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
      const at = nowIso(this.now);
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
      this.recordEvent(state, {
        type: "workshop.note",
        at,
        projectId: workshop.projectId,
        payload: { workshopId, roleId },
      });
      await this.save();
      return structuredClone(workshop);
    });
  }

  async setWorkshopAiSummary(
    workshopId: string,
    summary: WorkshopAiSummary,
  ): Promise<Workshop> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const workshop = findWorkshop(state, workshopId);
      if (workshop.notes.length === 0) {
        throw new StudioStoreError(
          "workshop_empty",
          "至少需要一条参与者意见才能生成汇总",
          409,
        );
      }
      const at = nowIso(this.now);
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
      this.recordEvent(state, {
        type: "workshop.ai_summary",
        at,
        projectId: workshop.projectId,
        payload: { workshopId },
      });
      await this.save();
      return structuredClone(workshop);
    });
  }

  async synthesizeWorkshop(
    workshopId: string,
    synthesis: string,
  ): Promise<Workshop> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const workshop = findWorkshop(state, workshopId);
      if (workshop.notes.length === 0) {
        throw new StudioStoreError(
          "workshop_empty",
          "至少需要一条参与者意见才能汇总",
          409,
        );
      }
      const at = nowIso(this.now);
      workshop.synthesis = requiredText(synthesis, "synthesis", 12000);
      workshop.status = "synthesized";
      workshop.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "workshop.synthesized",
        at,
        projectId: workshop.projectId,
        payload: { workshopId },
      });
      await this.save();
      return structuredClone(workshop);
    });
  }

  async decideWorkshop(
    workshopId: string,
    decision: string,
  ): Promise<Workshop> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const workshop = findWorkshop(state, workshopId);
      if (workshop.synthesis.trim() === "") {
        throw new StudioStoreError(
          "workshop_synthesis_required",
          "先汇总参与者意见，再记录 Owner 决策",
          409,
        );
      }
      const at = nowIso(this.now);
      workshop.decision = requiredText(decision, "decision", 12000);
      workshop.status = "decided";
      workshop.decidedBy = "Owner";
      workshop.decidedAt = at;
      workshop.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "workshop.decided",
        at,
        projectId: workshop.projectId,
        payload: { workshopId },
      });
      await this.save();
      return structuredClone(workshop);
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

  async getDispatchContext(taskId: string): Promise<{
    task: Task;
    role: Role;
    project: Project;
    module: Module | null;
    providerProfile: ProviderProfile | null;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = findTask(state, taskId);
      if (
        task.kind === "fix" &&
        !task.integration &&
        (task.diagnosis.trim() === "" || task.plan.trim() === "")
      ) {
        throw new StudioStoreError(
          "plan_required",
          "改修票必须有诊断和修改计划，才能派单",
          409,
        );
      }
      if (task.ownerRoleId === null) {
        throw new StudioStoreError(
          "owner_required",
          "任务没有负责人角色，不能派单",
          409,
        );
      }
      const role = state.roles.find((item) => item.id === task.ownerRoleId);
      const project = state.projects.find(
        (item) => item.id === task.projectId,
      );
      if (role === undefined || project === undefined) {
        throw new StudioStoreError(
          "context_not_found",
          "任务的负责人角色或项目不存在",
          404,
        );
      }
      if (project.repoPath !== null && project.stage !== "development") {
        throw new StudioStoreError(
          "stage_gate_required",
          "项目尚未通过阶段门禁；完成架构/Demo 确认并进入持续开发后才能派单",
          409,
        );
      }
      const module =
        task.module === null
          ? undefined
          : state.modules.find(
              (item) =>
                item.projectId === task.projectId &&
                item.name === task.module,
            );
      const providerProfile =
        role.providerProfileId === null
          ? null
          : (state.providerProfiles.find(
              (profile) =>
                profile.id === role.providerProfileId &&
                profile.projectId === project.id,
            ) ?? null);
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        module: module === undefined ? null : structuredClone(module),
        providerProfile:
          providerProfile === null ? null : structuredClone(providerProfile),
      };
    });
  }

  async getReviewContext(taskId: string): Promise<{
    task: Task;
    role: Role;
    project: Project;
    run: AgentRun | null;
    verification: Verification | null;
    providerProfile: ProviderProfile | null;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = findTask(state, taskId);
      if (task.reviewerRoleId === null) {
        throw new StudioStoreError(
          "reviewer_required",
          "任务没有验收人角色，不能独立评审",
          409,
        );
      }
      const role = state.roles.find(
        (item) => item.id === task.reviewerRoleId,
      );
      const project = state.projects.find(
        (item) => item.id === task.projectId,
      );
      if (role === undefined || project === undefined) {
        throw new StudioStoreError(
          "context_not_found",
          "验收人角色或项目不存在",
          404,
        );
      }
      const run = [...state.runs]
        .filter(
          (item) =>
            item.taskId === taskId && item.workspacePath !== null,
        )
        .sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        )[0];
      const verification = [...state.verifications]
        .filter((item) => item.taskId === taskId)
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        )[0];
      const providerProfile =
        role.providerProfileId === null
          ? null
          : (state.providerProfiles.find(
              (profile) =>
                profile.id === role.providerProfileId &&
                profile.projectId === project.id,
            ) ?? null);
      return {
        task: structuredClone(task),
        role: structuredClone(role),
        project: structuredClone(project),
        run: run === undefined ? null : structuredClone(run),
        verification:
          verification === undefined
            ? null
            : structuredClone(verification),
        providerProfile:
          providerProfile === null ? null : structuredClone(providerProfile),
      };
    });
  }

  async recordReview(
    taskId: string,
    input: {
      reviewerRoleId: string;
      model: string;
      verdict: "pass" | "fail";
      summary: string;
      findings: string[];
      tokens: number | null;
      runId?: string | null;
    },
  ): Promise<IndependentReview> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = findTask(state, taskId);
      const at = nowIso(this.now);
      const review: IndependentReview = {
        id: newId("review"),
        projectId: task.projectId,
        taskId,
        runId: input.runId ?? null,
        reviewerRoleId: input.reviewerRoleId,
        model: input.model,
        verdict: input.verdict,
        summary: requiredText(input.summary, "summary", 2000),
        findings: textList(input.findings, "findings", 30),
        tokens: input.tokens,
        createdAt: at,
      };
      state.reviews.push(review);
      if (review.verdict === "pass") {
        const text = `独立评审通过（${input.model}）：${review.summary}`;
        if (!task.evidence.some((item) => item.text === text)) {
          task.evidence.push({ id: newId("ev"), text, createdAt: at });
        }
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type:
          review.verdict === "pass"
            ? "review.passed"
            : "review.failed",
        at,
        projectId: task.projectId,
        taskId,
        payload: { reviewId: review.id, model: review.model },
      });
      await this.save();
      return structuredClone(review);
    });
  }

  async getTaskVerificationContext(taskId: string): Promise<{
    task: Task;
    run: AgentRun | null;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = findTask(state, taskId);
      const run = [...state.runs]
        .filter(
          (item) =>
            item.taskId === taskId && item.workspacePath !== null,
        )
        .sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        )[0];
      return {
        task: structuredClone(task),
        run: run === undefined ? null : structuredClone(run),
      };
    });
  }

  async beginRun(
    taskId: string,
    prompt: string,
    workspace?: { path: string; branch: string },
    execution?: {
      providerProfileId: string | null;
      executor: AgentRun["executor"];
      provider: string | null;
      model: string | null;
    },
  ): Promise<AgentRun> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = findTask(state, taskId);
      if (task.status !== "backlog" && task.status !== "ready") {
        throw new StudioStoreError(
          "task_not_dispatchable",
          "只有待规划或可开始的任务可以派单",
          409,
        );
      }
      if (task.ownerRoleId === null) {
        throw new StudioStoreError(
          "owner_required",
          "任务没有负责人角色，不能派单",
          409,
        );
      }
      const role = state.roles.find((item) => item.id === task.ownerRoleId);
      const project = state.projects.find(
        (item) => item.id === task.projectId,
      );
      if (role === undefined || project === undefined) {
        throw new StudioStoreError(
          "context_not_found",
          "任务的负责人角色或项目不存在",
          404,
        );
      }

      const projectSpent = state.runs
        .filter((run) => run.projectId === project.id)
        .reduce((sum, run) => sum + (run.tokens ?? 0), 0);
      if (
        project.tokenBudget !== null &&
        projectSpent >= project.tokenBudget
      ) {
        throw new StudioStoreError(
          "budget_exceeded",
          `项目 token 预算已用尽（${String(projectSpent)} / ${String(
            project.tokenBudget,
          )}）`,
          409,
        );
      }
      const roleSpent = state.runs
        .filter((run) => run.roleId === role.id)
        .reduce((sum, run) => sum + (run.tokens ?? 0), 0);
      if (role.tokenBudget !== null && roleSpent >= role.tokenBudget) {
        throw new StudioStoreError(
          "budget_exceeded",
          `角色 token 预算已用尽（${String(roleSpent)} / ${String(
            role.tokenBudget,
          )}）`,
          409,
        );
      }
      const today = nowIso(this.now).slice(0, 10);
      const dailySpent = state.runs
        .filter(
          (run) =>
            run.roleId === role.id && run.startedAt.slice(0, 10) === today,
        )
        .reduce((sum, run) => sum + (run.tokens ?? 0), 0);
      if (
        role.dailyTokenBudget !== null &&
        dailySpent >= role.dailyTokenBudget
      ) {
        throw new StudioStoreError(
          "budget_exceeded",
          `角色今日 token 预算已用尽（${String(dailySpent)} / ${String(
            role.dailyTokenBudget,
          )}）`,
          409,
        );
      }

      const at = nowIso(this.now);
      if (workspace !== undefined) {
        task.branch = workspace.branch;
      }
      const branch = this.ensureBranch(state, task, at);
      const run: AgentRun = {
        id: newId("run"),
        projectId: task.projectId,
        taskId: task.id,
        roleId: role.id,
        providerProfileId:
          execution?.providerProfileId ?? role.providerProfileId,
        executor: execution?.executor ?? role.executor ?? "dsh",
        provider: execution?.provider ?? null,
        branchId: branch.id,
        branchName: workspace?.branch ?? null,
        workspacePath: workspace?.path ?? null,
        diffStat: null,
        sessionId: null,
        status: "queued",
        model: execution?.model ?? role.model,
        prompt,
        output: "",
        receipt: null,
        tokens: null,
        budgetWarning: null,
        error: null,
        startedAt: at,
        endedAt: null,
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
          model: role.model,
        },
      });
      await this.save();
      return structuredClone(run);
    });
  }

  async attachRunSession(
    runId: string,
    sessionId: string,
    model?: string,
  ): Promise<void> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) return;
      run.sessionId = sessionId;
      if (model !== undefined) run.model = model;
      run.status = "running";
      await this.save();
    });
  }

  async completeRun(
    runId: string,
    input: {
      output: string;
      receipt: AgentReceipt | null;
      tokens: number | null;
      diffStat?: string | null;
    },
  ): Promise<AgentRun> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) {
        throw new StudioStoreError("run_not_found", "Agent Run 不存在", 404);
      }
      const at = nowIso(this.now);
      const task = state.tasks.find((item) => item.id === run.taskId);
      const project = state.projects.find(
        (item) => item.id === run.projectId,
      );
      const role = state.roles.find((item) => item.id === run.roleId);
      const receiptComplete =
        input.receipt !== null &&
        typeof input.receipt.summary === "string" &&
        input.receipt.summary.trim() !== "" &&
        Array.isArray(input.receipt.evidence) &&
        input.receipt.evidence.length > 0;
      if (!receiptComplete) {
        run.status = "failed";
        run.output = input.output.slice(0, 30000);
        run.receipt = input.receipt;
        run.tokens = input.tokens;
        run.error =
          "回执不完整：必须包含非空 summary 和至少一条 evidence，任务不能进入 review";
        run.endedAt = at;
        if (task !== undefined && task.status === "running") {
          task.status = "ready";
          task.updatedAt = at;
        }
        if (task !== undefined) {
          this.escalateRepeatedFailure(
            state,
            task,
            at,
            run.error,
            run,
          );
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
            tokens: run.tokens,
          },
        });
        await this.save();
        return structuredClone(run);
      }
      const spentProject = state.runs
        .filter(
          (item) =>
            item.projectId === run.projectId && item.id !== run.id,
        )
        .reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const spentRole = state.runs
        .filter(
          (item) => item.roleId === run.roleId && item.id !== run.id,
        )
        .reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      const warnings: string[] = [];
      if (
        project !== undefined &&
        project.tokenBudget !== null &&
        input.tokens !== null &&
        spentProject + input.tokens > project.tokenBudget
      ) {
        warnings.push(
          `项目 token 预算超出：${String(spentProject + input.tokens)} / ${String(
            project.tokenBudget,
          )}`,
        );
      }
      if (
        role !== undefined &&
        role.tokenBudget !== null &&
        input.tokens !== null &&
        spentRole + input.tokens > role.tokenBudget
      ) {
        warnings.push(
          `角色 token 预算超出：${String(spentRole + input.tokens)} / ${String(
            role.tokenBudget,
          )}`,
        );
      }
      run.status = "succeeded";
      run.output = input.output.slice(0, 30000);
      run.receipt = input.receipt;
      run.tokens = input.tokens;
      run.diffStat = input.diffStat ?? null;
      run.budgetWarning = warnings.length === 0 ? null : warnings.join("；");
      run.endedAt = at;
      if (task !== undefined) {
        if (input.receipt !== null) {
          const existing = new Set(task.evidence.map((item) => item.text));
          for (const text of input.receipt.evidence.slice(0, 10)) {
            if (existing.has(text)) continue;
            task.evidence.push({
              id: newId("ev"),
              text,
              createdAt: at,
            });
          }
          if (task.status === "running") task.status = "review";
        }
        task.updatedAt = at;
      }
      if (input.receipt !== null) {
        let branch =
          run.branchId === null
            ? undefined
            : state.branches.find((item) => item.id === run.branchId);
        if (branch === undefined && task !== undefined) {
          branch = this.ensureBranch(state, task, at);
          run.branchId = branch.id;
        }
        if (branch !== undefined) {
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
              (item) =>
                item.projectId === run.projectId &&
                item.contract === contract &&
                item.branchId !== branch.id &&
                item.change !== change,
            );
            if (
              !state.contractChanges.some(
                (item) =>
                  item.branchId === branch.id &&
                  item.contract === contract &&
                  item.change === change,
              )
            ) {
              state.contractChanges.push({
                id: newId("contract"),
                projectId: run.projectId,
                branchId: branch.id,
                taskId: run.taskId,
                runId: run.id,
                contract,
                change,
                createdAt: at,
              });
              this.recordEvent(state, {
                type: "contract.changed",
                at,
                projectId: run.projectId,
                taskId: run.taskId,
                payload: {
                  branchId: branch.id,
                  contract,
                  change,
                  runId: run.id,
                },
              });
            }
            if (conflict === undefined) continue;
            const title = `契约冲突：${contract.slice(0, 160)}`;
            if (
              state.decisions.some(
                (item) => item.runId === run.id && item.title === title,
              )
            ) {
              continue;
            }
            const otherBranch = state.branches.find(
              (item) => item.id === conflict.branchId,
            );
            const decision: Decision = {
              id: newId("dec"),
              projectId: run.projectId,
              taskId: run.taskId,
              runId: run.id,
              title,
              context: `${branch.name}: ${change}\n${
                otherBranch?.name ?? conflict.branchId
              }: ${conflict.change}`,
              options: [
                {
                  label: `采用 ${branch.name} 的变更`,
                  tradeoff: change,
                },
                {
                  label: `采用 ${otherBranch?.name ?? "另一支线"} 的变更`,
                  tradeoff: conflict.change,
                },
              ],
              recommendation:
                "同一契约出现两条不同变更。请由 Owner/Architect 裁决；在裁决前不要合并任意一条支线。",
              reversible: true,
              adrDraft: null,
              adrPath: null,
              status: "pending",
              decision: "",
              note: "",
              decidedBy: "",
              tokenCost: input.tokens,
              createdAt: at,
              decidedAt: null,
            };
            state.decisions.push(decision);
            this.recordEvent(state, {
              type: "decision.escalated",
              at,
              projectId: run.projectId,
              taskId: run.taskId,
              payload: {
                decisionId: decision.id,
                contract,
                branchId: branch.id,
                otherBranchId: conflict.branchId,
                runId: run.id,
              },
            });
          }
        }
      }
      if (input.receipt !== null) {
        for (const proposed of input.receipt.decisions) {
          if (proposed.scope !== "project") continue;
          if (
            state.decisions.some(
              (item) =>
                item.runId === run.id && item.title === proposed.title,
            )
          ) {
            continue;
          }
          const decision: Decision = {
            id: newId("dec"),
            projectId: run.projectId,
            taskId: run.taskId,
            runId: run.id,
            title: proposed.title,
            context: proposed.rationale,
            options: [],
            recommendation: proposed.rationale,
            reversible: true,
            adrDraft: null,
            adrPath: null,
            status: "pending",
            decision: "",
            note: "",
            decidedBy: "",
            tokenCost: input.tokens,
            createdAt: at,
            decidedAt: null,
          };
          state.decisions.push(decision);
          this.recordEvent(state, {
            type: "decision.proposed",
            at,
            projectId: run.projectId,
            taskId: run.taskId,
            payload: {
              decisionId: decision.id,
              runId: run.id,
              title: decision.title,
            },
          });
        }
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
          budgetWarning: run.budgetWarning,
        },
      });
      await this.save();
      return structuredClone(run);
    });
  }

  async failRun(runId: string, error: string): Promise<AgentRun> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const run = state.runs.find((item) => item.id === runId);
      if (run === undefined) {
        throw new StudioStoreError("run_not_found", "Agent Run 不存在", 404);
      }
      const at = nowIso(this.now);
      run.status = "failed";
      run.error = error.slice(0, 4000);
      run.endedAt = at;
      const task = state.tasks.find((item) => item.id === run.taskId);
      if (task !== undefined && task.status === "running") {
        task.status = "ready";
        task.updatedAt = at;
      }
      if (task !== undefined) {
        this.escalateRepeatedFailure(state, task, at, run.error, run);
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "agent.failed",
        at,
        projectId: run.projectId,
        taskId: run.taskId,
        payload: { runId: run.id, error: run.error },
      });
      await this.save();
      return structuredClone(run);
    });
  }

  /**
   * Enforces the module contract boundary after a code run. Changing the
   * contract file or a forbidden path blocks the task and escalates a decision;
   * it never silently rewrites the Agent's worktree.
   */
  async enforceContractScope(
    taskId: string,
    runId: string,
    changedFiles: string[],
  ): Promise<string[]> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = findTask(state, taskId);
      const module =
        task.module === null
          ? undefined
          : state.modules.find(
              (item) =>
                item.projectId === task.projectId &&
                item.name === task.module,
            );
      if (module === undefined) return [];
      const normalize = (value: string): string =>
        value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
      const contract = normalize(module.contractPath ?? "");
      const forbidden = module.forbiddenPaths.map(normalize).filter(Boolean);
      const allowed = module.allowedPaths.map(normalize).filter(Boolean);
      const violations = changedFiles
        .map(normalize)
        .filter((file) => {
          if (file === "") return false;
          if (contract !== "" && file === contract) return true;
          if (
            forbidden.some(
              (path) => file === path || file.startsWith(`${path}/`),
            )
          ) {
            return true;
          }
          if (
            allowed.length > 0 &&
            (file.startsWith("src/") || file.startsWith("test/")) &&
            !allowed.some(
              (path) => file === path || file.startsWith(`${path}/`),
            )
          ) {
            return true;
          }
          return false;
        });
      if (violations.length === 0) return [];
      const at = nowIso(this.now);
      task.status = "blocked";
      task.updatedAt = at;
      const title = `契约越界：${task.title.slice(0, 160)}`;
      if (
        !state.decisions.some(
          (item) => item.taskId === task.id && item.title === title,
        )
      ) {
        const run = state.runs.find((item) => item.id === runId);
        state.decisions.push({
          id: newId("dec"),
          projectId: task.projectId,
          taskId: task.id,
          runId,
          title,
          context: `模块「${module.name}」的契约/禁止路径被修改：${violations.join("、")}`,
          options: [
            {
              label: "退回 Architect 修订契约",
              tradeoff: "先确认契约边界是否变化，再重开 ticket",
            },
            {
              label: "撤销越界改动",
              tradeoff: "保留现有契约，要求 Agent 只改允许路径",
            },
          ],
          recommendation:
            "实现者不能直接改契约或禁止路径；需要契约变更时，应由 Architect/Owner 先更新契约，再重新派单。",
          reversible: true,
          adrDraft: null,
          adrPath: null,
          status: "pending",
          decision: "",
          note: "",
          decidedBy: "",
          tokenCost: run?.tokens ?? null,
          createdAt: at,
          decidedAt: null,
        });
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "contract.violated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: { runId, module: module.name, violations },
      });
      await this.save();
      return violations;
    });
  }

  async recordVerification(
    taskId: string,
    input: {
      command: string;
      workdir: string;
      exitCode: number;
      output: string;
      passed: boolean;
      runId?: string | null;
    },
  ): Promise<Verification> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = findTask(state, taskId);
      const at = nowIso(this.now);
      const run = input.runId
        ? state.runs.find((item) => item.id === input.runId)
        : [...state.runs]
            .filter(
              (item) =>
                item.taskId === taskId && item.workspacePath !== null,
            )
            .sort((left, right) =>
              right.startedAt.localeCompare(left.startedAt),
            )[0];
      const verification: Verification = {
        id: newId("verify"),
        projectId: task.projectId,
        taskId,
        runId: run?.id ?? null,
        command: requiredText(input.command, "command", 500),
        workdir: requiredText(input.workdir, "workdir", 1000),
        exitCode: input.exitCode,
        output: input.output.slice(0, 20000),
        passed: input.passed,
        createdAt: at,
      };
      state.verifications.push(verification);
      if (input.passed) {
        const text = `验证通过：\`${verification.command}\`（exit 0）`;
        if (!task.evidence.some((item) => item.text === text)) {
          task.evidence.push({
            id: newId("ev"),
            text,
            createdAt: at,
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
          runId: verification.runId,
        },
      });
      await this.save();
      return structuredClone(verification);
    });
  }

  async getDecisionAdrContext(decisionId: string): Promise<{
    decision: Decision;
    project: Project;
  }> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId,
      );
      if (decision === undefined) {
        throw new StudioStoreError(
          "decision_not_found",
          "决策不存在",
          404,
        );
      }
      const project = state.projects.find(
        (item) => item.id === decision.projectId,
      );
      if (project === undefined) {
        throw new StudioStoreError(
          "project_not_found",
          "决策对应的项目不存在",
          404,
        );
      }
      return {
        decision: structuredClone(decision),
        project: structuredClone(project),
      };
    });
  }

  async setDecisionAdrPath(
    decisionId: string,
    adrPath: string,
  ): Promise<Decision> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId,
      );
      if (decision === undefined) {
        throw new StudioStoreError(
          "decision_not_found",
          "决策不存在",
          404,
        );
      }
      const at = nowIso(this.now);
      decision.adrPath = adrPath;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "decision.adr_written",
        at,
        projectId: decision.projectId,
        taskId: decision.taskId,
        payload: { decisionId, adrPath },
      });
      await this.save();
      return structuredClone(decision);
    });
  }

  async createPostMergeDecision(input: {
    taskId: string;
    proposalId: string;
    mergeCommit: string;
    command: string;
    exitCode: number;
    output: string;
  }): Promise<Decision | null> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const task = findTask(state, input.taskId);
      const title = `合并后回归失败：${task.title.slice(0, 140)}`;
      if (
        state.decisions.some(
          (item) => item.taskId === task.id && item.title === title,
        )
      ) {
        return null;
      }
      const at = nowIso(this.now);
      const decision: Decision = {
        id: newId("dec"),
        projectId: task.projectId,
        taskId: task.id,
        runId: null,
        title,
        context: [
          `合并 ${input.mergeCommit} 后执行回归：${input.command}（exit ${String(input.exitCode)}）`,
          "",
          input.output.slice(0, 6000),
        ].join("\n"),
        options: [
          {
            label: "回滚这次合并",
            tradeoff: `git revert ${input.mergeCommit} 或 git reset --hard ${input.mergeCommit}^`,
          },
          {
            label: "保留合并，修复回归",
            tradeoff: "在主分支上追加修复提交，并重新跑回归",
          },
        ],
        recommendation:
          "合并后回归失败。先看输出定位破坏点；无法快速修复时回滚 merge commit，再重新走提案。",
        reversible: true,
        adrDraft: null,
        adrPath: null,
        status: "pending",
        decision: "",
        note: "",
        decidedBy: "",
        tokenCost: null,
        createdAt: at,
        decidedAt: null,
      };
      state.decisions.push(decision);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "decision.escalated",
        at,
        projectId: task.projectId,
        taskId: task.id,
        payload: {
          decisionId: decision.id,
          proposalId: input.proposalId,
          mergeCommit: input.mergeCommit,
          kind: "post_merge_regression",
        },
      });
      await this.save();
      return structuredClone(decision);
    });
  }

  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      let taskId: string | null = null;
      if (input.taskId !== undefined && input.taskId !== null) {
        const task = findTask(state, input.taskId);
        if (task.projectId !== project.id) {
          throw new StudioStoreError(
            "task_not_found",
            "任务不属于当前项目",
            404,
          );
        }
        taskId = task.id;
      }
      const at = nowIso(this.now);
      const decision: Decision = {
        id: newId("dec"),
        projectId: project.id,
        taskId,
        runId: null,
        title: requiredText(input.title, "title", 200),
        context: optionalText(input.context, "context", 4000),
        options: [],
        recommendation: optionalText(
          input.recommendation,
          "recommendation",
          2000,
        ),
        reversible: input.reversible !== false,
        adrDraft: null,
        adrPath: null,
        status: "pending",
        decision: "",
        note: "",
        decidedBy: "",
        tokenCost: null,
        createdAt: at,
        decidedAt: null,
      };
      state.decisions.push(decision);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "decision.created",
        at,
        projectId: project.id,
        taskId,
        payload: { decisionId: decision.id, title: decision.title },
      });
      await this.save();
      return structuredClone(decision);
    });
  }

  async decideDecision(
    decisionId: string,
    input: DecideDecisionInput,
  ): Promise<Decision> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const decision = state.decisions.find(
        (item) => item.id === decisionId,
      );
      if (decision === undefined) {
        throw new StudioStoreError(
          "decision_not_found",
          "决策不存在",
          404,
        );
      }
      if (decision.status !== "pending") {
        throw new StudioStoreError(
          "decision_decided",
          "这条决策已经有结论",
          409,
        );
      }
      if (input.status !== "approved" && input.status !== "rejected") {
        throw new StudioStoreError(
          "invalid_input",
          "决策状态只能是 approved 或 rejected",
        );
      }
      if (
        decision.reversible === false &&
        input.status === "approved" &&
        optionalText(input.decision, "decision", 4000) === ""
      ) {
        throw new StudioStoreError(
          "decision_reason_required",
          "不可逆决策批准时必须写明结论和理由",
          409,
        );
      }
      const at = nowIso(this.now);
      decision.status = input.status;
      decision.decision = optionalText(input.decision, "decision", 4000);
      decision.note = optionalText(input.note, "note", 2000);
      decision.decidedBy = "Owner";
      decision.decidedAt = at;
      if (input.status === "approved" && decision.reversible === false) {
        decision.adrDraft = [
          `# ADR: ${decision.title}`,
          "",
          `- 日期：${at.slice(0, 10)}`,
          "- 状态：Accepted",
          "- 不可逆：是",
          "",
          "## 背景",
          decision.context || "（未填写）",
          "",
          "## 决策",
          decision.decision || "（未填写）",
          "",
          "## 理由",
          decision.note || "（未填写）",
          "",
          "## 建议",
          decision.recommendation || "（无）",
          "",
        ].join("\n");
      }
      state.updatedAt = at;
      this.recordEvent(state, {
        type:
          input.status === "approved"
            ? "decision.approved"
            : "decision.rejected",
        at,
        projectId: decision.projectId,
        taskId: decision.taskId,
        payload: {
          decisionId: decision.id,
          decision: decision.decision,
          note: decision.note,
        },
      });
      await this.save();
      return structuredClone(decision);
    });
  }

  async createModule(input: CreateModuleInput): Promise<Module> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const name = requiredText(input.name, "name", 120);
      if (
        state.modules.some(
          (module) =>
            module.projectId === project.id && module.name === name,
        )
      ) {
        throw new StudioStoreError(
          "module_exists",
          "同一项目下模块名不能重复",
          409,
        );
      }
      const at = nowIso(this.now);
      const module: Module = {
        id: newId("module"),
        projectId: project.id,
        name,
        responsibility: optionalText(
          input.responsibility,
          "responsibility",
          2000,
        ),
        contractPath:
          optionalText(input.contractPath, "contractPath", 500) || null,
        contractText: optionalText(
          input.contractText,
          "contractText",
          8000,
        ),
        allowedPaths: textList(input.allowedPaths, "allowedPaths", 30),
        forbiddenPaths: textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30,
        ),
        dependsOn: textList(input.dependsOn, "dependsOn", 20),
        createdAt: at,
        updatedAt: at,
      };
      state.modules.push(module);
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "module.created",
        at,
        projectId: project.id,
        payload: { moduleId: module.id, name: module.name },
      });
      await this.save();
      return structuredClone(module);
    });
  }

  async updateModule(
    moduleId: string,
    input: UpdateModuleInput,
  ): Promise<Module> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const module = state.modules.find((item) => item.id === moduleId);
      if (module === undefined) {
        throw new StudioStoreError("module_not_found", "模块不存在", 404);
      }
      if (input.responsibility !== undefined) {
        module.responsibility = optionalText(
          input.responsibility,
          "responsibility",
          2000,
        );
      }
      if (input.contractPath !== undefined) {
        module.contractPath =
          optionalText(input.contractPath, "contractPath", 500) || null;
      }
      if (input.contractText !== undefined) {
        module.contractText = optionalText(
          input.contractText,
          "contractText",
          8000,
        );
      }
      if (input.allowedPaths !== undefined) {
        module.allowedPaths = textList(
          input.allowedPaths,
          "allowedPaths",
          30,
        );
      }
      if (input.forbiddenPaths !== undefined) {
        module.forbiddenPaths = textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30,
        );
      }
      if (input.dependsOn !== undefined) {
        module.dependsOn = textList(input.dependsOn, "dependsOn", 20);
      }
      const at = nowIso(this.now);
      module.updatedAt = at;
      state.updatedAt = at;
      this.recordEvent(state, {
        type: "module.updated",
        at,
        projectId: module.projectId,
        payload: { moduleId: module.id },
      });
      await this.save();
      return structuredClone(module);
    });
  }

  async createProviderProfile(
    input: CreateProviderProfileInput,
  ): Promise<ProviderProfile> {
    return createProviderProfileImpl(this.context, input);
  }

  async updateProviderProfile(
    profileId: string,
    input: UpdateProviderProfileInput,
  ): Promise<ProviderProfile> {
    return updateProviderProfileImpl(this.context, profileId, input);
  }

  async deleteProviderProfile(profileId: string): Promise<void> {
    return deleteProviderProfileImpl(this.context, profileId);
  }

  async reassignProviderProfile(
    fromProfileId: string,
    toProfileId: string,
  ): Promise<{
    fromProfileId: string;
    toProfileId: string;
    movedRoleIds: string[];
  }> {
    return reassignProviderProfileImpl(this.context, fromProfileId, toProfileId);
  }

  async getProviderProfile(profileId: string): Promise<ProviderProfile> {
    return getProviderProfileImpl(this.context, profileId);
  }

  async getRoleProvider(roleId: string): Promise<ProviderProfile | null> {
    return getRoleProviderImpl(this.context, roleId);
  }

  async createRole(input: CreateRoleInput): Promise<Role> {
    return this.runExclusive(async () => {
      const state = this.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const at = nowIso(this.now);
      const providerProfileId =
        optionalText(input.providerProfileId, "providerProfileId", 120) ||
        null;
      if (providerProfileId !== null) {
        const profile = findProviderProfile(state, providerProfileId);
        if (profile.projectId !== project.id) {
          throw new StudioStoreError(
            "provider_profile_not_found",
            "Provider Profile 不属于当前项目",
            404,
          );
        }
      }
      const role: Role = {
        id: newId("role"),
        projectId: project.id,
        name: requiredText(input.name, "name", 60),
        title: optionalText(input.title, "title", 80),
        mission: optionalText(input.mission, "mission", 600),
        responsibilities: textList(input.responsibilities, "responsibilities"),
        nonGoals: textList(input.nonGoals, "nonGoals"),
        decisionRights: textList(input.decisionRights, "decisionRights"),
        providerProfileId,
        model: optionalText(input.model, "model", 120) || null,
        executor:
          input.executor === "claude-code" || input.executor === "codex"
            ? input.executor
            : "dsh",
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        dailyTokenBudget: optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget",
        ),
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
      if (input.providerProfileId !== undefined) {
        const nextProfileId =
          optionalText(input.providerProfileId, "providerProfileId", 120) ||
          null;
        if (nextProfileId !== null) {
          const profile = findProviderProfile(state, nextProfileId);
          if (profile.projectId !== role.projectId) {
            throw new StudioStoreError(
              "provider_profile_not_found",
              "Provider Profile 不属于当前项目",
              404,
            );
          }
        }
        role.providerProfileId = nextProfileId;
      }
      if (input.model !== undefined) {
        role.model = optionalText(input.model, "model", 120) || null;
      }
      if (input.executor !== undefined) {
        role.executor =
          input.executor === "claude-code" || input.executor === "codex"
            ? input.executor
            : "dsh";
      }
      if (input.tokenBudget !== undefined) {
        role.tokenBudget = optionalTokenBudget(input.tokenBudget, "tokenBudget");
      }
      if (input.dailyTokenBudget !== undefined) {
        role.dailyTokenBudget = optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget",
        );
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
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const at = nowIso(this.now);
      const ownerRoleId = resolveRoleId(
        state,
        project.id,
        input.ownerRoleId,
        "ownerRoleId",
      );
      const reviewerRoleId = resolveRoleId(
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
        verifyCommand:
          optionalText(input.verifyCommand, "verifyCommand", 500) || null,
        module: optionalText(input.module, "module", 120) || null,
        contractRef:
          optionalText(input.contractRef, "contractRef", 300) || null,
        requirementRefs: textList(input.requirementRefs, "requirementRefs", 30),
        kind: input.kind === "fix" ? "fix" : "new",
        diagnosis: optionalText(input.diagnosis, "diagnosis", 4000),
        plan: optionalText(input.plan, "plan", 4000),
        integration: input.integration === true,
        originTaskId:
          optionalText(input.originTaskId, "originTaskId", 120) || null,
        docsSynced: false,
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
      const task = findTask(state, taskId);
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
        task.ownerRoleId = resolveRoleId(
          state,
          task.projectId,
          input.ownerRoleId,
          "ownerRoleId",
        );
      }
      if (input.reviewerRoleId !== undefined) {
        task.reviewerRoleId = resolveRoleId(
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
      if (input.verifyCommand !== undefined) {
        task.verifyCommand =
          optionalText(input.verifyCommand, "verifyCommand", 500) || null;
      }
      if (input.module !== undefined) {
        task.module = optionalText(input.module, "module", 120) || null;
      }
      if (input.contractRef !== undefined) {
        task.contractRef =
          optionalText(input.contractRef, "contractRef", 300) || null;
      }
      if (input.requirementRefs !== undefined) {
        task.requirementRefs = textList(
          input.requirementRefs,
          "requirementRefs",
          30,
        );
      }
      if (input.kind !== undefined) {
        task.kind = input.kind === "fix" ? "fix" : "new";
      }
      if (input.diagnosis !== undefined) {
        task.diagnosis = optionalText(input.diagnosis, "diagnosis", 4000);
      }
      if (input.plan !== undefined) {
        task.plan = optionalText(input.plan, "plan", 4000);
      }
      if (input.integration !== undefined) {
        task.integration = input.integration === true;
      }
      if (input.docsSynced !== undefined) {
        task.docsSynced = input.docsSynced === true;
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
      const task = findTask(state, taskId);
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
        const project = state.projects.find(
          (item) => item.id === task.projectId,
        );
        const hasCodeRun = state.runs.some(
          (item) =>
            item.taskId === task.id && item.workspacePath !== null,
        );
        if (
          project?.repoPath !== null &&
          project?.repoPath !== undefined &&
          hasCodeRun &&
          !state.reviews.some(
            (review) =>
              review.taskId === task.id && review.verdict === "pass",
          )
        ) {
          throw new StudioStoreError(
            "review_required",
            "代码任务完成前必须有一次通过的独立评审",
            409,
          );
        }
        const hasDocs =
          project !== undefined &&
          (project.prdPath !== null ||
            project.invariantsPath !== null ||
            project.modulesPath !== null);
        if (hasDocs && !task.docsSynced) {
          throw new StudioStoreError(
            "docs_sync_required",
            "项目已绑定 PRD/INVARIANTS/MODULES，完成前必须确认文档已同步",
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
      if (next === "done") {
        this.scheduleIntegrationGate(state, task.projectId, at);
      }
      await this.save();
      return structuredClone(task);
    });
  }

  private scheduleIntegrationGate(
    state: StudioState,
    projectId: string,
    at: string,
  ): void {
    const done = state.tasks.filter(
      (item) => item.projectId === projectId && item.status === "done",
    ).length;
    const generated = state.tasks.filter(
      (item) =>
        item.projectId === projectId &&
        item.title.startsWith("集成验收（自动 #"),
    ).length;
    if (Math.floor(done / 3) <= generated) return;
    const lead =
      state.roles.find(
        (role) =>
          role.projectId === projectId &&
          (role.id === "role-lead" || role.title.includes("制作人")),
      ) ?? state.roles.find((role) => role.projectId === projectId);
    const verifier =
      state.roles.find(
        (role) =>
          role.projectId === projectId &&
          (role.id === "role-verifier" || role.title.includes("QA")),
      ) ?? lead;
    if (lead === undefined) return;
    const index = generated + 1;
    const task: Task = {
      id: newId("task"),
      projectId,
      title: `集成验收（自动 #${String(index)}）`,
      goal: "每 3 个完成任务后的集成 gate：打包当前 build，人玩 10 分钟，记录阻断问题与可继续迭代的判断。",
      status: "backlog",
      priority: "P1",
      ownerRoleId: lead.id,
      reviewerRoleId: verifier?.id ?? lead.id,
      acceptance: [
        {
          id: newId("acc"),
          text: "打包出可运行 build",
          done: false,
        },
        {
          id: newId("acc"),
          text: "人玩 10 分钟并记录阻断问题",
          done: false,
        },
      ],
      evidence: [],
      branch: null,
      verifyCommand: "npm test",
      module: null,
      contractRef: null,
      requirementRefs: [],
      kind: "new",
      diagnosis: "",
      plan: "",
      integration: true,
      originTaskId: null,
      docsSynced: false,
      createdAt: at,
      updatedAt: at,
    };
    state.tasks.push(task);
    this.recordEvent(state, {
      type: "integration.scheduled",
      at,
      projectId,
      taskId: task.id,
      payload: { index, doneTasks: done },
    });
  }

  async listTransitions(taskId: string): Promise<TaskStatus[]> {
    return this.runExclusive(async () => {
      const task = findTask(this.requireState(), taskId);
      return [...ALLOWED_TRANSITIONS[task.status]];
    });
  }

  async createMergeProposal(
    taskId: string,
    input: CreateMergeProposalInput,
  ): Promise<MergeProposal> {
    return createMergeProposalImpl(this.context, taskId, input);
  }

  async approveMergeProposal(
    proposalId: string,
    note?: string,
  ): Promise<MergeProposal> {
    return approveMergeProposalImpl(this.context, proposalId, note);
  }

  async rejectMergeProposal(
    proposalId: string,
    note: string,
  ): Promise<MergeProposal> {
    return rejectMergeProposalImpl(this.context, proposalId, note);
  }

  async getMergeContext(proposalId: string): Promise<{
    proposal: MergeProposal;
    project: Project;
    task: Task;
    verification: Verification | null;
  }> {
    return getMergeContextImpl(this.context, proposalId);
  }

  async completeMergeProposal(
    proposalId: string,
    mergeCommit?: string,
  ): Promise<MergeProposal> {
    return completeMergeProposalImpl(this.context, proposalId, mergeCommit);
  }

  async setMergePostVerification(
    proposalId: string,
    verificationId: string,
  ): Promise<MergeProposal> {
    return setMergePostVerificationImpl(this.context, proposalId, verificationId);
  }

  async recordRollback(
    proposalId: string,
    rollbackCommit: string,
  ): Promise<MergeProposal> {
    return recordRollbackImpl(this.context, proposalId, rollbackCommit);
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
      const migrated = migrateState(parsed);
      assertState(migrated);
      this.state = migrated;
      if (
        !isRecord(parsed) ||
        parsed.schemaVersion !== STUDIO_SCHEMA_VERSION
      ) {
        await this.save();
      }
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

  private escalateRepeatedFailure(
    state: StudioState,
    task: Task,
    at: string,
    reason: string,
    run: AgentRun,
  ): void {
    const failures = state.runs.filter(
      (item) => item.taskId === task.id && item.status === "failed",
    ).length;
    if (failures < 2 || task.status === "done") return;
    task.status = "blocked";
    task.updatedAt = at;
    const hasResplit = state.tasks.some(
      (item) => item.originTaskId === task.id,
    );
    if (!hasResplit) {
      const architect =
        state.roles.find(
          (role) =>
            role.projectId === task.projectId &&
            (role.id === "role-architect" ||
              role.title.includes("架构")),
        ) ??
        state.roles.find((role) => role.id === task.ownerRoleId);
      if (architect !== undefined) {
        const resplit: Task = {
          id: newId("task"),
          projectId: task.projectId,
          title: `重拆：${task.title}`.slice(0, 160),
          goal: `原任务连续失败 ${String(failures)} 次。先诊断根因，重拆任务/契约，产出可执行的新 ticket 与验收标准；不要直接写业务代码。最后一次失败：${reason}`,
          status: "backlog",
          priority: task.priority,
          ownerRoleId: architect.id,
          reviewerRoleId: task.reviewerRoleId,
          acceptance: [
            {
              id: newId("acc"),
              text: "给出重拆后的任务/契约",
              done: false,
            },
            {
              id: newId("acc"),
              text: "标明可执行 ticket 与验收标准",
              done: false,
            },
          ],
          evidence: [],
          branch: null,
          verifyCommand: task.verifyCommand,
          module: task.module,
          contractRef: task.contractRef,
          requirementRefs: task.requirementRefs,
          kind: "fix",
          diagnosis: "",
          plan: "",
          integration: false,
          originTaskId: task.id,
          docsSynced: false,
          createdAt: at,
          updatedAt: at,
        };
        state.tasks.push(resplit);
        this.recordEvent(state, {
          type: "task.resplit",
          at,
          projectId: task.projectId,
          taskId: resplit.id,
          payload: {
            originTaskId: task.id,
            ownerRoleId: architect.id,
          },
        });
      }
    }
    const title = `连续失败：${task.title.slice(0, 160)}`;
    if (
      state.decisions.some(
        (item) => item.taskId === task.id && item.title === title,
      )
    ) {
      return;
    }
    const decision: Decision = {
      id: newId("dec"),
      projectId: task.projectId,
      taskId: task.id,
      runId: run.id,
      title,
      context: `${String(failures)} 次失败；最后一次：${reason}`,
      options: [
        {
          label: "退回 Architect 重拆任务/契约",
          tradeoff: "停止原地重试，先修任务定义或契约",
        },
        {
          label: "继续重试",
          tradeoff: "保留当前任务，但需要新的证据",
        },
      ],
      recommendation:
        "同一任务连续失败 2 次，按工作流应退回架构师重拆，不允许第三次原地重试。",
      reversible: true,
      adrDraft: null,
      adrPath: null,
      status: "pending",
      decision: "",
      note: "",
      decidedBy: "",
      tokenCost: run.tokens,
      createdAt: at,
      decidedAt: null,
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
        runId: run.id,
      },
    });
  }

  private ensureBranch(
    state: StudioState,
    task: Task,
    at: string,
  ): Branch {
    const name = task.branch ?? `task/${task.id}`;
    if (task.branch === null) task.branch = name;
    let branch = state.branches.find(
      (item) =>
        item.projectId === task.projectId && item.name === name,
    );
    if (branch === undefined) {
      branch = {
        id: `branch-${task.id}`,
        projectId: task.projectId,
        taskId: task.id,
        name,
        goal: task.goal,
        roleId: task.ownerRoleId,
        contractKeys: [],
        status: "open",
        createdAt: at,
        updatedAt: at,
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
    return createSeedState(this.now);
  }
}
