import { STUDIO_SCHEMA_VERSION } from "../../shared/types.js";
import type {
  AgentRun,
  IndependentReview,
  Module,
  StudioState,
  TriggerRules,
  Verification,
} from "../../shared/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultTriggerRules(): TriggerRules {
  return {
    enabled: false,
    sources: ["github", "ci", "im"],
    repos: [],
    labels: [],
    authors: [],
    mention: "",
  };
}

export function migrateState(value: unknown): StudioState {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  let state = value as unknown as StudioState;
  if (state.schemaVersion === 1) {
    state = {
      ...state,
      schemaVersion: 2,
      mergeProposals: [],
    };
  }
  if (state.schemaVersion === 2) {
    state = {
      ...state,
      schemaVersion: 3,
      projects: state.projects.map((project) => ({
        ...project,
        tokenBudget: project.tokenBudget ?? null,
      })),
      roles: state.roles.map((role) => ({
        ...role,
        model: role.model ?? null,
        tokenBudget: role.tokenBudget ?? null,
        dailyTokenBudget: role.dailyTokenBudget ?? null,
      })),
      runs: Array.isArray(
        (state as unknown as { runs?: unknown }).runs,
      )
        ? ((state as unknown as { runs: AgentRun[] }).runs)
        : [],
    };
  }
  if (state.schemaVersion === 3) {
    state = {
      ...state,
      schemaVersion: 4,
      decisions: [],
    };
  }
  if (state.schemaVersion === 4) {
    state = {
      ...state,
      schemaVersion: 5,
      runs: state.runs.map((run) => ({
        ...run,
        branchId: run.branchId ?? null,
      })),
      branches: state.tasks
        .filter((task) => task.branch !== null)
        .map((task) => ({
          id: `branch-${task.id}`,
          projectId: task.projectId,
          taskId: task.id,
          name: task.branch as string,
          goal: task.goal,
          roleId: task.ownerRoleId,
          contractKeys: [],
          status: task.status === "review" ? "review" as const : "open" as const,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })),
      contractChanges: [],
    };
  }
  if (state.schemaVersion === 5) {
    state = {
      ...state,
      schemaVersion: 6,
      projects: state.projects.map((project) => ({
        ...project,
        repoPath: project.repoPath ?? null,
      })),
      runs: state.runs.map((run) => ({
        ...run,
        branchName: run.branchName ?? null,
        workspacePath: run.workspacePath ?? null,
        diffStat: run.diffStat ?? null,
      })),
    };
  }
  if (state.schemaVersion === 6) {
    state = {
      ...state,
      schemaVersion: 7,
      tasks: state.tasks.map((task) => ({
        ...task,
        verifyCommand: task.verifyCommand ?? null,
      })),
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        diffStat: proposal.diffStat ?? null,
        changedFiles: Array.isArray(proposal.changedFiles)
          ? proposal.changedFiles
          : [],
        verificationId: proposal.verificationId ?? null,
      })),
      verifications: Array.isArray(
        (state as unknown as { verifications?: unknown }).verifications,
      )
        ? ((state as unknown as { verifications: Verification[] }).verifications)
        : [],
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
        kind: task.kind ?? "new",
      })),
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
        modulesPath: project.modulesPath ?? null,
      })),
      modules: Array.isArray(
        (state as unknown as { modules?: unknown }).modules,
      )
        ? ((state as unknown as { modules: Module[] }).modules)
        : [],
    };
  }
  if (state.schemaVersion === 9) {
    state = {
      ...state,
      schemaVersion: 10,
      tasks: state.tasks.map((task) => ({
        ...task,
        integration: task.integration ?? false,
        originTaskId: task.originTaskId ?? null,
      })),
    };
  }
  if (state.schemaVersion === 10) {
    state = {
      ...state,
      schemaVersion: 11,
      reviews: Array.isArray(
        (state as unknown as { reviews?: unknown }).reviews,
      )
        ? ((state as unknown as { reviews: IndependentReview[] }).reviews)
        : [],
    };
  }
  if (state.schemaVersion === 11) {
    state = {
      ...state,
      schemaVersion: 12,
      tasks: state.tasks.map((task) => ({
        ...task,
        docsSynced: task.docsSynced ?? false,
      })),
      decisions: state.decisions.map((decision) => ({
        ...decision,
        reversible: decision.reversible ?? true,
      })),
    };
  }
  if (state.schemaVersion === 12) {
    state = {
      ...state,
      schemaVersion: 13,
      decisions: state.decisions.map((decision) => ({
        ...decision,
        adrDraft: decision.adrDraft ?? null,
      })),
    };
  }
  if (state.schemaVersion === 13) {
    state = {
      ...state,
      schemaVersion: 14,
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        postMergeVerificationId:
          proposal.postMergeVerificationId ?? null,
      })),
    };
  }
  if (state.schemaVersion === 14) {
    state = {
      ...state,
      schemaVersion: 15,
      decisions: state.decisions.map((decision) => ({
        ...decision,
        adrPath: decision.adrPath ?? null,
      })),
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        rollbackCommit: proposal.rollbackCommit ?? null,
        rolledBackAt: proposal.rolledBackAt ?? null,
      })),
    };
  }
  if (state.schemaVersion === 15) {
    state = {
      ...state,
      schemaVersion: 16,
      tasks: state.tasks.map((task) => ({
        ...task,
        diagnosis: task.diagnosis ?? "",
        plan: task.plan ?? "",
      })),
    };
  }
  if (state.schemaVersion === 16) {
    state = {
      ...state,
      schemaVersion: 17,
      companyName: "AI工作室",
    };
  }
  if (state.schemaVersion === 17) {
    state = {
      ...state,
      schemaVersion: 18,
      roles: state.roles.map((role) => ({
        ...role,
        executor: role.executor ?? "dsh",
      })),
    };
  }
  if (state.schemaVersion === 18) {
    state = {
      ...state,
      schemaVersion: 19,
      projects: state.projects.map((project) => ({
        ...project,
        stage: "development",
      })),
      stageGates: [],
      tasks: state.tasks.map((task) => ({
        ...task,
        requirementRefs: [],
      })),
    };
  }
  if (state.schemaVersion === 19) {
    state = {
      ...state,
      schemaVersion: 20,
      triggers: [],
      threads: [],
    };
  }
  if (state.schemaVersion === 20) {
    state = {
      ...state,
      schemaVersion: 21,
      workshops: [],
    };
  }
  if (state.schemaVersion === 21) {
    state = {
      ...state,
      schemaVersion: 22,
      providerProfiles: [],
      roles: state.roles.map((role) => ({
        ...role,
        providerProfileId: null,
      })),
    };
  }
  if (state.schemaVersion === 22) {
    state = {
      ...state,
      schemaVersion: 23,
      runs: state.runs.map((run) => ({
        ...run,
        providerProfileId: null,
        executor: "dsh",
        provider: null,
      })),
    };
  }
  if (state.schemaVersion === 23) {
    state = {
      ...state,
      schemaVersion: 24,
      projects: state.projects.map((project) => ({
        ...project,
        triggerRules: defaultTriggerRules(),
      })),
    };
  }
  if (state.schemaVersion === 24) {
    state = {
      ...state,
      schemaVersion: 25,
      prototypeDemos: [],
    };
  }
  if (state.schemaVersion === 25) {
    state = {
      ...state,
      schemaVersion: 26,
      workshops: state.workshops.map((workshop) => ({
        ...workshop,
        aiSummary: null,
      })),
    };
  }
  if (state.schemaVersion === 26) {
    state = {
      ...state,
      schemaVersion: 27,
      runs: state.runs.map((run) => ({
        ...run,
        commitSha: null,
        baseSha: null,
      })),
      mergeProposals: state.mergeProposals.map((proposal) => ({
        ...proposal,
        sourceCommit: null,
        baseCommit: null,
        verificationRunId: null,
        reviewId: null,
      })),
    };
  }
  if (state.schemaVersion === 27) {
    state = {
      ...state,
      schemaVersion: 28,
      runs: state.runs.map((run) => ({
        ...run,
        agentPreset: null,
        approvalPolicy: null,
        sandboxMode: null,
        restrictedTools: [],
      })),
    };
  }
  if (state.schemaVersion === 28) {
    state = {
      ...state,
      schemaVersion: 29,
      runs: state.runs.map((run) => ({
        ...run,
        diffPatch: null,
      })),
    };
  }
  if (state.schemaVersion === 29) {
    state = {
      ...state,
      schemaVersion: 30,
      runs: state.runs.map((run) => ({
        ...run,
        outputPath: null,
      })),
    };
  }
  if (state.schemaVersion === 30) {
    state = {
      ...state,
      schemaVersion: 31,
      tasks: state.tasks.map((task) => ({
        ...task,
        timeoutSeconds: null,
        riskTier: "normal",
      })),
    };
  }
  if (state.schemaVersion === 31) {
    state = {
      ...state,
      schemaVersion: 32,
      freezes: [],
      requirementDecisions: [],
      stageGates: state.stageGates.map((gate) => ({
        ...gate,
        freezeId: null,
      })),
    };
  }
  if (state.schemaVersion === 32) {
    state = {
      ...state,
      schemaVersion: 33,
      freezeChangeRequests: [],
    };
  }
  if (state.schemaVersion === 33) {
    state = {
      ...state,
      schemaVersion: 34,
      workshops: state.workshops.map((workshop) => ({
        ...workshop,
        meetingType: "custom",
        agenda: [],
        messages: [],
        sideChats: [],
        minutes: null,
        decisionId: null,
        settledAt: null,
      })),
    };
  }
  if (state.schemaVersion === 34) {
    state = {
      ...state,
      schemaVersion: 35,
      workshops: state.workshops.map((workshop) => ({
        ...workshop,
        participantPerspectives: [],
        freezeId: null,
        minutes:
          workshop.minutes === null
            ? null
            : { ...workshop.minutes, noDisagreementReason: null },
      })),
    };
  }
  if (state.schemaVersion === 35) {
    state = {
      ...state,
      schemaVersion: STUDIO_SCHEMA_VERSION,
      workshops: state.workshops.map((workshop) => ({
        ...workshop,
        linkedTaskId: null,
        linkedChangeRequestId: null,
      })),
    };
  }
  return state;
}

