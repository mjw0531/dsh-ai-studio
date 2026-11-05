import {
  STUDIO_SCHEMA_VERSION,
  isProjectStage,
  isTaskPriority,
  isTaskStatus,
} from "../../shared/types.js";
import type {
  AgentRun,
  AgentRunStatus,
  Branch,
  ContractChange,
  Decision,
  IndependentReview,
  MergeProposal,
  MergeRisk,
  Module,
  Project,
  PrototypeDemo,
  PrototypeDemoResult,
  ProviderProfile,
  Role,
  StageArtifact,
  StageArtifactKind,
  StageCheckItem,
  StageGate,
  StudioState,
  Task,
  Thread,
  Trigger,
  TriggerRules,
  TriggerSource,
  TriggerStatus,
  Verification,
  Workshop,
  WorkshopAiSummary,
  WorkshopNote,
  WorkshopStatus,
} from "../../shared/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTriggerRules(value: unknown): value is TriggerRules {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    Array.isArray(value.sources) &&
    value.sources.every(isTriggerSource) &&
    Array.isArray(value.repos) &&
    value.repos.every((item) => typeof item === "string") &&
    Array.isArray(value.labels) &&
    value.labels.every((item) => typeof item === "string") &&
    Array.isArray(value.authors) &&
    value.authors.every((item) => typeof item === "string") &&
    typeof value.mention === "string"
  );
}

export function isPrototypeDemoResult(
  value: unknown,
): value is PrototypeDemoResult {
  return value === "passed" || value === "failed";
}

function isPrototypeDemo(value: unknown): value is PrototypeDemo {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.title === "string" &&
    typeof value.entry === "string" &&
    typeof value.startCommand === "string" &&
    typeof value.steps === "string" &&
    isPrototypeDemoResult(value.result) &&
    typeof value.screenshotPath === "string" &&
    typeof value.notes === "string" &&
    typeof value.recordedBy === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (value.tokenBudget === null || typeof value.tokenBudget === "number") &&
    (value.repoPath === null || typeof value.repoPath === "string") &&
    (value.prdPath === null ||
      value.prdPath === undefined ||
      typeof value.prdPath === "string") &&
    (value.invariantsPath === null ||
      value.invariantsPath === undefined ||
      typeof value.invariantsPath === "string") &&
    (value.modulesPath === null ||
      value.modulesPath === undefined ||
      typeof value.modulesPath === "string") &&
    isTriggerRules(value.triggerRules) &&
    isProjectStage(value.stage) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isProviderProfile(value: unknown): value is ProviderProfile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.name === "string" &&
    (value.executor === "dsh" ||
      value.executor === "claude-code" ||
      value.executor === "codex") &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    typeof value.note === "string" &&
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
    Array.isArray(value.decisionRights) &&
    (value.providerProfileId === null ||
      typeof value.providerProfileId === "string") &&
    (value.model === null || typeof value.model === "string") &&
    (value.executor === undefined ||
      value.executor === "dsh" ||
      value.executor === "claude-code" ||
      value.executor === "codex") &&
    (value.tokenBudget === null || typeof value.tokenBudget === "number") &&
    (value.dailyTokenBudget === null ||
      typeof value.dailyTokenBudget === "number")
  );
}

function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "timeout"
  );
}

