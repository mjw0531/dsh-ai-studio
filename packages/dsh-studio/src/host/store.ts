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

import { StudioStoreError, type StoreContext } from "./store/core.js";
export { StudioStoreError } from "./store/core.js";
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
  createTask as createTaskImpl,
  listTransitions as listTransitionsImpl,
  transitionTask as transitionTaskImpl,
  updateTask as updateTaskImpl,
} from "./store/tasks.js";
import {
  getReviewContext as getReviewContextImpl,
  getTaskVerificationContext as getTaskVerificationContextImpl,
  recordReview as recordReviewImpl,
  recordVerification as recordVerificationImpl,
} from "./store/reviews.js";
import {
  attachRunSession as attachRunSessionImpl,
  beginRun as beginRunImpl,
  completeRun as completeRunImpl,
  enforceContractScope as enforceContractScopeImpl,
  failRun as failRunImpl,
} from "./store/runs.js";
import {
  addWorkshopNote as addWorkshopNoteImpl,
  createPrototypeDemo as createPrototypeDemoImpl,
  createWorkshop as createWorkshopImpl,
  decideWorkshop as decideWorkshopImpl,
  getWorkshopContext as getWorkshopContextImpl,
  setWorkshopAiSummary as setWorkshopAiSummaryImpl,
  synthesizeWorkshop as synthesizeWorkshopImpl,
  updatePrototypeDemo as updatePrototypeDemoImpl,
} from "./store/workshops.js";
import {
  createDecision as createDecisionImpl,
  createPostMergeDecision as createPostMergeDecisionImpl,
  decideDecision as decideDecisionImpl,
  getDecisionAdrContext as getDecisionAdrContextImpl,
  setDecisionAdrPath as setDecisionAdrPathImpl,
} from "./store/decisions.js";
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
    return getWorkshopContextImpl(this.context, workshopId);
  }

  async createPrototypeDemo(
    input: CreatePrototypeDemoInput,
    projectId?: string,
  ): Promise<PrototypeDemo> {
    return createPrototypeDemoImpl(this.context, input, projectId);
  }

  async updatePrototypeDemo(
    demoId: string,
    input: UpdatePrototypeDemoInput,
  ): Promise<PrototypeDemo> {
    return updatePrototypeDemoImpl(this.context, demoId, input);
  }

  async createWorkshop(input: CreateWorkshopInput): Promise<Workshop> {
    return createWorkshopImpl(this.context, input);
  }

  async addWorkshopNote(
    workshopId: string,
    input: AddWorkshopNoteInput,
  ): Promise<Workshop> {
    return addWorkshopNoteImpl(this.context, workshopId, input);
  }

  async setWorkshopAiSummary(
    workshopId: string,
    summary: WorkshopAiSummary,
  ): Promise<Workshop> {
    return setWorkshopAiSummaryImpl(this.context, workshopId, summary);
  }

  async synthesizeWorkshop(
    workshopId: string,
    synthesis: string,
  ): Promise<Workshop> {
    return synthesizeWorkshopImpl(this.context, workshopId, synthesis);
  }

  async decideWorkshop(
    workshopId: string,
    decision: string,
  ): Promise<Workshop> {
    return decideWorkshopImpl(this.context, workshopId, decision);
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
    return getReviewContextImpl(this.context, taskId);
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
    return recordReviewImpl(this.context, taskId, input);
  }

  async getTaskVerificationContext(taskId: string): Promise<{
    task: Task;
    run: AgentRun | null;
  }> {
    return getTaskVerificationContextImpl(this.context, taskId);
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
    return beginRunImpl(this.context, taskId, prompt, workspace, execution);
  }

  async attachRunSession(
    runId: string,
    sessionId: string,
    model?: string,
  ): Promise<void> {
    return attachRunSessionImpl(this.context, runId, sessionId, model);
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
    return completeRunImpl(this.context, runId, input);
  }

  async failRun(runId: string, error: string): Promise<AgentRun> {
    return failRunImpl(this.context, runId, error);
  }

  async enforceContractScope(
    taskId: string,
    runId: string,
    changedFiles: string[],
  ): Promise<string[]> {
    return enforceContractScopeImpl(this.context, taskId, runId, changedFiles);
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
    return recordVerificationImpl(this.context, taskId, input);
  }

  async getDecisionAdrContext(decisionId: string): Promise<{
    decision: Decision;
    project: Project;
  }> {
    return getDecisionAdrContextImpl(this.context, decisionId);
  }

  async setDecisionAdrPath(
    decisionId: string,
    adrPath: string,
  ): Promise<Decision> {
    return setDecisionAdrPathImpl(this.context, decisionId, adrPath);
  }

  async createPostMergeDecision(input: {
    taskId: string;
    proposalId: string;
    mergeCommit: string;
    command: string;
    exitCode: number;
    output: string;
  }): Promise<Decision | null> {
    return createPostMergeDecisionImpl(this.context, input);
  }

  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    return createDecisionImpl(this.context, input);
  }

  async decideDecision(
    decisionId: string,
    input: DecideDecisionInput,
  ): Promise<Decision> {
    return decideDecisionImpl(this.context, decisionId, input);
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
    return createTaskImpl(this.context, input);
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    return updateTaskImpl(this.context, taskId, input);
  }

  async transitionTask(taskId: string, next: TaskStatus): Promise<Task> {
    return transitionTaskImpl(this.context, taskId, next);
  }

  async listTransitions(taskId: string): Promise<TaskStatus[]> {
    return listTransitionsImpl(this.context, taskId);
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
