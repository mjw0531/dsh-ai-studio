/**
 * Studio 的跨端领域类型与纯规则。
 *
 * 这个文件同时被 Host 和浏览器端引用，所以不能引入任何 Node 或浏览器专属 API。
 */

export const STUDIO_SCHEMA_VERSION = 2;
export const STUDIO_PLUGIN_VERSION = "0.3.0";

export type TaskStatus =
  | "backlog"
  | "ready"
  | "running"
  | "blocked"
  | "review"
  | "done";

export type TaskPriority = "P0" | "P1" | "P2";

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  mergedAt: string | null;
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
  createdAt: string;
  updatedAt: string;
  activeProjectId: string | null;
  projects: Project[];
  roles: Role[];
  tasks: Task[];
  mergeProposals: MergeProposal[];
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
  | "project_setup";
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
}

export interface CompanySummary {
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
  tasks: Task[];
  mergeProposals: MergeProposal[];
  stats: StudioStats;
  events: StudioEvent[];
  company: CompanySummary;
  features: {
    independentPage: boolean;
    filePersistence: boolean;
    mergeGovernance: boolean;
    ownerDashboard: boolean;
    agentExecution: boolean;
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
}

export interface CreateRoleInput {
  name: string;
  title?: string;
  mission?: string;
  responsibilities?: string[];
  nonGoals?: string[];
  decisionRights?: string[];
}

export interface CreateTaskInput {
  title: string;
  goal?: string;
  priority?: TaskPriority;
  ownerRoleId?: string | null;
  reviewerRoleId?: string | null;
  acceptance?: string[];
  branch?: string | null;
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