function isAgentRun(value: unknown): value is AgentRun {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.taskId === "string" &&
    (value.roleId === null || typeof value.roleId === "string") &&
    (value.providerProfileId === null ||
      typeof value.providerProfileId === "string") &&
    (value.executor === "dsh" ||
      value.executor === "claude-code" ||
      value.executor === "codex") &&
    (value.provider === null || typeof value.provider === "string") &&
    (value.branchId === null || typeof value.branchId === "string") &&
    (value.branchName === null || typeof value.branchName === "string") &&
    (value.workspacePath === null || typeof value.workspacePath === "string") &&
    (value.commitSha === null ||
      value.commitSha === undefined ||
      typeof value.commitSha === "string") &&
    (value.baseSha === null ||
      value.baseSha === undefined ||
      typeof value.baseSha === "string") &&
    (value.agentPreset === null ||
      value.agentPreset === undefined ||
      typeof value.agentPreset === "string") &&
    (value.approvalPolicy === null ||
      value.approvalPolicy === undefined ||
      value.approvalPolicy === "ask" ||
      value.approvalPolicy === "never") &&
    (value.sandboxMode === null ||
      value.sandboxMode === undefined ||
      value.sandboxMode === "read-only" ||
      value.sandboxMode === "workspace-write" ||
      value.sandboxMode === "danger-full-access") &&
    (Array.isArray(value.restrictedTools) ||
      value.restrictedTools === undefined) &&
    (value.diffPatch === null ||
      value.diffPatch === undefined ||
      typeof value.diffPatch === "string") &&
    (value.outputPath === null ||
      value.outputPath === undefined ||
      typeof value.outputPath === "string") &&
    (value.diffStat === null || typeof value.diffStat === "string") &&
    (value.sessionId === null || typeof value.sessionId === "string") &&
    isAgentRunStatus(value.status) &&
    (value.model === null || typeof value.model === "string") &&
    typeof value.prompt === "string" &&
    typeof value.output === "string" &&
    (value.receipt === null || isRecord(value.receipt)) &&
    (value.tokens === null || typeof value.tokens === "number") &&
    (value.budgetWarning === null ||
      typeof value.budgetWarning === "string") &&
    (value.error === null || typeof value.error === "string") &&
    typeof value.startedAt === "string" &&
    (value.endedAt === null || typeof value.endedAt === "string")
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
    Array.isArray(value.evidence) &&
    (value.verifyCommand === null ||
      value.verifyCommand === undefined ||
      typeof value.verifyCommand === "string") &&
    (value.module === null ||
      value.module === undefined ||
      typeof value.module === "string") &&
    (value.contractRef === null ||
      value.contractRef === undefined ||
      typeof value.contractRef === "string") &&
    Array.isArray(value.requirementRefs) &&
    value.requirementRefs.every((item) => typeof item === "string") &&
    (value.timeoutSeconds === null ||
      value.timeoutSeconds === undefined ||
      (typeof value.timeoutSeconds === "number" &&
        Number.isSafeInteger(value.timeoutSeconds) &&
        value.timeoutSeconds > 0)) &&
    (value.riskTier === undefined ||
      value.riskTier === "trivial" ||
      value.riskTier === "normal" ||
      value.riskTier === "critical") &&
    (value.kind === undefined ||
      value.kind === "new" ||
      value.kind === "fix") &&
    (value.integration === undefined ||
      typeof value.integration === "boolean") &&
    (value.originTaskId === null ||
      value.originTaskId === undefined ||
      typeof value.originTaskId === "string") &&
    (value.docsSynced === undefined ||
      typeof value.docsSynced === "boolean") &&
    (value.diagnosis === undefined ||
      typeof value.diagnosis === "string") &&
    (value.plan === undefined || typeof value.plan === "string")
  );
}

export function isMergeRisk(value: unknown): value is MergeRisk {
  return value === "low" || value === "medium" || value === "high";
}

