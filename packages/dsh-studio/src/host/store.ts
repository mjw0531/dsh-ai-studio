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
  ProjectSlice,
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
import { getDispatchContext as getDispatchContextImpl } from "./store/runs.js";
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
  approveStageGate as approveStageGateImpl,
  createProject as createProjectImpl,
  createProjectFromTemplate as createProjectFromTemplateImpl,
  getStageGate as getStageGateImpl,
  rejectStageGate as rejectStageGateImpl,
  selectProject as selectProjectImpl,
  updateProject as updateProjectImpl,
  updateStageGate as updateStageGateImpl,
} from "./store/projects.js";
import {
  createModule as createModuleImpl,
  createRole as createRoleImpl,
  updateModule as updateModuleImpl,
  updateRole as updateRoleImpl,
} from "./store/catalog.js";
import { importProjectSlice as importProjectSliceImpl } from "./store/import.js";
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
  const override = process.env.DSH_STUDIO_DATA_DIR?.trim();
  if (override !== undefined && override !== "") {
    return path.resolve(override);
  }
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
      createProject: (input) => this.createProject(input),
      createRole: (input) => this.createRole(input),
      createTask: (input) => this.createTask(input),
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

  async importProjectSlice(
    slice: ProjectSlice,
    repoPath: string,
  ): Promise<Project> {
    return importProjectSliceImpl(this.context, slice, repoPath);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    return createProjectImpl(this.context, input);
  }

  async createProjectFromTemplate(
    input: CreateProjectFromTemplateInput,
  ): Promise<Project> {
    return createProjectFromTemplateImpl(this.context, input);
  }

  async updateProject(
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    return updateProjectImpl(this.context, projectId, input);
  }

  async getStageGate(
    projectId: string,
    stage: ProjectStage,
  ): Promise<StageGate> {
    return getStageGateImpl(this.context, projectId, stage);
  }

  async updateStageGate(
    projectId: string,
    stage: ProjectStage,
    input: UpdateStageGateInput,
  ): Promise<StageGate> {
    return updateStageGateImpl(this.context, projectId, stage, input);
  }

  async approveStageGate(
    projectId: string,
    stage: ProjectStage,
    input: ApproveStageGateInput,
  ): Promise<StageGate> {
    return approveStageGateImpl(this.context, projectId, stage, input);
  }

  async rejectStageGate(
    projectId: string,
    stage: ProjectStage,
    note: string,
  ): Promise<StageGate> {
    return rejectStageGateImpl(this.context, projectId, stage, note);
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
    return selectProjectImpl(this.context, projectId);
  }

  async getDispatchContext(taskId: string): Promise<{
    task: Task;
    role: Role;
    project: Project;
    module: Module | null;
    providerProfile: ProviderProfile | null;
  }> {
    return getDispatchContextImpl(this.context, taskId);
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
    workspace?: { path: string; branch: string; baseSha?: string },
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
      commitSha?: string | null;
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
    return createModuleImpl(this.context, input);
  }

  async updateModule(
    moduleId: string,
    input: UpdateModuleInput,
  ): Promise<Module> {
    return updateModuleImpl(this.context, moduleId, input);
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
    return createRoleImpl(this.context, input);
  }

  async updateRole(
    roleId: string,
    input: Partial<CreateRoleInput>,
  ): Promise<Role> {
    return updateRoleImpl(this.context, roleId, input);
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const backup = `${this.file}.corrupt-${String(Date.now())}`;
      await rename(this.file, backup).catch(() => undefined);
      this.state = this.seedState();
      this.warning = `studio.json 无法读取，已备份到 ${backup} 并重建演示数据：${
        error instanceof Error ? error.message : String(error)
      }`;
      await this.save();
      return;
    }
    if (
      isRecord(parsed) &&
      typeof parsed.schemaVersion === "number" &&
      parsed.schemaVersion > STUDIO_SCHEMA_VERSION
    ) {
      this.warning = `studio.json schemaVersion=${String(parsed.schemaVersion)} 高于当前支持的 ${String(
        STUDIO_SCHEMA_VERSION,
      )}；已保留原文件，未覆盖、未重建。请升级 dsh-ai-studio 后再启动。`;
      this.state = null;
      return;
    }
    try {
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
