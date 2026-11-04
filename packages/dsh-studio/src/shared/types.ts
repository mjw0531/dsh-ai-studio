/**
 * Studio 的跨端领域类型与纯规则。
 *
 * 这个文件同时被 Host 和浏览器端引用，所以不能引入任何 Node 或浏览器专属 API。
 */

export const STUDIO_SCHEMA_VERSION = 27;
export const STUDIO_PLUGIN_VERSION = "3.3.0";

export type TaskStatus =
  | "backlog"
  | "ready"
  | "running"
  | "blocked"
  | "review"
  | "done";

export type TaskPriority = "P0" | "P1" | "P2";
export type TaskKind = "new" | "fix";

export type ProjectStage =
  | "discovery"
  | "architecture"
  | "prototype"
  | "development";

export const PROJECT_STAGE_ORDER: ProjectStage[] = [
  "discovery",
  "architecture",
  "prototype",
  "development",
];

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  discovery: "需求探索",
  architecture: "架构设计",
  prototype: "原型验证",
  development: "持续开发",
};

export function isProjectStage(value: unknown): value is ProjectStage {
  return (
    typeof value === "string" &&
    (PROJECT_STAGE_ORDER as string[]).includes(value)
  );
}

export function nextProjectStage(stage: ProjectStage): ProjectStage | null {
  const index = PROJECT_STAGE_ORDER.indexOf(stage);
  return index < 0 || index === PROJECT_STAGE_ORDER.length - 1
    ? null
    : (PROJECT_STAGE_ORDER[index + 1] ?? null);
}

export type StageGateStatus = "pending" | "approved" | "rejected";
export type StageArtifactKind = "prd" | "architecture" | "demo" | "adr" | "other";

export interface StageCheckItem {
  id: string;
  text: string;
  done: boolean;
}

export interface StageArtifact {
  id: string;
  kind: StageArtifactKind;
  label: string;
  path: string;
}

/**
 * A gate approves entry into `stage`. The project's current stage stays put
 * until the Owner approves the gate.
 */