function isMergeProposal(value: unknown): value is MergeProposal {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.taskId === "string" &&
    typeof value.branch === "string" &&
    typeof value.base === "string" &&
    typeof value.summary === "string" &&
    isMergeRisk(value.risk) &&
    typeof value.rollback === "string" &&
    (value.status === "review" ||
      value.status === "approved" ||
      value.status === "rejected" ||
      value.status === "merged") &&
    typeof value.reviewNote === "string" &&
    (value.mergeCommit === null || typeof value.mergeCommit === "string") &&
    (value.diffStat === null ||
      value.diffStat === undefined ||
      typeof value.diffStat === "string") &&
    (Array.isArray(value.changedFiles) || value.changedFiles === undefined) &&
    (value.sourceCommit === null ||
      value.sourceCommit === undefined ||
      typeof value.sourceCommit === "string") &&
    (value.baseCommit === null ||
      value.baseCommit === undefined ||
      typeof value.baseCommit === "string") &&
    (value.verificationRunId === null ||
      value.verificationRunId === undefined ||
      typeof value.verificationRunId === "string") &&
    (value.reviewId === null ||
      value.reviewId === undefined ||
      typeof value.reviewId === "string") &&
    (value.verificationId === null ||
      value.verificationId === undefined ||
      typeof value.verificationId === "string") &&
    (value.postMergeVerificationId === null ||
      value.postMergeVerificationId === undefined ||
      typeof value.postMergeVerificationId === "string") &&
    (value.rollbackCommit === null ||
      value.rollbackCommit === undefined ||
      typeof value.rollbackCommit === "string") &&
    (value.rolledBackAt === null ||
      value.rolledBackAt === undefined ||
      typeof value.rolledBackAt === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.decidedAt === null || typeof value.decidedAt === "string") &&
    (value.mergedAt === null || typeof value.mergedAt === "string")
  );
}

/**
 * Migrate an older on-disk state. v1 had no merge proposals; the collection is
 * additive, so no task or role rewrite is needed.
 */
function isDecisionStatus(value: unknown): value is Decision["status"] {
  return value === "pending" || value === "approved" || value === "rejected";
}

function isDecision(value: unknown): value is Decision {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    (value.taskId === null || typeof value.taskId === "string") &&
    (value.runId === null || typeof value.runId === "string") &&
    typeof value.title === "string" &&
    typeof value.context === "string" &&
    Array.isArray(value.options) &&
    typeof value.recommendation === "string" &&
    (value.reversible === undefined ||
      typeof value.reversible === "boolean") &&
    (value.adrDraft === null ||
      value.adrDraft === undefined ||
      typeof value.adrDraft === "string") &&
    (value.adrPath === null ||
      value.adrPath === undefined ||
      typeof value.adrPath === "string") &&
    isDecisionStatus(value.status) &&
    typeof value.decision === "string" &&
    typeof value.note === "string" &&
    typeof value.decidedBy === "string" &&
    (value.tokenCost === null || typeof value.tokenCost === "number") &&
    typeof value.createdAt === "string" &&
    (value.decidedAt === null || typeof value.decidedAt === "string")
  );
}

function isProjectFreeze(value: unknown): value is import("../../shared/types.js").ProjectFreeze {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    (value.kind === "prd" || value.kind === "architecture") &&
    typeof value.version === "string" &&
    typeof value.docPath === "string" &&
    typeof value.docHash === "string" &&
    (value.domainModelPath === null || typeof value.domainModelPath === "string") &&
    typeof value.summary === "string" &&
    Array.isArray(value.openQuestions) &&
    value.openQuestions.every((item) => typeof item === "string") &&
    Array.isArray(value.checklist) &&
    value.checklist.every(isStageCheckItem) &&
    (value.waiverReason === null || typeof value.waiverReason === "string") &&
    typeof value.frozenBy === "string" &&
    typeof value.frozenAt === "string"
  );
}

function isRequirementDecision(value: unknown): value is import("../../shared/types.js").RequirementDecision {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    (value.freezeId === null || typeof value.freezeId === "string") &&
    typeof value.title === "string" &&
    typeof value.source === "string" &&
    typeof value.recommendation === "string" &&
    (value.status === "accepted" ||
      value.status === "rejected" ||
      value.status === "pending") &&
    typeof value.rationale === "string" &&
    typeof value.createdAt === "string" &&
    (value.decidedAt === null || typeof value.decidedAt === "string")
  );
}

function isFreezeChangeRequest(value: unknown): value is import("../../shared/types.js").FreezeChangeRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.freezeId === "string" &&
    typeof value.title === "string" &&
    typeof value.reason === "string" &&
    typeof value.impact === "string" &&
    (value.status === "pending" ||
      value.status === "accepted" ||
      value.status === "rejected") &&
    typeof value.createdAt === "string" &&
    (value.decidedAt === null || typeof value.decidedAt === "string")
  );
}

