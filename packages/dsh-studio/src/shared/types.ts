/**
 * Studio 的跨端领域类型与纯规则。
 *
 * 这个文件同时被 Host 和浏览器端引用，所以不能引入任何 Node 或浏览器专属 API。
 */

export const STUDIO_SCHEMA_VERSION = 18;
export const STUDIO_PLUGIN_VERSION = "2.5.1";

export type TaskStatus =
  | "backlog"
  | "ready"
  | "running"
  | "blocked"
  | "review"
  | "done";

export type TaskPriority = "P0" | "P1" | "P2";
export type TaskKind = "new" | "fix";

export interface Project {
  id: string;
  name: string;
  description: string;
  tokenBudget: number | null;
  repoPath: string | null;
  prdPath: string | null;
  invariantsPath: string | null;
  modulesPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentExecutor = "dsh" | "claude-code" | "codex";

export const AGENT_EXECUTOR_LABELS: Record<AgentExecutor, string> = {
  dsh: "DSH Agent",
  "claude-code": "Claude Code",
  codex: "Codex CLI",
};

export interface Role {
  id: string;
  projectId: string;
  name: string;
  title: string;
  mission: string;
  responsibilities: string[];
  nonGoals: string[];
  decisionRights: string[];
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
  verificationId: string | null;
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
  branchId: string | null;
  branchName: string | null;
  workspacePath: string | null;
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

export interface CompanySummary {
  name: string;
  totals: CompanyTotals;
  projects: CompanyProjectSummary[];
  needs: OwnerNeed[];
  roles: RoleLoadSummary[];
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