export interface StageGate {
  id: string;
  projectId: string;
  stage: ProjectStage;
  status: StageGateStatus;
  checklist: StageCheckItem[];
  artifacts: StageArtifact[];
  note: string;
  decisionId: string | null;
  approvedBy: string;
  approvedAt: string | null;
  waiverReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateStageGateInput {
  checklist?: StageCheckItem[];
  artifacts?: StageArtifact[];
  note?: string;
}

export interface ApproveStageGateInput extends UpdateStageGateInput {
  waiverReason?: string;
}

export type TriggerSource = "manual" | "github" | "ci" | "im" | "email";
export type TriggerStatus = "pending" | "accepted" | "ignored";

export const TRIGGER_SOURCE_LABELS: Record<TriggerSource, string> = {
  manual: "手动",
  github: "GitHub",
  ci: "CI",
  im: "IM",
  email: "邮件",
};

export const TRIGGER_STATUS_LABELS: Record<TriggerStatus, string> = {
  pending: "待处理",
  accepted: "已转任务",
  ignored: "已忽略",
};

export interface Trigger {
  id: string;
  projectId: string;
  source: TriggerSource;
  externalId: string;
  threadKey: string;
  title: string;
  body: string;
  url: string;
  status: TriggerStatus;
  taskId: string | null;
  threadId: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  projectId: string;
  key: string;
  source: TriggerSource;
  title: string;
  taskId: string | null;
  triggerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type WorkshopStatus =
  | "collecting"
  | "synthesized"
  | "decided"
  | "cancelled";

export interface WorkshopNote {
  id: string;
  roleId: string;
  roleName: string;
  summary: string;
  objections: string[];
  risks: string[];
  recommendation: string;
  createdAt: string;
}

export interface WorkshopAiSummary {
  consensus: string[];
  disagreements: string[];
  openQuestions: string[];
  candidates: string[];
  generatedAt: string;
  model: string | null;
}

export interface Workshop {
  id: string;
  projectId: string;
  title: string;
  topic: string;
  stage: ProjectStage;
  status: WorkshopStatus;
  participantRoleIds: string[];
  notes: WorkshopNote[];
  aiSummary: WorkshopAiSummary | null;
  synthesis: string;
  decision: string;
  decidedBy: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkshopInput {
  title: string;
  topic?: string;
  stage?: ProjectStage;
  participantRoleIds?: string[];
}

export interface AddWorkshopNoteInput {
  roleId: string;
  summary: string;
  objections?: string[];
  risks?: string[];
  recommendation?: string;
}

export interface WebhookIngestResult {
  accepted: boolean;
  reason: string;
  trigger: Trigger | null;
}

export interface CreateTriggerInput {
  source: TriggerSource;
  externalId?: string;
  threadKey?: string;
  title: string;
  body?: string;
  url?: string;
}

export interface AcceptTriggerInput {
  acceptance?: string[];
  ownerRoleId?: string | null;
  reviewerRoleId?: string | null;
  priority?: TaskPriority;
}

export interface TriggerRules {
  enabled: boolean;
  sources: TriggerSource[];
  repos: string[];
  labels: string[];
  authors: string[];
  mention: string;
}

export interface UpdateTriggerRulesInput {
  enabled?: boolean;
  sources?: TriggerSource[];
  repos?: string[];
  labels?: string[];
  authors?: string[];
  mention?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  tokenBudget: number | null;
  repoPath: string | null;
  prdPath: string | null;
  invariantsPath: string | null;
  modulesPath: string | null;
  triggerRules: TriggerRules;
  stage: ProjectStage;
  createdAt: string;
  updatedAt: string;
}

export type AgentExecutor = "dsh" | "claude-code" | "codex";

export const AGENT_EXECUTOR_LABELS: Record<AgentExecutor, string> = {
  dsh: "DSH Agent",
  "claude-code": "Claude Code",
  codex: "Codex CLI",
};

export interface ProviderProfile {
  id: string;
  projectId: string;
  name: string;
  executor: AgentExecutor;
  /** DSH provider id; empty means auto-select. */
  provider: string;
  /** Exact model id; empty means the provider default. */
  model: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderProfileInput {
  name: string;
  executor?: AgentExecutor;
  provider?: string;
  model?: string;
  note?: string;
}

export type UpdateProviderProfileInput = Partial<CreateProviderProfileInput>;

export type ProviderHealthState = "healthy" | "degraded" | "unknown";

export type ProviderFailureReason =
  | "receipt"
  | "timeout"
  | "provider"
  | "task"
  | "unknown";

export interface ProviderFailureCount {
  reason: ProviderFailureReason;
  count: number;
}

export interface ProviderRecentRun {
  id: string;
  status: "succeeded" | "failed" | "running" | "queued";
  model: string | null;
  startedAt: string;
  endedAt: string | null;
  errorPreview: string | null;
}

export type PrototypeDemoResult = "passed" | "failed";

export interface PrototypeDemo {
  id: string;
  projectId: string;
  title: string;
  entry: string;
  startCommand: string;
  steps: string;
  result: PrototypeDemoResult;
  screenshotPath: string;
  notes: string;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePrototypeDemoInput {
  title: string;
  entry?: string;
  startCommand?: string;
  steps?: string;
  result: PrototypeDemoResult;
  screenshotPath?: string;
  notes?: string;
}

export type UpdatePrototypeDemoInput = Partial<CreatePrototypeDemoInput>;

export interface ProviderProbeResult {
  profileId: string;
  executor: AgentExecutor;
  provider: string;
  model: string;
  ok: boolean;
  checkedAt: string;
  message: string;
  availableModels: string[];
}

export interface ProviderProfileHealth {
  profileId: string;
  runCount: number;
  successCount: number;
  failCount: number;
  failureRate: number;
  failuresByReason: ProviderFailureCount[];
  recentRuns: ProviderRecentRun[];
  suggestedProfileId: string | null;
  tokens: number;
  lastRunAt: string | null;
  lastError: string | null;
  state: ProviderHealthState;
}

export interface Role {
  id: string;
  projectId: string;
  name: string;
  title: string;
  mission: string;
  responsibilities: string[];
  nonGoals: string[];
  decisionRights: string[];
  /** Named provider profile; null keeps the inline model/executor fields. */
  providerProfileId: string | null;
  /** Exact model id, or null to inherit the deployment default. */
  model: string | null;
  /** Which runtime executes this role. */
  executor: AgentExecutor;
  /** Per-run token budget; null means inherit the project budget. */
  tokenBudget: number | null;
  /** Per-UTC-day token budget for this role; null means unlimited. */
  dailyTokenBudget: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
  responsibility: string;
  contractPath: string | null;
  contractText: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AcceptanceItem {
  id: string;
  text: string;
  done: boolean;
}

export interface EvidenceItem {
  id: string;
  text: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  goal: string;
  status: TaskStatus;
  priority: TaskPriority;
  ownerRoleId: string | null;
  reviewerRoleId: string | null;
  acceptance: AcceptanceItem[];
  evidence: EvidenceItem[];
  branch: string | null;
  verifyCommand: string | null;
  module: string | null;
  contractRef: string | null;
  requirementRefs: string[];
  kind: TaskKind;
  diagnosis: string;
  plan: string;
  integration: boolean;
  originTaskId: string | null;
  docsSynced: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReviewVerdict = "pass" | "fail";

export interface IndependentReview {
  id: string;
  projectId: string;
  taskId: string;
  runId: string | null;
  reviewerRoleId: string | null;
  model: string | null;
  verdict: ReviewVerdict;
  summary: string;
  findings: string[];
  tokens: number | null;
  createdAt: string;
}

export interface Verification {
  id: string;
  projectId: string;
  taskId: string;
  runId: string | null;
  command: string;
  workdir: string;
  exitCode: number;
  output: string;
  passed: boolean;
  createdAt: string;
}

export type MergeRisk = "low" | "medium" | "high";
export type MergeStatus = "review" | "approved" | "rejected" | "merged";

export interface MergeProposal {
  id: string;
  projectId: string;
  taskId: string;
  branch: string;
  base: string;
  summary: string;
  risk: MergeRisk;
  rollback: string;
  status: MergeStatus;
  reviewNote: string;
  mergeCommit: string | null;
  diffStat: string | null;
  changedFiles: string[];
  sourceCommit: string | null;
  baseCommit: string | null;
  verificationId: string | null;
  verificationRunId: string | null;
  reviewId: string | null;
  postMergeVerificationId: string | null;
  rollbackCommit: string | null;
  rolledBackAt: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  mergedAt: string | null;
}

export type AgentRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface AgentReceiptArtifact {
  kind: string;
  path: string;
}

export interface AgentReceiptDecision {
  title: string;
  rationale: string;
  scope: "branch" | "project";
}

export interface AgentReceiptContractDelta {
  contract: string;
  change: string;
}

export interface AgentReceiptRejectedOption {
  option: string;
  reason: string;
}

export interface AgentReceipt {
  summary: string;
  evidence: string[];
  artifacts: AgentReceiptArtifact[];
  decisions: AgentReceiptDecision[];
  contractDeltas: AgentReceiptContractDelta[];
  rejectedOptions: AgentReceiptRejectedOption[];
  blockers: string[];
}

export interface AgentRun {
  id: string;
  projectId: string;
  taskId: string;
  roleId: string | null;
  providerProfileId: string | null;
  executor: AgentExecutor;
  provider: string | null;
  branchId: string | null;
  branchName: string | null;
  workspacePath: string | null;
  commitSha: string | null;
  baseSha: string | null;
  diffStat: string | null;
  sessionId: string | null;
  status: AgentRunStatus;
  model: string | null;
  prompt: string;
  output: string;
  receipt: AgentReceipt | null;
  tokens: number | null;
  budgetWarning: string | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}

export type BranchStatus = "open" | "review" | "merged" | "abandoned";

export interface Branch {
  id: string;
  projectId: string;
  taskId: string | null;
  name: string;
  goal: string;
  roleId: string | null;
  contractKeys: string[];
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContractChange {
  id: string;
  projectId: string;
  branchId: string;
  taskId: string | null;
  runId: string | null;
  contract: string;
  change: string;
  createdAt: string;
}

export type DecisionStatus = "pending" | "approved" | "rejected";

export interface DecisionOption {
  label: string;
  tradeoff: string;
}

export interface Decision {
  id: string;
  projectId: string;
  taskId: string | null;
  runId: string | null;
  title: string;
  context: string;
  options: DecisionOption[];
  recommendation: string;
  reversible: boolean;
  adrDraft: string | null;
  adrPath: string | null;
  status: DecisionStatus;
  decision: string;
  note: string;
  decidedBy: string;
  tokenCost: number | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface StudioEvent {
  id: string;
  type: string;
  at: string;
  actor: string;
  projectId: string | null;
  taskId: string | null;
  payload: Record<string, unknown>;
}

export interface StudioState {
  schemaVersion: number;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  activeProjectId: string | null;
  projects: Project[];
  stageGates: StageGate[];
  triggers: Trigger[];
  threads: Thread[];
  workshops: Workshop[];
  providerProfiles: ProviderProfile[];
  prototypeDemos: PrototypeDemo[];
  roles: Role[];
  modules: Module[];
  tasks: Task[];
  mergeProposals: MergeProposal[];
  runs: AgentRun[];
  branches: Branch[];
  contractChanges: ContractChange[];
  decisions: Decision[];
  verifications: Verification[];
  reviews: IndependentReview[];
  events: StudioEvent[];
}

export interface ProjectSlice {
  schemaVersion: number;
  project: Project;
  stageGates: StageGate[];
  triggers: Trigger[];
  threads: Thread[];
  workshops: Workshop[];
  providerProfiles: ProviderProfile[];
  prototypeDemos: PrototypeDemo[];
  roles: Role[];
  modules: Module[];
  tasks: Task[];
  mergeProposals: MergeProposal[];
  runs: AgentRun[];
  branches: Branch[];
  contractChanges: ContractChange[];
  decisions: Decision[];
  verifications: Verification[];
  reviews: IndependentReview[];
  events: StudioEvent[];
}

export interface StudioStats {
  total: number;
  backlog: number;
  ready: number;
  running: number;
  blocked: number;
  review: number;
  done: number;
  acceptanceDone: number;
  acceptanceTotal: number;
  mergeReview: number;
  mergeApproved: number;
  mergeMerged: number;
}

export type CompanyHealth = "steady" | "attention" | "critical";
export type OwnerNeedKind =
  | "merge_review"
  | "merge_approved"
  | "task_review"
  | "task_blocked"
  | "missing_evidence"
  | "stale_task"
  | "unowned_task"
  | "project_setup"
  | "decision";
export type OwnerNeedSeverity = "critical" | "warning" | "info";

export interface OwnerNeed {
  id: string;
  kind: OwnerNeedKind;
  severity: OwnerNeedSeverity;
  projectId: string;
  projectName: string;
  taskId: string | null;
  proposalId: string | null;
  title: string;
  detail: string;
  ageHours: number | null;
}

export interface CompanyProjectSummary {
  project: Project;
  stats: StudioStats;
  roleCount: number;
  activeRoleCount: number;
  openTasks: number;
  health: CompanyHealth;
  lastActivityAt: string | null;
  openNeeds: number;
}

export interface RoleLoadSummary {
  roleId: string;
  roleName: string;
  roleTitle: string;
  projectId: string;
  projectName: string;
  activeTasks: number;
  reviewTasks: number;
  openTasks: number;
  state: "idle" | "busy" | "overloaded";
}

export interface CompanyRisk {
  staleTasks: number;
  agingMerges: number;
  missingEvidence: number;
  blocked: number;
  unowned: number;
}

export interface CompanyTotals {
  projects: number;
  activeProjects: number;
  tasks: number;
  openTasks: number;
  inReview: number;
  blocked: number;
  mergePending: number;
  merged: number;
  done: number;
  acceptanceDone: number;
  acceptanceTotal: number;
  runs: number;
  runningRuns: number;
  tokensUsed: number;
  pendingDecisions: number;
  decidedDecisions: number;
}

export interface CompanyBudget {
  totalBudget: number | null;
  totalSpent: number;
  overBudgetProjects: number;
  unbudgetedProjects: number;
}

export interface CompanyPriority {
  taskId: string;
  projectId: string;
  projectName: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  ownerName: string;
  ageHours: number | null;
}

export interface RoleCoverage {
  roleName: string;
  projects: number;
  activeTasks: number;
}

export interface CompanySummary {
  name: string;
  totals: CompanyTotals;
  projects: CompanyProjectSummary[];
  needs: OwnerNeed[];
  roles: RoleLoadSummary[];
  budget: CompanyBudget;
  priorities: CompanyPriority[];
  roleCoverage: RoleCoverage[];
  risk: CompanyRisk;
  recentEvents: StudioEvent[];
  generatedAt: string;
}

export interface BootstrapResponse {
  app: {
    pluginVersion: string;
    dshVersion: string;
    compatibility: CompatibilityInfo;
    dataDir: string;
    schemaVersion: number;
    serverTime: string;
    warning?: string | null;
  };
  projects: Project[];
  activeProjectId: string | null;
  project: Project | null;
  stageGates: StageGate[];
  triggers: Trigger[];
  threads: Thread[];
  workshops: Workshop[];
  providerProfiles: ProviderProfile[];
  providerHealth: ProviderProfileHealth[];
  prototypeDemos: PrototypeDemo[];
  roles: Role[];
  modules: Module[];
  tasks: Task[];
  mergeProposals: MergeProposal[];
  runs: AgentRun[];
  branches: Branch[];
  contractChanges: ContractChange[];
  decisions: Decision[];
  verifications: Verification[];
  reviews: IndependentReview[];
  stats: StudioStats;
  events: StudioEvent[];
  company: CompanySummary;
  features: {
    independentPage: boolean;
    filePersistence: boolean;
    mergeGovernance: boolean;
    ownerDashboard: boolean;
    agentExecution: boolean;
    decisionBoard: boolean;
    branchBoard: boolean;
    codeExecution: boolean;
    verification: boolean;
    knowledge: boolean;
    contractGuard: boolean;
    independentReview: boolean;
    mergeExecution: boolean;
    gitMerge: boolean;
    stageGate: boolean;
    triggerInbox: boolean;
    triggerWebhook: boolean;
    workshop: boolean;
    providerProfiles: boolean;
    providerHealth: boolean;
    prototypeDemoRecord: boolean;
    projectTemplates: boolean;
    onboarding: boolean;
  };
}

export interface CompatibilityInfo {
  status: "supported" | "untested" | "unknown";
  testedWith: string;
  message: string;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "待规划",
  ready: "可开始",
  running: "进行中",
  blocked: "已阻塞",
  review: "待验收",
  done: "已完成",
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "backlog",
  "ready",
  "running",
  "blocked",
  "review",
  "done",
];

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  new: "新建型",
  fix: "改修型",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  P0: "P0 紧急",
  P1: "P1 重要",
  P2: "P2 普通",
};

export const MERGE_STATUS_LABELS: Record<MergeStatus, string> = {
  review: "待评审",
  approved: "已批准",
  rejected: "已打回",
  merged: "已合并",
};

export const MERGE_RISK_LABELS: Record<MergeRisk, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

export const MERGE_STATUS_ORDER: MergeStatus[] = [
  "review",
  "approved",
  "rejected",
  "merged",
];

export const COMPANY_HEALTH_LABELS: Record<CompanyHealth, string> = {
  steady: "稳态",
  attention: "需关注",
  critical: "有阻塞",
};

export const ROLE_LOAD_LABELS: Record<RoleLoadSummary["state"], string> = {
  idle: "空闲",
  busy: "在忙",
  overloaded: "过载",
};

export const AGENT_RUN_STATUS_LABELS: Record<AgentRunStatus, string> = {
  queued: "排队中",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
};

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  pending: "待裁决",
  approved: "已批准",
  rejected: "已拒绝",
};

export const BRANCH_STATUS_LABELS: Record<BranchStatus, string> = {
  open: "进行中",
  review: "待汇入",
  merged: "已汇入",
  abandoned: "已放弃",
};

/**
 * 允许的任务状态迁移。Agent 永远不能自己把任务推进到 done：
 * done 必须经过验收检查。
 */
export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ["ready"],
  ready: ["backlog", "running"],
  running: ["ready", "blocked", "review"],
  blocked: ["ready", "running"],
  review: ["running", "blocked", "done"],
  done: [],
};

export const TRANSITION_LABELS: Record<TaskStatus, string> = {
  backlog: "退回待规划",
  ready: "标记可开始",
  running: "开始执行",
  blocked: "标记阻塞",
  review: "提交验收",
  done: "验收通过",
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" &&
    (TASK_STATUS_ORDER as string[]).includes(value)
  );
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "P0" || value === "P1" || value === "P2";
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  tokenBudget?: number | null;
  repoPath?: string | null;
}

export type ProjectTemplateId = "web" | "game" | "tool";

export interface CreateProjectFromTemplateInput {
  template: ProjectTemplateId;
  name: string;
  description?: string;
  repoPath?: string | null;
}

export interface UpdateProjectInput {
  repoPath?: string | null;
  prdPath?: string | null;
  invariantsPath?: string | null;
  modulesPath?: string | null;
}

export interface CreateModuleInput {
  name: string;
  responsibility?: string;
  contractPath?: string | null;
  contractText?: string;
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  dependsOn?: string[];
}

export interface UpdateModuleInput {
  responsibility?: string;
  contractPath?: string | null;
  contractText?: string;
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  dependsOn?: string[];
}

export interface ProjectDoc {
  kind: "prd" | "invariants" | "modules" | "custom";
  path: string;
  content: string;
  truncated: boolean;
  exists: boolean;
}

export interface CreateRoleInput {
  name: string;
  title?: string;
  mission?: string;
  responsibilities?: string[];
  nonGoals?: string[];
  decisionRights?: string[];
  providerProfileId?: string | null;
  model?: string | null;
  executor?: AgentExecutor;
  tokenBudget?: number | null;
  dailyTokenBudget?: number | null;
}

export interface CreateTaskInput {
  title: string;
  goal?: string;
  priority?: TaskPriority;
  ownerRoleId?: string | null;
  reviewerRoleId?: string | null;
  acceptance?: string[];
  branch?: string | null;
  verifyCommand?: string | null;
  module?: string | null;
  contractRef?: string | null;
  requirementRefs?: string[];
  kind?: TaskKind;
  diagnosis?: string;
  plan?: string;
  integration?: boolean;
  originTaskId?: string | null;
}

export interface VerifyTaskInput {
  command?: string;
}

export interface UpdateTaskInput {
  title?: string;
  goal?: string;
  priority?: TaskPriority;
  ownerRoleId?: string | null;
  reviewerRoleId?: string | null;
  acceptance?: AcceptanceItem[];
  evidence?: EvidenceItem[];
  branch?: string | null;
  verifyCommand?: string | null;
  module?: string | null;
  contractRef?: string | null;
  requirementRefs?: string[];
  kind?: TaskKind;
  diagnosis?: string;
  plan?: string;
  integration?: boolean;
  docsSynced?: boolean;
}

export interface TransitionTaskInput {
  status: TaskStatus;
}

export interface CreateMergeProposalInput {
  summary: string;
  rollback: string;
  risk?: MergeRisk;
  base?: string;
  branch?: string;
}

export interface CreateDecisionInput {
  title: string;
  context?: string;
  recommendation?: string;
  taskId?: string | null;
  reversible?: boolean;
}

export interface DecideDecisionInput {
  status: "approved" | "rejected";
  decision?: string;
  note?: string;
}

export interface MergeProposalNoteInput {
  note?: string;
}

export interface MergeProposalCompleteInput {
  mergeCommit?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