function isStageGateStatus(value: unknown): value is StageGate["status"] {
  return value === "pending" || value === "approved" || value === "rejected";
}

export function isStageArtifactKind(value: unknown): value is StageArtifactKind {
  return (
    value === "prd" ||
    value === "architecture" ||
    value === "demo" ||
    value === "adr" ||
    value === "other"
  );
}

function isStageCheckItem(value: unknown): value is StageCheckItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    typeof value.done === "boolean"
  );
}

function isStageArtifact(value: unknown): value is StageArtifact {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isStageArtifactKind(value.kind) &&
    typeof value.label === "string" &&
    typeof value.path === "string"
  );
}

function isStageGate(value: unknown): value is StageGate {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    isProjectStage(value.stage) &&
    isStageGateStatus(value.status) &&
    Array.isArray(value.checklist) &&
    value.checklist.every(isStageCheckItem) &&
    Array.isArray(value.artifacts) &&
    value.artifacts.every(isStageArtifact) &&
    typeof value.note === "string" &&
    (value.decisionId === null || typeof value.decisionId === "string") &&
    (value.freezeId === null ||
      value.freezeId === undefined ||
      typeof value.freezeId === "string") &&
    typeof value.approvedBy === "string" &&
    (value.approvedAt === null || typeof value.approvedAt === "string") &&
    (value.waiverReason === null || typeof value.waiverReason === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isTriggerSource(value: unknown): value is TriggerSource {
  return (
    value === "manual" ||
    value === "github" ||
    value === "ci" ||
    value === "im" ||
    value === "email"
  );
}

function isTriggerStatus(value: unknown): value is TriggerStatus {
  return value === "pending" || value === "accepted" || value === "ignored";
}

function isTrigger(value: unknown): value is Trigger {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    isTriggerSource(value.source) &&
    typeof value.externalId === "string" &&
    typeof value.threadKey === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.url === "string" &&
    isTriggerStatus(value.status) &&
    (value.taskId === null || typeof value.taskId === "string") &&
    (value.threadId === null || typeof value.threadId === "string") &&
    typeof value.note === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isThread(value: unknown): value is Thread {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.key === "string" &&
    isTriggerSource(value.source) &&
    typeof value.title === "string" &&
    (value.taskId === null || typeof value.taskId === "string") &&
    Array.isArray(value.triggerIds) &&
    value.triggerIds.every((item) => typeof item === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isWorkshopStatus(value: unknown): value is WorkshopStatus {
  return (
    value === "collecting" ||
    value === "settled" ||
    value === "synthesized" ||
    value === "decided" ||
    value === "cancelled"
  );
}

function isWorkshopNote(value: unknown): value is WorkshopNote {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.roleId === "string" &&
    typeof value.roleName === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.objections) &&
    value.objections.every((item) => typeof item === "string") &&
    Array.isArray(value.risks) &&
    value.risks.every((item) => typeof item === "string") &&
    typeof value.recommendation === "string" &&
    typeof value.createdAt === "string"
  );
}

function isWorkshopAiSummary(value: unknown): value is WorkshopAiSummary {
  return (
    isRecord(value) &&
    Array.isArray(value.consensus) &&
    value.consensus.every((item) => typeof item === "string") &&
    Array.isArray(value.disagreements) &&
    value.disagreements.every((item) => typeof item === "string") &&
    Array.isArray(value.openQuestions) &&
    value.openQuestions.every((item) => typeof item === "string") &&
    Array.isArray(value.candidates) &&
    value.candidates.every((item) => typeof item === "string") &&
    typeof value.generatedAt === "string" &&
    (value.model === null || typeof value.model === "string")
  );
}

function isWorkshopMessage(value: unknown): value is import("../../shared/types.js").WorkshopMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.roleId === null || typeof value.roleId === "string") &&
    typeof value.roleName === "string" &&
    (value.kind === "owner" || value.kind === "role" || value.kind === "system") &&
    typeof value.content === "string" &&
    (value.originalContent === null || typeof value.originalContent === "string") &&
    (value.editedAt === null || typeof value.editedAt === "string") &&
    typeof value.createdAt === "string"
  );
}

function isWorkshopAgendaItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    (value.status === "open" ||
      value.status === "closed" ||
      value.status === "deferred")
  );
}

function isWorkshopMinutes(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.consensus) &&
    value.consensus.every((item) => typeof item === "string") &&
    Array.isArray(value.disagreements) &&
    value.disagreements.every((item) => typeof item === "string") &&
    Array.isArray(value.openQuestions) &&
    value.openQuestions.every((item) => typeof item === "string") &&
    typeof value.decisionDraft === "string" &&
    (value.noDisagreementReason === null ||
      typeof value.noDisagreementReason === "string") &&
    typeof value.savedAt === "string" &&
    (value.model === null || typeof value.model === "string") &&
    typeof value.editedByOwner === "boolean"
  );
}

function isWorkshop(value: unknown): value is Workshop {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.title === "string" &&
    typeof value.topic === "string" &&
    isProjectStage(value.stage) &&
    isWorkshopStatus(value.status) &&
    Array.isArray(value.participantRoleIds) &&
    value.participantRoleIds.every((item) => typeof item === "string") &&
    Array.isArray(value.participantPerspectives) &&
    value.participantPerspectives.every(
      (item) =>
        isRecord(item) &&
        typeof item.roleId === "string" &&
        (item.perspective === "experience" ||
          item.perspective === "competitor" ||
          item.perspective === "feasibility" ||
          item.perspective === "contrarian"),
    ) &&
    (value.freezeId === null || typeof value.freezeId === "string") &&
    (value.meetingType === "prd" ||
      value.meetingType === "architecture" ||
      value.meetingType === "balance" ||
      value.meetingType === "custom") &&
    Array.isArray(value.agenda) &&
    value.agenda.every(isWorkshopAgendaItem) &&
    Array.isArray(value.messages) &&
    value.messages.every(isWorkshopMessage) &&
    Array.isArray(value.sideChats) &&
    value.sideChats.every(
      (chat) =>
        isRecord(chat) &&
        typeof chat.roleId === "string" &&
        Array.isArray(chat.messages) &&
        chat.messages.every(isWorkshopMessage) &&
        typeof chat.updatedAt === "string",
    ) &&
    (value.minutes === null || isWorkshopMinutes(value.minutes)) &&
    (value.decisionId === null || typeof value.decisionId === "string") &&
    (value.settledAt === null || typeof value.settledAt === "string") &&
    Array.isArray(value.notes) &&
    value.notes.every(isWorkshopNote) &&
    (value.aiSummary === null || isWorkshopAiSummary(value.aiSummary)) &&
    typeof value.synthesis === "string" &&
    typeof value.decision === "string" &&
    typeof value.decidedBy === "string" &&
    (value.decidedAt === null || typeof value.decidedAt === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isBranchStatus(value: unknown): value is Branch["status"] {
  return (
    value === "open" ||
    value === "review" ||
    value === "merged" ||
    value === "abandoned"
  );
}

function isBranch(value: unknown): value is Branch {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    (value.taskId === null || typeof value.taskId === "string") &&
    typeof value.name === "string" &&
    typeof value.goal === "string" &&
    (value.roleId === null || typeof value.roleId === "string") &&
    Array.isArray(value.contractKeys) &&
    isBranchStatus(value.status) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isContractChange(value: unknown): value is ContractChange {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.branchId === "string" &&
    (value.taskId === null || typeof value.taskId === "string") &&
    (value.runId === null || typeof value.runId === "string") &&
    typeof value.contract === "string" &&
    typeof value.change === "string" &&
    typeof value.createdAt === "string"
  );
}

function isVerification(value: unknown): value is Verification {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.taskId === "string" &&
    (value.runId === null || typeof value.runId === "string") &&
    typeof value.command === "string" &&
    typeof value.workdir === "string" &&
    typeof value.exitCode === "number" &&
    typeof value.output === "string" &&
    typeof value.passed === "boolean" &&
    typeof value.createdAt === "string"
  );
}

function isReview(value: unknown): value is IndependentReview {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.taskId === "string" &&
    (value.runId === null || typeof value.runId === "string") &&
    (value.reviewerRoleId === null ||
      typeof value.reviewerRoleId === "string") &&
    (value.model === null || typeof value.model === "string") &&
    (value.verdict === "pass" || value.verdict === "fail") &&
    typeof value.summary === "string" &&
    Array.isArray(value.findings) &&
    (value.tokens === null || typeof value.tokens === "number") &&
    typeof value.createdAt === "string"
  );
}

function isModule(value: unknown): value is Module {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.name === "string" &&
    typeof value.responsibility === "string" &&
    (value.contractPath === null ||
      typeof value.contractPath === "string") &&
    typeof value.contractText === "string" &&
    Array.isArray(value.allowedPaths) &&
    Array.isArray(value.forbiddenPaths) &&
    Array.isArray(value.dependsOn) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function assertState(value: unknown): asserts value is StudioState {
  if (!isRecord(value)) {
    throw new Error("Studio state must be an object");
  }
  if (value.schemaVersion !== STUDIO_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Studio schema version: ${String(value.schemaVersion)}`,
    );
  }
  if (typeof value.companyName !== "string" || value.companyName.trim() === "") {
    throw new Error("Studio state must contain a companyName");
  }
  if (
    !Array.isArray(value.projects) ||
    !Array.isArray(value.stageGates) ||
    !Array.isArray(value.freezes) ||
    !Array.isArray(value.requirementDecisions) ||
    !Array.isArray(value.freezeChangeRequests) ||
    !Array.isArray(value.triggers) ||
    !Array.isArray(value.threads) ||
    !Array.isArray(value.workshops) ||
    !Array.isArray(value.providerProfiles) ||
    !Array.isArray(value.prototypeDemos) ||
    !Array.isArray(value.roles) ||
    !Array.isArray(value.modules) ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.mergeProposals) ||
    !Array.isArray(value.runs) ||
    !Array.isArray(value.branches) ||
    !Array.isArray(value.contractChanges) ||
    !Array.isArray(value.decisions) ||
    !Array.isArray(value.verifications) ||
    !Array.isArray(value.reviews) ||
    !Array.isArray(value.events)
  ) {
    throw new Error("Studio state collections are missing");
  }
  if (!value.projects.every(isProject)) {
    throw new Error("Studio state contains an invalid project");
  }
  if (!value.freezes.every(isProjectFreeze)) {
    throw new Error("Studio state contains an invalid freeze");
  }
  if (!value.requirementDecisions.every(isRequirementDecision)) {
    throw new Error("Studio state contains an invalid requirement decision");
  }
  if (!value.freezeChangeRequests.every(isFreezeChangeRequest)) {
    throw new Error("Studio state contains an invalid freeze change request");
  }
  if (!value.stageGates.every(isStageGate)) {
    throw new Error("Studio state contains an invalid stage gate");
  }
  if (!value.triggers.every(isTrigger)) {
    throw new Error("Studio state contains an invalid trigger");
  }
  if (!value.threads.every(isThread)) {
    throw new Error("Studio state contains an invalid thread");
  }
  if (!value.workshops.every(isWorkshop)) {
    throw new Error("Studio state contains an invalid workshop");
  }
  if (!value.providerProfiles.every(isProviderProfile)) {
    throw new Error("Studio state contains an invalid provider profile");
  }
  if (!value.prototypeDemos.every(isPrototypeDemo)) {
    throw new Error("Studio state contains an invalid prototype demo");
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

