import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";

import {
  AGENT_EXECUTOR_LABELS,
  AGENT_RUN_STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  BRANCH_STATUS_LABELS,
  COMPANY_HEALTH_LABELS,
  DECISION_STATUS_LABELS,
  MERGE_RISK_LABELS,
  MERGE_STATUS_LABELS,
  PRIORITY_LABELS,
  ROLE_LOAD_LABELS,
  TASK_KIND_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TRANSITION_LABELS,
} from "../shared/types.js";
import type {
  AgentReceipt,
  AgentExecutor,
  AgentRun,
  BootstrapResponse,
  Branch,
  CompanyHealth,
  ContractChange,
  CompanyProjectSummary,
  CreateDecisionInput,
  CreateModuleInput,
  DecideDecisionInput,
  Decision,
  IndependentReview,
  Module,
  Project,
  ProjectDoc,
  CreateMergeProposalInput,
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  MergeProposal,
  MergeRisk,
  OwnerNeed,
  Role,
  RoleLoadSummary,
  Task,
  TaskKind,
  TaskPriority,
  TaskStatus,
  Verification,
} from "../shared/types.js";
import {
  readStudioBoot,
  resolveStudioBoot,
  StudioClient,
  StudioClientError,
} from "./api.js";
import type { StudioBoot } from "./api.js";
import {
  IconAlert,
  IconBuilding,
  IconCheck,
  IconChevronRight,
  IconGitMerge,
  IconGrid,
  IconKanban,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSpark,
  IconSun,
  IconUsers,
  IconX,
} from "./icons.js";

type Tab =
  | "company"
  | "boardroom"
  | "knowledge"
  | "mission"
  | "tasks"
  | "merges"
  | "team"
  | "settings";
type ModalState =
  | { kind: "task" }
  | { kind: "role" }
  | { kind: "project" }
  | { kind: "decision" }
  | { kind: "module" }
  | { kind: "repo" }
  | null;

type ToastState = { kind: "ok" | "error"; text: string } | null;

interface NavItem {
  id: Tab;
  label: string;
  caption: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "company", label: "公司", caption: "Owner Dashboard" },
  { id: "boardroom", label: "决策台", caption: "Decision Desk" },
  { id: "knowledge", label: "知识", caption: "PRD / Modules" },
  { id: "mission", label: "项目", caption: "Mission Control" },
  { id: "tasks", label: "任务", caption: "Task Board" },
  { id: "merges", label: "合并", caption: "Merge Queue" },
  { id: "team", label: "团队", caption: "Roles" },
  { id: "settings", label: "设置", caption: "Runtime" },
];

function errorText(error: unknown): string {
  if (error instanceof StudioClientError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "??";
}

function acceptanceDone(task: Task): number {
  return task.acceptance.filter((item) => item.done).length;
}

function allAccepted(task: Task): boolean {
  return (
    task.acceptance.length > 0 &&
    task.acceptance.every((item) => item.done)
  );
}

function roleName(roles: Role[], id: string | null): string {
  if (id === null) return "未指派";
  return roles.find((role) => role.id === id)?.name ?? "未知角色";
}

function roleTitle(roles: Role[], id: string | null): string {
  if (id === null) return "";
  return roles.find((role) => role.id === id)?.title ?? "";
}

function NavIcon({ tab }: { tab: Tab }) {
  switch (tab) {
    case "company":
      return <IconBuilding width={15} height={15} />;
    case "boardroom":
      return <IconSpark width={15} height={15} />;
    case "knowledge":
      return <IconGrid width={15} height={15} />;
    case "mission":
      return <IconGrid width={15} height={15} />;
    case "tasks":
      return <IconKanban width={15} height={15} />;
    case "merges":
      return <IconGitMerge width={15} height={15} />;
    case "team":
      return <IconUsers width={15} height={15} />;
    case "settings":
      return <IconSettings width={15} height={15} />;
  }
}

function StatusPill({ status }: { status: TaskStatus }) {
  const tone =
    status === "done"
      ? "ok"
      : status === "review"
        ? "accent"
        : status === "blocked"
          ? "p0"
          : "p2";
  return (
    <span className="studio-pill" data-tone={tone}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

function PriorityPill({ priority }: { priority: TaskPriority }) {
  return (
    <span className="studio-pill" data-tone={priority.toLowerCase()}>
      {priority}
    </span>
  );
}

function mergeTone(status: MergeProposal["status"]): string {
  if (status === "merged") return "ok";
  if (status === "approved") return "p1";
  if (status === "rejected") return "p0";
  return "accent";
}

function MergePill({ proposal }: { proposal: MergeProposal }) {
  return (
    <span className="studio-pill" data-tone={mergeTone(proposal.status)}>
      <IconGitMerge width={10} height={10} />
      {MERGE_STATUS_LABELS[proposal.status]}
    </span>
  );
}

function latestMergeForTask(
  proposals: MergeProposal[],
  taskId: string,
): MergeProposal | null {
  const matching = proposals
    .filter((proposal) => proposal.taskId === taskId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return (
    matching.find((proposal) => proposal.status !== "rejected") ??
    matching[0] ??
    null
  );
}

function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "warn" | "ok" | "danger";
}) {
  return (
    <div className="studio-stat" data-tone={tone}>
      <div className="studio-stat-label">{label}</div>
      <div className="studio-stat-value">{value}</div>
      <div className="studio-stat-note">{note}</div>
    </div>
  );
}

export function StudioPage() {
  const initialBoot = useMemo(() => readStudioBoot(), []);
  const [boot, setBoot] = useState<StudioBoot | null>(initialBoot);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootChecked, setBootChecked] = useState(initialBoot !== null);
  const client = useMemo(
    () => (boot === null ? null : new StudioClient(boot)),
    [boot],
  );
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("company");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem("studio.theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("studio.theme", theme);
    } catch {
      // Theme persistence is best-effort; the page still works without it.
    }
  }, [theme]);

  useEffect(() => {
    if (boot !== null || bootChecked) return;
    let cancelled = false;
    void resolveStudioBoot().then((result) => {
      if (cancelled) return;
      setBoot(result.boot);
      setBootError(result.error);
      setBootChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [boot, bootChecked]);

  const load = useCallback(
    async (projectId?: string, silent = false): Promise<void> => {
      if (client === null) return;
      if (!silent) setLoading(true);
      try {
        const next = await client.bootstrap(projectId);
        if (
          (next as BootstrapResponse & { company?: unknown }).company ===
          undefined
        ) {
          throw new StudioClientError(
            "host_outdated",
            "Studio Host 还是旧版本，缺少公司仪表盘数据。请完全退出并重启 DSH，再打开工作台。",
          );
        }
        setData(next);
        setError(null);
      } catch (cause) {
        setError(errorText(cause));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (client === null) {
      setLoading(false);
      return;
    }
    void load();
  }, [client, load]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (selectedTaskId !== null) setSelectedTaskId(null);
      else if (modal !== null) setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTaskId, modal]);

  const run = useCallback(
    async (
      action: () => Promise<unknown>,
      successMessage: string,
    ): Promise<boolean> => {
      if (client === null) return false;
      setBusy(true);
      try {
        await action();
        await load(undefined, true);
        setToast({ kind: "ok", text: successMessage });
        return true;
      } catch (cause) {
        setToast({ kind: "error", text: errorText(cause) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [client, load],
  );

  const selectProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      if (client === null) return false;
      setBusy(true);
      try {
        await client.selectProject(projectId);
        await load(projectId, true);
        return true;
      } catch (cause) {
        setToast({ kind: "error", text: errorText(cause) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [client, load],
  );

  const openCompanyProject = useCallback(
    async (projectId: string): Promise<void> => {
      if (projectId !== data?.activeProjectId) {
        const ok = await selectProject(projectId);
        if (!ok) return;
      }
      setTab("mission");
    },
    [data?.activeProjectId, selectProject],
  );

  const openCompanyNeed = useCallback(
    async (need: OwnerNeed): Promise<void> => {
      if (need.projectId !== data?.activeProjectId) {
        const ok = await selectProject(need.projectId);
        if (!ok) return;
      }
      if (need.kind === "decision") {
        setTab("boardroom");
        return;
      }
      setTab("mission");
      if (need.taskId !== null) setSelectedTaskId(need.taskId);
    },
    [data?.activeProjectId, selectProject],
  );

  useEffect(() => {
    if (
      data === null ||
      !data.runs.some(
        (run) => run.status === "running" || run.status === "queued",
      )
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void load(undefined, true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [data?.runs, load]);

  const selectedTask =
    data?.tasks.find((task) => task.id === selectedTaskId) ?? null;

  if (!bootChecked) return <LoadingState />;
  if (boot === null) {
    return (
      <MissingHost
        error={bootError}
        onRetry={() => window.location.reload()}
      />
    );
  }
  if (data === null) {
    if (error === null || loading) return <LoadingState />;
    return (
      <ErrorState
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  const project = data.project;
  const reviewCount = data.tasks.filter((task) => task.status === "review").length;
  const mergeCount =
    data.stats.mergeReview + data.stats.mergeApproved;
  const selectedMerge =
    selectedTask === null
      ? null
      : latestMergeForTask(data.mergeProposals, selectedTask.id);

  const createTask = async (input: CreateTaskInput): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createTask(input);
      },
      "任务已创建",
    );
    if (ok) setModal(null);
  };

  const createRole = async (input: CreateRoleInput): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createRole(input);
      },
      "角色已创建",
    );
    if (ok) setModal(null);
  };

  const updateRoleExecutor = async (
    roleId: string,
    executor: AgentExecutor,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.updateRole(roleId, { executor });
      },
      "执行器已更新",
    );
  };

  const createProject = async (input: CreateProjectInput): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createProject(input);
      },
      "项目已创建",
    );
    if (ok) setModal(null);
  };

  const updateProjectRepo = async (repoPath: string): Promise<void> => {
    const ok = await run(
      async () => {
        if (client === null || data === null || data.project === null) return;
        await client.updateProject(data.project.id, {
          repoPath: repoPath.trim() || null,
        });
      },
      "项目仓库已更新",
    );
    if (ok) setModal(null);
  };

  const updateProjectDocs = async (
    docs: {
      prdPath: string | null;
      invariantsPath: string | null;
      modulesPath: string | null;
    },
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null || data === null || data.project === null) return;
        await client.updateProject(data.project.id, docs);
      },
      "项目文档路径已更新",
    );
  };

  const readProjectDoc = async (
    docPath: string,
  ): Promise<ProjectDoc | null> => {
    if (client === null) return null;
    try {
      return await client.readProjectDoc(docPath);
    } catch (error) {
      setToast({
        kind: "error",
        text:
          error instanceof StudioClientError
            ? error.message
            : "文档读取失败",
      });
      return null;
    }
  };

  const createModule = async (
    input: CreateModuleInput,
  ): Promise<boolean> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createModule(input);
      },
      "模块已创建",
    );
    if (ok) setModal(null);
    return ok;
  };

  const transitionTask = async (
    task: Task,
    status: TaskStatus,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.transitionTask(task.id, status);
      },
      status === "done" ? "任务已验收完成" : `任务已切换到「${TASK_STATUS_LABELS[status]}」`,
    );
  };

  const toggleAcceptance = async (
    task: Task,
    acceptanceId: string,
  ): Promise<void> => {
    const acceptance = task.acceptance.map((item) =>
      item.id === acceptanceId ? { ...item, done: !item.done } : item,
    );
    await run(
      async () => {
        if (client === null) return;
        await client.updateTask(task.id, { acceptance });
      },
      "验收项已更新",
    );
  };

  const toggleDocsSynced = async (task: Task): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.updateTask(task.id, {
          docsSynced: !task.docsSynced,
        });
      },
      task.docsSynced ? "已取消文档同步标记" : "已标记文档同步",
    );
  };

  const addEvidence = async (task: Task, text: string): Promise<boolean> => {
    const evidence = [
      ...task.evidence,
      {
        id: "",
        text,
        createdAt: new Date().toISOString(),
      },
    ];
    return run(
      async () => {
        if (client === null) return;
        await client.updateTask(task.id, { evidence });
      },
      "证据已记录",
    );
  };

  const dispatchTask = async (task: Task): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.dispatchTask(task.id);
      },
      "已派单，Agent 开始分析；完成后会自动刷回执",
    );
  };

  const verifyTask = async (
    task: Task,
    command: string,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.verifyTask(task.id, command);
      },
      "验证命令已执行",
    );
  };

  const reviewTask = async (task: Task): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.reviewTask(task.id);
      },
      "独立评审已完成",
    );
  };

  const createDecision = async (
    input: CreateDecisionInput,
  ): Promise<boolean> => {
    const ok = await run(
      async () => {
        if (client === null) return;
        await client.createDecision(input);
      },
      "决策已进入决策台",
    );
    if (ok) setModal(null);
    return ok;
  };

  const decideDecision = async (
    decision: Decision,
    input: DecideDecisionInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.decideDecision(decision.id, input);
      },
      input.status === "approved" ? "决策已批准" : "决策已拒绝",
    );
  };

  const createMerge = async (
    task: Task,
    input: CreateMergeProposalInput,
  ): Promise<boolean> => {
    return run(
      async () => {
        if (client === null) return;
        await client.createMergeProposal(task.id, input);
      },
      "合并提案已提交",
    );
  };

  const approveMerge = async (
    proposal: MergeProposal,
    note?: string,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.approveMergeProposal(proposal.id, note);
      },
      "合并提案已批准",
    );
  };

  const rejectMerge = async (
    proposal: MergeProposal,
    note: string,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.rejectMergeProposal(proposal.id, note);
      },
      "合并提案已打回",
    );
  };

  const completeMerge = async (
    proposal: MergeProposal,
    mergeCommit?: string,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.completeMergeProposal(proposal.id, mergeCommit);
      },
      "已记录合并完成",
    );
  };

  const executeMerge = async (
    proposal: MergeProposal,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.executeMerge(proposal.id);
      },
      "Git 合并完成，已记录 merge commit",
    );
  };

  const rollbackMerge = async (
    proposal: MergeProposal,
  ): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.rollbackMerge(proposal.id);
      },
      "已回滚合并并记录 revert commit",
    );
  };

  const exportData = async (): Promise<void> => {
    if (client === null) return;
    const data = await client.exportState();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studio-backup-${data.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined || client === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError("导入失败：文件不是合法 JSON");
      return;
    }
    const envelope =
      typeof parsed === "object" && parsed !== null && "state" in parsed
        ? (parsed as { state: unknown }).state
        : parsed;
    if (
      !window.confirm(
        "导入会覆盖当前 Studio 数据；Host 会先把原文件备份到 studio.json.pre-import-*。确定继续吗？",
      )
    ) {
      return;
    }
    await run(
      async () => {
        await client.importState(envelope);
        await load(undefined, true);
      },
      "数据已导入；原文件已备份",
    );
  };

  const exportBundle = async (): Promise<void> => {
    if (client === null || data?.project === null || data?.project === undefined)
      return;
    const { filename, blob } = await client.exportProjectBundle(
      data.project.id,
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveCompany = async (name: string): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.updateCompanyName(name);
        await load(undefined, true);
      },
      "工作室名称已更新",
    );
  };

  const writeAdr = async (decision: Decision): Promise<void> => {
    await run(
      async () => {
        if (client === null) return;
        await client.writeAdr(decision.id);
      },
      "ADR 已写入 docs/adr",
    );
  };

  return (
    <div className="studio-root" data-theme={theme}>
      <header className="studio-header">
        <div className="studio-brand">
          <div className="studio-mark">S</div>
          <div>
            <div className="studio-brand-name">{data.company.name}</div>
            <div className="studio-brand-sub">AI Studio</div>
          </div>
        </div>

        <div className="studio-project-picker">
          {data.projects.length === 0 ? (
            <span className="studio-muted">还没有项目</span>
          ) : (
            <select
              className="studio-select"
              value={data.activeProjectId ?? ""}
              onChange={(event) => void selectProject(event.target.value)}
              disabled={busy}
              aria-label="切换项目"
            >
              {data.projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="studio-header-actions">
          <span className="studio-status" title="Host 与页面已连接">
            <span className="studio-status-dot" />
            本地 · v{boot.pluginVersion}
          </span>
          <button
            className="studio-btn"
            data-size="sm"
            type="button"
            onClick={() => void exportData()}
            title="导出 studio.json 备份"
          >
            导出
          </button>
          <input
            id="studio-import-file"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void importData(event)}
          />
          <button
            className="studio-btn"
            data-size="sm"
            type="button"
            onClick={() =>
              document.getElementById("studio-import-file")?.click()
            }
            title="从 studio.json 备份恢复"
          >
            导入
          </button>
          <button
            className="studio-btn"
            data-size="icon"
            type="button"
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
            title={theme === "dark" ? "切换到浅色" : "切换到深色"}
            aria-label="切换主题"
          >
            {theme === "dark" ? (
              <IconSun width={15} height={15} />
            ) : (
              <IconMoon width={15} height={15} />
            )}
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="button"
            onClick={() => setModal({ kind: "task" })}
            disabled={project === null || data.roles.length === 0}
            title={
              project === null
                ? "请先创建项目"
                : data.roles.length === 0
                  ? "请先创建至少一个角色"
                  : "新建任务"
            }
          >
            <IconPlus width={14} height={14} />
            新建任务
          </button>
        </div>
      </header>

      <div className="studio-body">
        <nav className="studio-nav" aria-label="Studio 导航">
          <div className="studio-nav-label">Workspace</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="studio-nav-item"
              data-active={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              <NavIcon tab={item.id} />
              <span>{item.label}</span>
              {item.id === "company" && data.company.needs.length > 0 ? (
                <span className="studio-nav-count">
                  {data.company.needs.length}
                </span>
              ) : item.id === "boardroom" &&
                data.company.totals.pendingDecisions > 0 ? (
                <span className="studio-nav-count">
                  {data.company.totals.pendingDecisions}
                </span>
              ) : item.id === "mission" && reviewCount > 0 ? (
                <span className="studio-nav-count">{reviewCount}</span>
              ) : item.id === "tasks" ? (
                <span className="studio-nav-count">{data.stats.total}</span>
              ) : item.id === "merges" && mergeCount > 0 ? (
                <span className="studio-nav-count">{mergeCount}</span>
              ) : item.id === "team" ? (
                <span className="studio-nav-count">{data.roles.length}</span>
              ) : null}
            </button>
          ))}

          <div className="studio-nav-footer">
            <strong>
              {tab === "company"
                ? "赛博公司"
                : (project?.name ?? "未选择项目")}
            </strong>
            {tab === "company"
              ? `${String(data.company.totals.projects)} 个项目 · ${String(
                  data.company.totals.openTasks,
                )} 个未完成`
              : `${String(data.stats.total)} 个任务 · ${String(
                  data.roles.length,
                )} 个角色`}
          </div>
        </nav>

        <main className="studio-main">
          <div className="studio-main-inner">
            {error !== null ? (
              <div className="studio-alert" data-tone="warn">
                {error}
                <button
                  type="button"
                  className="studio-btn"
                  data-size="sm"
                  style={{ marginLeft: 10 }}
                  onClick={() => void load()}
                >
                  重试
                </button>
              </div>
            ) : null}
            {data.app.warning !== null && data.app.warning !== undefined ? (
              <div className="studio-alert" data-tone="warn">
                {data.app.warning}
              </div>
            ) : null}

            {tab === "company" ? (
              <CompanyView
                data={data}
                busy={busy}
                onOpenProject={(projectId) => void openCompanyProject(projectId)}
                onOpenNeed={(need) => void openCompanyNeed(need)}
                onNewProject={() => setModal({ kind: "project" })}
              />
            ) : null}

            {tab === "boardroom" ? (
              <BoardroomView
                decisions={data.decisions}
                runs={data.runs}
                tasks={data.tasks}
                busy={busy}
                onNew={() => setModal({ kind: "decision" })}
                onDecide={decideDecision}
                onWriteAdr={writeAdr}
              />
            ) : null}

            {tab === "knowledge" ? (
              <KnowledgeView
                project={data.project}
                modules={data.modules}
                busy={busy}
                onSaveDocs={updateProjectDocs}
                onReadDoc={readProjectDoc}
                onNewModule={() => setModal({ kind: "module" })}
              />
            ) : null}

            {tab === "mission" ? (
              <MissionView
                data={data}
                onOpenTask={setSelectedTaskId}
                onNewProject={() => setModal({ kind: "project" })}
                onGoTeam={() => setTab("team")}
              />
            ) : null}

            {tab === "tasks" ? (
              <TasksView
                data={data}
                onOpenTask={setSelectedTaskId}
              />
            ) : null}

            {tab === "merges" ? (
              <MergeView
                data={data}
                busy={busy}
                onOpenTask={setSelectedTaskId}
                onApprove={(proposal, note) => void approveMerge(proposal, note)}
                onReject={(proposal, note) => void rejectMerge(proposal, note)}
                onComplete={(proposal, commit) =>
                  void completeMerge(proposal, commit)
                }
              />
            ) : null}

            {tab === "team" ? (
              <TeamView
                data={data}
                onNewRole={() => setModal({ kind: "role" })}
                onExecutor={updateRoleExecutor}
              />
            ) : null}

            {tab === "settings" ? (
              <SettingsView
                boot={boot}
                data={data}
                theme={theme}
                onTheme={setTheme}
                onNewProject={() => setModal({ kind: "project" })}
                onBindRepo={() => setModal({ kind: "repo" })}
                onReload={() => void load(undefined, false)}
                onCompany={saveCompany}
                onBundle={exportBundle}
              />
            ) : null}
          </div>
        </main>
      </div>

      {selectedTask !== null ? (
        <TaskDrawer
          key={selectedTask.id}
          task={selectedTask}
          roles={data.roles}
          mergeProposal={selectedMerge}
          runs={data.runs.filter((run) => run.taskId === selectedTask.id)}
          verifications={data.verifications.filter(
            (verification) => verification.taskId === selectedTask.id,
          )}
          reviews={data.reviews.filter(
            (review) => review.taskId === selectedTask.id,
          )}
          codeMode={data.project?.repoPath != null}
          busy={busy}
          onClose={() => setSelectedTaskId(null)}
          onDispatch={() => dispatchTask(selectedTask)}
          onVerify={(command) => verifyTask(selectedTask, command)}
          onReview={() => reviewTask(selectedTask)}
          onToggleDocs={() => toggleDocsSynced(selectedTask)}
          onTransition={(status) => void transitionTask(selectedTask, status)}
          onToggleAcceptance={(id) =>
            void toggleAcceptance(selectedTask, id)
          }
          onAddEvidence={(text) => addEvidence(selectedTask, text)}
          onCreateMerge={(input) => createMerge(selectedTask, input)}
          onApproveMerge={(note) => {
            if (selectedMerge !== null) void approveMerge(selectedMerge, note);
          }}
          onRejectMerge={(note) => {
            if (selectedMerge !== null) void rejectMerge(selectedMerge, note);
          }}
          onCompleteMerge={(commit) => {
            if (selectedMerge !== null) {
              void completeMerge(selectedMerge, commit);
            }
          }}
          onExecuteMerge={() => {
            if (selectedMerge !== null) {
              void executeMerge(selectedMerge);
            }
          }}
          onRollbackMerge={() => {
            if (selectedMerge !== null) {
              void rollbackMerge(selectedMerge);
            }
          }}
        />
      ) : null}

      {modal?.kind === "task" ? (
        <TaskForm
          roles={data.roles}
          busy={busy}
          onCancel={() => setModal(null)}
          onSubmit={(input) => void createTask(input)}
        />
      ) : null}

      {modal?.kind === "role" ? (
        <RoleForm
          busy={busy}
          onCancel={() => setModal(null)}
          onSubmit={(input) => void createRole(input)}
        />
      ) : null}

      {modal?.kind === "project" ? (
        <ProjectForm
          busy={busy}
          onCancel={() => setModal(null)}
          onSubmit={(input) => void createProject(input)}
        />
      ) : null}

      {modal?.kind === "repo" ? (
        <RepoForm
          initial={data.project?.repoPath ?? ""}
          busy={busy}
          onCancel={() => setModal(null)}
          onSubmit={(repoPath) => void updateProjectRepo(repoPath)}
        />
      ) : null}

      {modal?.kind === "module" ? (
        <ModuleForm
          busy={busy}
          onCancel={() => setModal(null)}
          onSubmit={(input) => void createModule(input)}
        />
      ) : null}

      {modal?.kind === "decision" ? (
        <DecisionForm
          tasks={data.tasks}
          busy={busy}
          onCancel={() => setModal(null)}
          onSubmit={(input) => void createDecision(input)}
        />
      ) : null}

      {toast !== null ? (
        <div className="studio-toast" data-kind={toast.kind} role="status">
          {toast.kind === "ok" ? (
            <IconCheck width={14} height={14} />
          ) : (
            <IconAlert width={14} height={14} />
          )}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function BoardroomView({
  decisions,
  runs,
  tasks,
  busy,
  onNew,
  onDecide,
  onWriteAdr,
}: {
  decisions: Decision[];
  runs: AgentRun[];
  tasks: Task[];
  busy: boolean;
  onNew: () => void;
  onDecide: (
    decision: Decision,
    input: DecideDecisionInput,
  ) => Promise<boolean>;
  onWriteAdr: (decision: Decision) => Promise<void>;
}) {
  const pending = decisions.filter((decision) => decision.status === "pending");
  const history = decisions.filter((decision) => decision.status !== "pending");
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const runById = new Map(runs.map((run) => [run.id, run]));

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Decision Desk</div>
          <h1 className="studio-title">决策台</h1>
          <p className="studio-subtitle">
            支线的项目级决策在这里升级给 Owner。Agent 只能提出建议，不能替你做决定；
            批准或拒绝都要留下结论和理由。
          </p>
        </div>
        <div className="studio-head-actions">
          <button
            className="studio-btn"
            data-variant="primary"
            type="button"
            onClick={onNew}
            disabled={busy}
          >
            <IconPlus width={14} height={14} />
            提出决策
          </button>
        </div>
      </div>

      <div className="studio-grid-stats">
        <StatCard
          label="待裁决"
          value={String(pending.length)}
          note="Agent 建议 / 人工提出"
          tone={pending.length > 0 ? "warn" : undefined}
        />
        <StatCard
          label="已批准"
          value={String(
            decisions.filter((decision) => decision.status === "approved")
              .length,
          )}
          note="已写入决策记录"
        />
        <StatCard
          label="已拒绝"
          value={String(
            decisions.filter((decision) => decision.status === "rejected")
              .length,
          )}
          note="保留理由"
        />
      </div>

      <section className="studio-panel" style={{ marginBottom: 16 }}>
        <div className="studio-panel-head">
          <IconSpark width={14} height={14} />
          <h3>待裁决</h3>
          <span className="studio-muted">
            {pending.length === 0
              ? "没有需要你拍板的项目级决策"
              : `${String(pending.length)} 项`}
          </span>
        </div>
        <div className="studio-panel-body">
          {pending.length === 0 ? (
            <div className="studio-empty">
              <strong>决策台暂时空着</strong>
              Agent 在回执里提出项目级决策，或你手动提出一条决策，会出现在这里。
            </div>
          ) : (
            <div className="studio-decision-list">
              {pending.map((decision) => (
                <DecisionCard
                  key={decision.id}
                  decision={decision}
                  task={
                    decision.taskId === null
                      ? undefined
                      : taskById.get(decision.taskId)
                  }
                  run={
                    decision.runId === null
                      ? undefined
                      : runById.get(decision.runId)
                  }
                  busy={busy}
                  onDecide={onDecide}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="studio-panel">
        <div className="studio-panel-head">
          <IconCheck width={14} height={14} />
          <h3>决策记录</h3>
          <span className="studio-muted">append-only 结论</span>
        </div>
        <div className="studio-panel-body">
          {history.length === 0 ? (
            <div className="studio-faint" style={{ fontSize: 11 }}>
              还没有已完成的决策。
            </div>
          ) : (
            <div className="studio-decision-list">
              {history.map((decision) => (
                <div
                  key={decision.id}
                  className="studio-decision-card"
                  data-status={decision.status}
                >
                  <div className="studio-decision-head">
                    <span
                      className="studio-pill"
                      data-tone={decision.status === "approved" ? "ok" : "p0"}
                    >
                      {DECISION_STATUS_LABELS[decision.status]}
                    </span>
                    {!decision.reversible ? (
                      <span className="studio-pill" data-tone="p0">
                        不可逆
                      </span>
                    ) : null}
                    <strong>{decision.title}</strong>
                    <span className="studio-faint" style={{ marginLeft: "auto" }}>
                      {decision.decidedAt === null
                        ? ""
                        : formatDate(decision.decidedAt)}
                    </span>
                  </div>
                  {decision.decision !== "" ? (
                    <div className="studio-decision-context">
                      结论：{decision.decision}
                    </div>
                  ) : null}
                  {decision.note !== "" ? (
                    <div className="studio-faint" style={{ fontSize: 10 }}>
                      理由：{decision.note}
                    </div>
                  ) : null}
                  {decision.adrDraft !== null ? (
                    <details className="studio-adr">
                      <summary>查看 ADR 草稿</summary>
                      <pre>{decision.adrDraft}</pre>
                    </details>
                  ) : null}
                  {decision.adrPath !== null ? (
                    <div className="studio-faint" style={{ fontSize: 10 }}>
                      已写入：{decision.adrPath}
                    </div>
                  ) : decision.adrDraft !== null ? (
                    <button
                      type="button"
                      className="studio-btn"
                      data-size="sm"
                      disabled={busy}
                      onClick={() => void onWriteAdr(decision)}
                    >
                      写入 docs/adr
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function DecisionCard({
  decision,
  task,
  run,
  busy,
  onDecide,
}: {
  decision: Decision;
  task: Task | undefined;
  run: AgentRun | undefined;
  busy: boolean;
  onDecide: (
    decision: Decision,
    input: DecideDecisionInput,
  ) => Promise<boolean>;
}) {
  const [conclusion, setConclusion] = useState("");
  const [note, setNote] = useState("");

  const submit = (status: "approved" | "rejected"): void => {
    void onDecide(decision, {
      status,
      decision: conclusion.trim(),
      note: note.trim(),
    });
  };

  return (
    <article className="studio-decision-card" data-status="pending">
      <div className="studio-decision-head">
        <span className="studio-pill" data-tone="warn">
          待裁决
        </span>
        {!decision.reversible ? (
          <span className="studio-pill" data-tone="p0">
            不可逆
          </span>
        ) : null}
        <strong>{decision.title}</strong>
        <span className="studio-faint" style={{ marginLeft: "auto" }}>
          {formatDate(decision.createdAt)}
        </span>
      </div>
      <div className="studio-decision-meta">
        {task === undefined ? "项目级" : task.title}
        {task?.branch !== null && task?.branch !== undefined
          ? ` · ${task.branch}`
          : ""}
        {run?.tokens !== null && run?.tokens !== undefined
          ? ` · ${run.tokens.toLocaleString()} tokens`
          : " · token 未计量"}
      </div>
      {decision.context !== "" ? (
        <div className="studio-decision-context">{decision.context}</div>
      ) : null}
      {decision.recommendation !== "" ? (
        <div className="studio-decision-rec">
          <span>建议</span>
          {decision.recommendation}
        </div>
      ) : null}
      {decision.options.length > 0 ? (
        <ul className="studio-decision-options">
          {decision.options.map((option) => (
            <li key={option.label}>
              <strong>{option.label}</strong>
              {option.tradeoff !== "" ? ` — ${option.tradeoff}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="studio-decision-form">
        <div className="studio-field">
          <label htmlFor={`decision-conclusion-${decision.id}`}>
            你的结论（可选，批准/拒绝都会记录）
          </label>
          <textarea
            id={`decision-conclusion-${decision.id}`}
            value={conclusion}
            onChange={(event) => setConclusion(event.target.value)}
            placeholder="例如：批准，把 replay 与性能门禁纳入合并前检查。"
          />
        </div>
        <div className="studio-field">
          <label htmlFor={`decision-note-${decision.id}`}>理由（可选）</label>
          <input
            id={`decision-note-${decision.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="为什么这样拍板？"
          />
        </div>
        <div className="studio-actions">
          <button
            type="button"
            className="studio-btn"
            data-variant="primary"
            data-size="sm"
            disabled={busy}
            onClick={() => submit("approved")}
          >
            <IconCheck width={13} height={13} />
            批准
          </button>
          <button
            type="button"
            className="studio-btn"
            data-size="sm"
            disabled={busy}
            onClick={() => submit("rejected")}
          >
            <IconX width={13} height={13} />
            拒绝
          </button>
        </div>
      </div>
    </article>
  );
}

function CompanyView({
  data,
  busy,
  onOpenProject,
  onOpenNeed,
  onNewProject,
}: {
  data: BootstrapResponse;
  busy: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenNeed: (need: OwnerNeed) => void;
  onNewProject: () => void;
}) {
  const company = data.company;
  const acceptanceRate =
    company.totals.acceptanceTotal === 0
      ? 0
      : Math.round(
          (company.totals.acceptanceDone / company.totals.acceptanceTotal) *
            100,
        );
  const projectNameById = new Map(
    company.projects.map((summary) => [
      summary.project.id,
      summary.project.name,
    ]),
  );
  const maxRoleLoad = Math.max(
    1,
    ...company.roles.map((role) => role.activeTasks),
  );
  const configuredBudget = company.projects.reduce(
    (sum, summary) => sum + (summary.project.tokenBudget ?? 0),
    0,
  );
  const tokenUse =
    configuredBudget === 0
      ? `${company.totals.tokensUsed.toLocaleString()} tokens`
      : `${company.totals.tokensUsed.toLocaleString()} / ${configuredBudget.toLocaleString()}`;

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Owner Dashboard</div>
          <h1 className="studio-title">赛博公司</h1>
          <p className="studio-subtitle">
            老板视角：项目组合是否健康、哪里需要你拍板、产能花在哪。
            这里展示真实控制面数据；token 消耗来自 DSH 计量，金额成本等报价接入后再显示。
          </p>
        </div>
        <div className="studio-head-actions">
          {data.activeProjectId !== null ? (
            <button
              className="studio-btn"
              type="button"
              disabled={busy}
              onClick={() => onOpenProject(data.activeProjectId as string)}
            >
              <IconGrid width={14} height={14} />
              当前项目
            </button>
          ) : (
            <button
              className="studio-btn"
              data-variant="primary"
              type="button"
              onClick={onNewProject}
            >
              <IconPlus width={14} height={14} />
              新建项目
            </button>
          )}
        </div>
      </div>

      <div className="studio-grid-stats">
        <StatCard
          label="项目"
          value={`${String(company.totals.activeProjects)}/${String(
            company.totals.projects,
          )}`}
          note="活跃 / 总数"
        />
        <StatCard
          label="未完成"
          value={String(company.totals.openTasks)}
          note={`${String(company.totals.inReview)} 个待验收`}
        />
        <StatCard
          label="需要你"
          value={String(company.needs.length)}
          note="决策 / 阻塞 / 老化"
          tone={company.needs.length > 0 ? "warn" : undefined}
        />
        <StatCard
          label="待合并"
          value={String(company.totals.mergePending)}
          note={`${String(company.totals.merged)} 个已合并`}
        />
        <StatCard
          label="验收完成率"
          value={`${String(acceptanceRate)}%`}
          note={`${String(company.totals.acceptanceDone)} / ${String(
            company.totals.acceptanceTotal,
          )} 条已勾选`}
          tone={acceptanceRate === 100 ? "ok" : undefined}
        />
      </div>

      <div className="studio-split">
        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconSpark width={14} height={14} />
            <h3>老板收件箱</h3>
            <span className="studio-muted">
              {company.needs.length === 0
                ? "没有需要你处理的事项"
                : `${String(company.needs.length)} 项`}
            </span>
          </div>
          <div className="studio-panel-body">
            {company.needs.length === 0 ? (
              <div className="studio-empty">
                <strong>没有需要你拍板的事</strong>
                所有任务和合并提案都在自动流转中。
              </div>
            ) : (
              <div className="studio-needs">
                {company.needs.slice(0, 8).map((need) => (
                  <button
                    key={need.id}
                    type="button"
                    className="studio-need"
                    onClick={() => onOpenNeed(need)}
                  >
                    <span
                      className="studio-need-mark"
                      data-tone={
                        need.severity === "critical"
                          ? "danger"
                          : need.severity === "warning"
                            ? "accent"
                            : "info"
                      }
                    />
                    <span>
                      <span className="studio-need-title">{need.title}</span>
                      <span className="studio-need-meta">
                        {need.projectName} · {need.detail}
                        {need.ageHours !== null
                          ? ` · ${String(need.ageHours)}h`
                          : ""}
                      </span>
                    </span>
                    <IconChevronRight
                      className="studio-need-arrow"
                      width={14}
                      height={14}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconUsers width={14} height={14} />
            <h3>现金与产能</h3>
            <span className="studio-muted">{company.roles.length} 个角色</span>
          </div>
          <div className="studio-panel-body">
            <div className="studio-company-placeholder">
              <div className="studio-section-label">token 消耗 / 预算</div>
              <strong>{tokenUse}</strong>
              <p>
                {configuredBudget === 0
                  ? "项目还没有配置 token 预算；消耗来自 DSH token meter。"
                  : `预算使用率 ${String(
                      Math.min(
                        100,
                        Math.round(
                          (company.totals.tokensUsed / configuredBudget) * 100,
                        ),
                      ),
                    )}%。`}
                {" "}
                {company.totals.runs} 次运行
                {company.totals.runningRuns > 0
                  ? `，${String(company.totals.runningRuns)} 个执行中`
                  : ""}
                。金额成本等报价接入后再显示。
              </p>
            </div>
            {company.roles.length === 0 ? (
              <div className="studio-empty" style={{ marginTop: 12 }}>
                <strong>还没有角色</strong>
                建一个 Lead、Builder 和 Verifier，任务才有负责人。
              </div>
            ) : (
              <div className="studio-role-load">
                {company.roles.slice(0, 6).map((role) => (
                  <RoleLoadRow
                    key={`${role.projectId}-${role.roleId}`}
                    role={role}
                    max={maxRoleLoad}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="studio-panel" style={{ marginBottom: 16 }}>
        <div className="studio-panel-head">
          <IconBuilding width={14} height={14} />
          <h3>项目组合</h3>
          <span className="studio-muted">
            {company.projects.length} 个项目 · 点击项目进入 Mission Control
          </span>
        </div>
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>健康</th>
                <th>任务</th>
                <th>验收</th>
                <th>合并</th>
                <th>角色</th>
                <th>最近活动</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {company.projects.map((summary) => (
                <ProjectRow
                  key={summary.project.id}
                  summary={summary}
                  onOpen={onOpenProject}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="studio-company-bottom">
        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconAlert width={14} height={14} />
            <h3>风险雷达</h3>
            <span className="studio-muted">需要结构化关注</span>
          </div>
          <div className="studio-panel-body">
            <div className="studio-risk-grid">
              <RiskItem label="停滞任务" value={company.risk.staleTasks} />
              <RiskItem label="老化合并" value={company.risk.agingMerges} />
              <RiskItem label="缺证据" value={company.risk.missingEvidence} />
              <RiskItem label="阻塞" value={company.risk.blocked} />
              <RiskItem label="无人负责" value={company.risk.unowned} />
            </div>
          </div>
        </section>

        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconGitMerge width={14} height={14} />
            <h3>交付流</h3>
            <span className="studio-muted">跨项目最近事件</span>
          </div>
          <div className="studio-panel-body">
            {company.recentEvents.length === 0 ? (
              <div className="studio-faint" style={{ fontSize: 11 }}>
                还没有交付事件。
              </div>
            ) : (
              <div className="studio-events">
                {company.recentEvents.slice(0, 10).map((event) => (
                  <div key={event.id} className="studio-event">
                    <span className="studio-event-dot" />
                    <span>
                      <span className="studio-mono">{event.type}</span>
                      <span className="studio-faint">
                        {" "}
                        ·{" "}
                        {event.projectId === null
                          ? "公司"
                          : (projectNameById.get(event.projectId) ??
                            event.projectId)}
                      </span>
                    </span>
                    <span className="studio-event-time">
                      {formatDate(event.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function ProjectRow({
  summary,
  onOpen,
}: {
  summary: CompanyProjectSummary;
  onOpen: (projectId: string) => void;
}) {
  const { stats, project } = summary;
  return (
    <tr>
      <td>
        <div className="studio-table-project">{project.name}</div>
        {project.description !== "" ? (
          <div className="studio-table-sub">{project.description}</div>
        ) : null}
      </td>
      <td>
        <span className={`studio-health studio-health-${summary.health}`}>
          {COMPANY_HEALTH_LABELS[summary.health]}
        </span>
      </td>
      <td>
        {summary.openTasks}/{stats.total} 未完成
      </td>
      <td>
        {stats.acceptanceDone}/{stats.acceptanceTotal}
      </td>
      <td>
        待 {stats.mergeReview + stats.mergeApproved} · 已 {stats.mergeMerged}
      </td>
      <td>
        {summary.roleCount} 人
        {summary.activeRoleCount > 0
          ? ` · ${String(summary.activeRoleCount)} 在忙`
          : ""}
      </td>
      <td className="studio-table-time">
        {summary.lastActivityAt === null
          ? "无"
          : formatDate(summary.lastActivityAt)}
      </td>
      <td>
        <button
          type="button"
          className="studio-btn"
          data-size="sm"
          onClick={() => onOpen(project.id)}
        >
          打开
        </button>
      </td>
    </tr>
  );
}

function RoleLoadRow({
  role,
  max,
}: {
  role: RoleLoadSummary;
  max: number;
}) {
  const width =
    role.activeTasks === 0
      ? 0
      : Math.max(8, Math.round((role.activeTasks / max) * 100));
  return (
    <div className="studio-role-load-row">
      <div className="studio-role-load-head">
        <span>{role.roleName}</span>
        <span className="studio-faint">{role.projectName}</span>
        <span className="studio-role-load-state" data-state={role.state}>
          {ROLE_LOAD_LABELS[role.state]}
        </span>
        <strong>{role.activeTasks}</strong>
      </div>
      <div className="studio-role-load-track">
        <span style={{ width: `${String(width)}%` }} />
      </div>
    </div>
  );
}

function RiskItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="studio-risk-item" data-active={value > 0}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function KnowledgeView({
  project,
  modules,
  busy,
  onSaveDocs,
  onReadDoc,
  onNewModule,
}: {
  project: Project | null;
  modules: Module[];
  busy: boolean;
  onSaveDocs: (docs: {
    prdPath: string | null;
    invariantsPath: string | null;
    modulesPath: string | null;
  }) => Promise<boolean>;
  onReadDoc: (path: string) => Promise<ProjectDoc | null>;
  onNewModule: () => void;
}) {
  const [prdPath, setPrdPath] = useState(project?.prdPath ?? "");
  const [invariantsPath, setInvariantsPath] = useState(
    project?.invariantsPath ?? "",
  );
  const [modulesPath, setModulesPath] = useState(
    project?.modulesPath ?? "",
  );
  const [doc, setDoc] = useState<ProjectDoc | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    setPrdPath(project?.prdPath ?? "");
    setInvariantsPath(project?.invariantsPath ?? "");
    setModulesPath(project?.modulesPath ?? "");
  }, [project?.id, project?.prdPath, project?.invariantsPath, project?.modulesPath]);
  const read = async (path: string): Promise<void> => {
    if (path.trim() === "") return;
    setReading(true);
    const result = await onReadDoc(path.trim());
    setReading(false);
    if (result !== null) setDoc(result);
  };
  const save = (event: FormEvent): void => {
    event.preventDefault();
    void onSaveDocs({
      prdPath: prdPath.trim() || null,
      invariantsPath: invariantsPath.trim() || null,
      modulesPath: modulesPath.trim() || null,
    });
  };
  return (
    <div className="studio-page">
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">PROJECT KNOWLEDGE</div>
          <h1>知识层</h1>
          <p>
            PRD 是需求唯一事实源；模块契约卡把 Agent 的上下文喂窄。
            这里只读展示仓库里的文档，不复制第二份正文。
          </p>
        </div>
        <button
          type="button"
          className="studio-btn"
          data-tone="primary"
          onClick={onNewModule}
          disabled={busy || project === null}
        >
          <IconPlus width={14} height={14} />
          新建模块
        </button>
      </div>

      <div className="studio-knowledge-grid">
        <section className="studio-panel">
          <div className="studio-section-label">项目文档</div>
          <form onSubmit={save} className="studio-form">
            <div className="studio-field">
              <label htmlFor="prd-path">PRD 路径</label>
              <input
                id="prd-path"
                value={prdPath}
                onChange={(event) => setPrdPath(event.target.value)}
                placeholder="docs/PRD.md"
              />
            </div>
            <div className="studio-field">
              <label htmlFor="invariants-path">INVARIANTS 路径</label>
              <input
                id="invariants-path"
                value={invariantsPath}
                onChange={(event) => setInvariantsPath(event.target.value)}
                placeholder="docs/INVARIANTS.md"
              />
            </div>
            <div className="studio-field">
              <label htmlFor="modules-path">MODULES 路径</label>
              <input
                id="modules-path"
                value={modulesPath}
                onChange={(event) => setModulesPath(event.target.value)}
                placeholder="docs/MODULES.md"
              />
            </div>
            <div className="studio-form-actions">
              <button
                type="button"
                className="studio-btn"
                data-size="sm"
                disabled={reading || prdPath.trim() === ""}
                onClick={() => void read(prdPath)}
              >
                读取 PRD
              </button>
              <button
                type="button"
                className="studio-btn"
                data-size="sm"
                disabled={reading || invariantsPath.trim() === ""}
                onClick={() => void read(invariantsPath)}
              >
                读取不变量
              </button>
              <button type="submit" className="studio-btn" data-size="sm" data-tone="primary" disabled={busy}>
                保存路径
              </button>
            </div>
          </form>
          {doc !== null ? (
            <div className="studio-doc-view">
              <div className="studio-doc-head">
                <span className="studio-mono">{doc.path}</span>
                <span className="studio-pill" data-tone={doc.exists ? "ok" : "p0"}>
                  {doc.exists ? "已读取" : "文件不存在"}
                </span>
              </div>
              <pre>{doc.content || "（空文件）"}</pre>
            </div>
          ) : null}
        </section>

        <section className="studio-panel">
          <div className="studio-section-label">
            模块契约 · {modules.length}
          </div>
          {modules.length === 0 ? (
            <div className="studio-empty">
              还没有模块。先建一个模块契约卡，再派单；实现者只加载这张卡。
            </div>
          ) : (
            <div className="studio-module-list">
              {modules.map((module) => (
                <article key={module.id} className="studio-module-card">
                  <div className="studio-module-head">
                    <strong>{module.name}</strong>
                    <span className="studio-pill" data-tone="p2">
                      {module.allowedPaths.length} 允许路径
                    </span>
                  </div>
                  <p>{module.responsibility || "未填写职责"}</p>
                  {module.contractPath !== null ? (
                    <button
                      type="button"
                      className="studio-link"
                      disabled={reading}
                      onClick={() => void read(module.contractPath ?? "")}
                    >
                      {module.contractPath}
                    </button>
                  ) : null}
                  {module.contractText !== "" ? (
                    <pre className="studio-module-contract">
                      {module.contractText.slice(0, 800)}
                    </pre>
                  ) : null}
                  {module.dependsOn.length > 0 ? (
                    <div className="studio-faint" style={{ fontSize: 10 }}>
                      依赖：{module.dependsOn.join("、")}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ModuleForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateModuleInput) => void;
}) {
  const [name, setName] = useState("");
  const [responsibility, setResponsibility] = useState("");
  const [contractPath, setContractPath] = useState("");
  const [contractText, setContractText] = useState("");
  const [allowedPaths, setAllowedPaths] = useState("");
  const [forbiddenPaths, setForbiddenPaths] = useState("");
  const [dependsOn, setDependsOn] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") {
      setLocalError("请填写模块名");
      return;
    }
    setLocalError(null);
    onSubmit({
      name: name.trim(),
      responsibility: responsibility.trim(),
      contractPath: contractPath.trim() || null,
      contractText: contractText.trim(),
      allowedPaths: allowedPaths
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      forbiddenPaths: forbiddenPaths
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      dependsOn: dependsOn
        .split(",")
        .map((line) => line.trim())
        .filter(Boolean),
    });
  };
  return (
    <ModalShell
      title="新建模块"
      subtitle="模块契约卡是实现者的上下文边界；改契约本身要走架构师/Owner。"
      footer={null}
      onClose={onCancel}
    >
      <form onSubmit={submit} className="studio-form">
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field">
          <label htmlFor="module-name">模块名</label>
          <input
            id="module-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="combat / replay / input"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="module-responsibility">职责</label>
          <textarea
            id="module-responsibility"
            value={responsibility}
            onChange={(event) => setResponsibility(event.target.value)}
            rows={2}
            placeholder="这个模块负责什么，不负责什么"
          />
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="module-contract-path">契约文件路径</label>
            <input
              id="module-contract-path"
              value={contractPath}
              onChange={(event) => setContractPath(event.target.value)}
              placeholder="docs/contracts/combat.md"
            />
          </div>
          <div className="studio-field">
            <label htmlFor="module-depends">依赖模块（逗号）</label>
            <input
              id="module-depends"
              value={dependsOn}
              onChange={(event) => setDependsOn(event.target.value)}
              placeholder="replay, input"
            />
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="module-contract-text">契约摘要</label>
          <textarea
            id="module-contract-text"
            value={contractText}
            onChange={(event) => setContractText(event.target.value)}
            rows={4}
            placeholder="接口、输入输出、错误处理、边界"
          />
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="module-allowed">允许路径（每行一条）</label>
            <textarea
              id="module-allowed"
              value={allowedPaths}
              onChange={(event) => setAllowedPaths(event.target.value)}
              rows={3}
              placeholder={"src/combat/\ntest/combat/"}
            />
          </div>
          <div className="studio-field">
            <label htmlFor="module-forbidden">禁止路径（每行一条）</label>
            <textarea
              id="module-forbidden"
              value={forbiddenPaths}
              onChange={(event) => setForbiddenPaths(event.target.value)}
              rows={3}
              placeholder={"src/net/\nassets/"}
            />
          </div>
        </div>
        <div className="studio-form-actions">
          <button type="button" className="studio-btn" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="studio-btn" data-tone="primary" disabled={busy}>
            创建模块
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function MissionView({
  data,
  onOpenTask,
  onNewProject,
  onGoTeam,
}: {
  data: BootstrapResponse;
  onOpenTask: (id: string) => void;
  onNewProject: () => void;
  onGoTeam: () => void;
}) {
  const project = data.project;
  const review = data.tasks.filter((task) => task.status === "review");
  const blocked = data.tasks.filter((task) => task.status === "blocked");
  const ready = data.tasks.filter(
    (task) => task.status === "running" && allAccepted(task),
  );
  const mergeNeeds = data.mergeProposals.filter(
    (proposal) =>
      proposal.status === "review" || proposal.status === "approved",
  );
  const needs = [...review, ...blocked, ...ready].slice(0, 5);
  const totalNeeds = mergeNeeds.length + needs.length;
  const acceptanceRate =
    data.stats.acceptanceTotal === 0
      ? 0
      : Math.round(
          (data.stats.acceptanceDone / data.stats.acceptanceTotal) * 100,
        );

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Mission Control</div>
          <h1 className="studio-title">
            {project?.name ?? "创建你的第一个项目"}
          </h1>
          <p className="studio-subtitle">
            {project?.description ??
              "Studio 把项目、角色、任务和验收放在同一个页面。先建项目，再建角色，然后用一条真实任务跑通流程。"}
          </p>
        </div>
        <div className="studio-head-actions">
          {project === null ? (
            <button
              className="studio-btn"
              data-variant="primary"
              type="button"
              onClick={onNewProject}
            >
              <IconPlus width={14} height={14} />
              新建项目
            </button>
          ) : (
            <button
              className="studio-btn"
              type="button"
              onClick={onGoTeam}
            >
              <IconUsers width={14} height={14} />
              团队
            </button>
          )}
        </div>
      </div>

      <div className="studio-grid-stats">
        <StatCard
          label="待验收"
          value={String(data.stats.review)}
          note="需要独立评审的任务"
          tone={data.stats.review > 0 ? "warn" : undefined}
        />
        <StatCard
          label="待合并"
          value={String(data.stats.mergeReview + data.stats.mergeApproved)}
          note={`${String(data.stats.mergeMerged)} 个已合并`}
          tone={
            data.stats.mergeApproved > 0
              ? "warn"
              : data.stats.mergeReview > 0
                ? "danger"
                : undefined
          }
        />
        <StatCard
          label="进行中"
          value={String(data.stats.running)}
          note={`${String(ready.length)} 个已满足验收条件`}
        />
        <StatCard
          label="验收项完成率"
          value={`${String(acceptanceRate)}%`}
          note={`${String(data.stats.acceptanceDone)} / ${String(
            data.stats.acceptanceTotal,
          )} 条已勾选`}
          tone={acceptanceRate === 100 ? "ok" : undefined}
        />
        <StatCard
          label="已完成"
          value={String(data.stats.done)}
          note={`共 ${String(data.stats.total)} 个任务`}
          tone="ok"
        />
      </div>

      <div className="studio-split">
        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconSpark width={14} height={14} />
            <h3>需要你</h3>
            <span className="studio-muted">
              {totalNeeds === 0 ? "当前没有阻塞项" : `${String(totalNeeds)} 项`}
            </span>
          </div>
          <div className="studio-panel-body">
            {totalNeeds === 0 ? (
              <div className="studio-empty">
                <strong>节奏正常</strong>
                没有待验收、待合并、阻塞或可提交验收的事项。
              </div>
            ) : (
              <div className="studio-needs">
                {mergeNeeds.map((proposal) => {
                  const task = data.tasks.find(
                    (item) => item.id === proposal.taskId,
                  );
                  return (
                    <button
                      key={proposal.id}
                      type="button"
                      className="studio-need"
                      onClick={() => onOpenTask(proposal.taskId)}
                    >
                      <span
                        className="studio-need-mark"
                        data-tone={
                          proposal.status === "approved" ? "warn" : "accent"
                        }
                      />
                      <span>
                        <span className="studio-need-title">
                          {task?.title ?? "合并提案"}
                        </span>
                        <span className="studio-need-meta">
                          {proposal.status === "approved"
                            ? "已批准，等待合并"
                            : "合并提案待评审"}
                          {" · "}
                          {proposal.branch} → {proposal.base}
                        </span>
                      </span>
                      <IconChevronRight
                        className="studio-need-arrow"
                        width={14}
                        height={14}
                      />
                    </button>
                  );
                })}
                {needs.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="studio-need"
                    onClick={() => onOpenTask(task.id)}
                  >
                    <span
                      className="studio-need-mark"
                      data-tone={
                        task.status === "blocked"
                          ? "danger"
                          : task.status === "review"
                            ? "accent"
                            : "warn"
                      }
                    />
                    <span>
                      <span className="studio-need-title">{task.title}</span>
                      <span className="studio-need-meta">
                        {task.status === "review"
                          ? "等待验收"
                          : task.status === "blocked"
                            ? "阻塞待处理"
                            : "可提交验收"}
                        {" · "}
                        {roleName(data.roles, task.ownerRoleId)}
                      </span>
                    </span>
                    <IconChevronRight
                      className="studio-need-arrow"
                      width={14}
                      height={14}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconUsers width={14} height={14} />
            <h3>团队</h3>
            <span className="studio-muted">{data.roles.length} 人</span>
          </div>
          <div className="studio-panel-body">
            <Roster roles={data.roles} tasks={data.tasks} onGoTeam={onGoTeam} />
          </div>
        </section>
      </div>

      <section className="studio-panel" style={{ marginBottom: 16 }}>
        <div className="studio-panel-head">
          <IconGitMerge width={14} height={14} />
          <h3>支线</h3>
          <span className="studio-muted">
            {data.branches.length} 条 · 契约变更会自动检测冲突
          </span>
        </div>
        <div className="studio-panel-body">
          <BranchPanel
            branches={data.branches}
            contractChanges={data.contractChanges}
            tasks={data.tasks}
          />
        </div>
      </section>

      <section className="studio-panel" style={{ marginBottom: 16 }}>
        <div className="studio-panel-head">
          <IconKanban width={14} height={14} />
          <h3>任务板</h3>
          <span className="studio-muted">
            {data.stats.total} 个任务 · 点击卡片查看验收
          </span>
        </div>
        <div className="studio-panel-body">
          <TaskBoard
            tasks={data.tasks}
            roles={data.roles}
            mergeProposals={data.mergeProposals}
            onOpenTask={onOpenTask}
          />
        </div>
      </section>

      <RecentEvents events={data.events} />
    </>
  );
}

function TasksView({
  data,
  onOpenTask,
}: {
  data: BootstrapResponse;
  onOpenTask: (id: string) => void;
}) {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const tasks =
    filter === "all"
      ? data.tasks
      : data.tasks.filter((task) => task.status === filter);

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Task Board</div>
          <h1 className="studio-title">任务</h1>
          <p className="studio-subtitle">
            任务状态、负责人和验收标准是同一份事实。Agent 不能自己把任务标记为完成。
          </p>
        </div>
      </div>

      <div className="studio-toolbar">
        <div className="studio-tabs">
          <button
            type="button"
            className="studio-tab"
            data-active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            全部 {data.stats.total}
          </button>
          {TASK_STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              className="studio-tab"
              data-active={filter === status}
              onClick={() => setFilter(status)}
            >
              {TASK_STATUS_LABELS[status]} {data.stats[status]}
            </button>
          ))}
        </div>
        <span className="studio-toolbar-spacer" />
        <span className="studio-muted">
          验收项 {data.stats.acceptanceDone}/{data.stats.acceptanceTotal}
        </span>
      </div>

      <TaskBoard
        tasks={tasks}
        roles={data.roles}
        mergeProposals={data.mergeProposals}
        onOpenTask={onOpenTask}
      />
    </>
  );
}

function MergeView({
  data,
  busy,
  onOpenTask,
  onApprove,
  onReject,
  onComplete,
}: {
  data: BootstrapResponse;
  busy: boolean;
  onOpenTask: (id: string) => void;
  onApprove: (proposal: MergeProposal, note?: string) => void;
  onReject: (proposal: MergeProposal, note: string) => void;
  onComplete: (proposal: MergeProposal, commit?: string) => void;
}) {
  const proposals = [...data.mergeProposals].sort((left, right) => {
    const order = { review: 0, approved: 1, rejected: 2, merged: 3 };
    const byStatus = order[left.status] - order[right.status];
    return byStatus !== 0
      ? byStatus
      : right.createdAt.localeCompare(left.createdAt);
  });
  const rejected = data.mergeProposals.filter(
    (proposal) => proposal.status === "rejected",
  ).length;

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Merge Queue</div>
          <h1 className="studio-title">合并治理</h1>
          <p className="studio-subtitle">
            分支不会自己汇入主干。每个提案都要有摘要、风险、回滚和评审记录；Studio
            记录治理状态，Git 命令由人或 Integrator 执行。
          </p>
        </div>
        <div className="studio-head-actions">
          <span className="studio-pill" data-tone="accent">
            待评审 {data.stats.mergeReview}
          </span>
          <span className="studio-pill" data-tone="p1">
            待合并 {data.stats.mergeApproved}
          </span>
          <span className="studio-pill" data-tone="ok">
            已合并 {data.stats.mergeMerged}
          </span>
        </div>
      </div>

      {proposals.length === 0 ? (
        <div className="studio-empty">
          <strong>还没有合并提案</strong>
          任务完成验收并记录证据后，在 Task Room 的「合并治理」里提交第一个提案。
        </div>
      ) : (
        <div className="studio-merge-list">
          {proposals.map((proposal) => {
            const task = data.tasks.find(
              (item) => item.id === proposal.taskId,
            );
            return (
              <MergeProposalCard
                key={proposal.id}
                proposal={proposal}
                task={task ?? null}
                busy={busy}
                onOpenTask={onOpenTask}
                onApprove={onApprove}
                onReject={onReject}
                onComplete={onComplete}
              />
            );
          })}
          {rejected > 0 ? (
            <div className="studio-action-note">
              有 {rejected} 个提案被打回；任务回到执行中，修改后可重新提交。
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

function MergeProposalCard({
  proposal,
  task,
  busy,
  onOpenTask,
  onApprove,
  onReject,
  onComplete,
}: {
  proposal: MergeProposal;
  task: Task | null;
  busy: boolean;
  onOpenTask: (id: string) => void;
  onApprove: (proposal: MergeProposal, note?: string) => void;
  onReject: (proposal: MergeProposal, note: string) => void;
  onComplete: (proposal: MergeProposal, commit?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [commit, setCommit] = useState("");

  return (
    <article className="studio-merge-card" data-status={proposal.status}>
      <div className="studio-merge-top">
        <MergePill proposal={proposal} />
        <span className="studio-pill" data-tone="p2">
          {MERGE_RISK_LABELS[proposal.risk]}
        </span>
        <span className="studio-muted" style={{ marginLeft: "auto" }}>
          {proposal.branch} → {proposal.base}
        </span>
      </div>

      <div className="studio-merge-title">
        {task === null ? (
          proposal.taskId
        ) : (
          <button type="button" onClick={() => onOpenTask(proposal.taskId)}>
            {task.title}
          </button>
        )}
        <span className="studio-mono">{proposal.id}</span>
      </div>

      <dl className="studio-kv" style={{ marginTop: 9 }}>
        <dt>变更摘要</dt>
        <dd>{proposal.summary}</dd>
        <dt>回滚方案</dt>
        <dd>{proposal.rollback}</dd>
        {proposal.reviewNote !== "" ? (
          <>
            <dt>评审备注</dt>
            <dd>{proposal.reviewNote}</dd>
          </>
        ) : null}
        {proposal.mergeCommit !== null ? (
          <>
            <dt>合并提交</dt>
            <dd className="studio-mono">{proposal.mergeCommit}</dd>
          </>
        ) : null}
        <dt>创建</dt>
        <dd>{formatDate(proposal.createdAt)}</dd>
      </dl>

      <div className="studio-merge-command">
        <span className="studio-faint">人工执行：</span>
        <code>
          git switch {proposal.base} && git merge --no-ff {proposal.branch}
        </code>
      </div>

      {proposal.status === "review" ? (
        <div className="studio-merge-actions">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="评审备注（打回时必填）"
            disabled={busy}
          />
          <div className="studio-actions">
            <button
              type="button"
              className="studio-btn"
              data-variant="primary"
              data-size="sm"
              disabled={busy}
              onClick={() => onApprove(proposal, note.trim() || undefined)}
            >
              <IconCheck width={13} height={13} />
              批准
            </button>
            <button
              type="button"
              className="studio-btn"
              data-variant="danger"
              data-size="sm"
              disabled={busy || note.trim() === ""}
              title={note.trim() === "" ? "打回必须写清楚原因" : "打回并退回执行"}
              onClick={() => onReject(proposal, note.trim())}
            >
              打回
            </button>
          </div>
        </div>
      ) : proposal.status === "approved" ? (
        <div className="studio-merge-actions">
          <input
            value={commit}
            onChange={(event) => setCommit(event.target.value)}
            placeholder="合并提交 SHA（可选）"
            disabled={busy}
          />
          <button
            type="button"
            className="studio-btn"
            data-variant="primary"
            data-size="sm"
            disabled={busy}
            onClick={() => onComplete(proposal, commit.trim() || undefined)}
          >
            <IconCheck width={13} height={13} />
            标记已合并
          </button>
        </div>
      ) : (
        <div className="studio-action-note">
          {proposal.status === "merged"
            ? `已合并${proposal.mergedAt !== null ? ` · ${formatDate(proposal.mergedAt)}` : ""}`
            : "已打回；任务回到执行中，修改后可重新提交。"}
        </div>
      )}
    </article>
  );
}

function TeamView({
  data,
  onNewRole,
  onExecutor,
}: {
  data: BootstrapResponse;
  onNewRole: () => void;
  onExecutor: (roleId: string, executor: AgentExecutor) => Promise<void>;
}) {
  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Org Studio</div>
          <h1 className="studio-title">团队</h1>
          <p className="studio-subtitle">
            角色是持久的职责契约，Agent 是可替换的运行实例。v0.1 先管理角色卡；下一阶段把它们编译成 DSH Agent Preset。
          </p>
        </div>
        <div className="studio-head-actions">
          <button
            className="studio-btn"
            data-variant="primary"
            type="button"
            onClick={onNewRole}
            disabled={data.project === null}
            title={data.project === null ? "请先创建项目" : "新增角色"}
          >
            <IconPlus width={14} height={14} />
            新增角色
          </button>
        </div>
      </div>

      {data.roles.length === 0 ? (
        <div className="studio-empty">
          <strong>还没有角色</strong>
          建一个 Lead、一个 Builder 和一个 Verifier，就可以开始跑任务了。
        </div>
      ) : (
        <div className="studio-role-grid">
          {data.roles.map((role) => {
            const load = data.tasks.filter(
              (task) =>
                task.ownerRoleId === role.id &&
                (task.status === "running" || task.status === "review"),
            ).length;
            return (
              <article key={role.id} className="studio-role-card">
                <div className="studio-role-top">
                  <div className="studio-avatar">{initials(role.name)}</div>
                  <div>
                    <h3>{role.name}</h3>
                    <div className="studio-role-title">
                      {role.title || "未填写职位"}
                    </div>
                  </div>
                  <span
                    className="studio-pill"
                    data-tone={load > 0 ? "accent" : "p2"}
                    style={{ marginLeft: "auto" }}
                  >
                    {load} 个进行中
                  </span>
                </div>
                <div className="studio-role-mission">
                  {role.mission || "还没有写使命。"}
                </div>
                {role.responsibilities.length > 0 ? (
                  <div className="studio-role-section">
                    <div className="studio-role-section-label">职责</div>
                    <ul className="studio-role-list">
                      {role.responsibilities.slice(0, 5).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {role.decisionRights.length > 0 ? (
                  <div className="studio-role-section">
                    <div className="studio-role-section-label">决策权</div>
                    <div className="studio-actions">
                      {role.decisionRights.slice(0, 4).map((item) => (
                        <span key={item} className="studio-pill" data-tone="accent">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="studio-role-section">
                  <div className="studio-role-section-label">岗位配置</div>
                  <div className="studio-role-salary">
                    <select
                      value={role.executor}
                      onChange={(event) =>
                        void onExecutor(
                          role.id,
                          event.target.value as AgentExecutor,
                        )
                      }
                      title="执行器"
                    >
                      <option value="dsh">{AGENT_EXECUTOR_LABELS.dsh}</option>
                      <option value="claude-code">
                        {AGENT_EXECUTOR_LABELS["claude-code"]}
                      </option>
                      <option value="codex">
                        {AGENT_EXECUTOR_LABELS.codex}
                      </option>
                    </select>
                    <span className="studio-mono">{role.model ?? "默认模型"}</span>
                    <span>
                      {role.tokenBudget === null
                        ? "单任务预算继承项目"
                        : `${role.tokenBudget.toLocaleString()} tokens/次`}
                    </span>
                    <span>
                      {role.dailyTokenBudget === null
                        ? "每日不限制"
                        : `${role.dailyTokenBudget.toLocaleString()} tokens/日`}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function Roster({
  roles,
  tasks,
  onGoTeam,
}: {
  roles: Role[];
  tasks: Task[];
  onGoTeam: () => void;
}) {
  if (roles.length === 0) {
    return (
      <div className="studio-empty">
        <strong>还没有角色</strong>
        先建一个 Lead 和 Builder，再开始派任务。
        <div style={{ marginTop: 10 }}>
          <button type="button" className="studio-btn" data-size="sm" onClick={onGoTeam}>
            去团队页
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="studio-roster">
      {roles.map((role) => {
        const open = tasks.filter(
          (task) =>
            task.ownerRoleId === role.id &&
            (task.status === "running" || task.status === "review"),
        ).length;
        return (
          <div key={role.id} className="studio-person">
            <div className="studio-avatar">{initials(role.name)}</div>
            <div>
              <div className="studio-person-name">{role.name}</div>
              <div className="studio-person-title">
                {role.title || "未填写职位"}
              </div>
            </div>
            <div className="studio-person-load">
              <strong>{open}</strong>
              进行中
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BranchPanel({
  branches,
  contractChanges,
  tasks,
}: {
  branches: Branch[];
  contractChanges: ContractChange[];
  tasks: Task[];
}) {
  if (branches.length === 0) {
    return (
      <div className="studio-empty" style={{ padding: 18 }}>
        <strong>还没有支线</strong>
        创建带分支名的任务，或派单一次；Studio 会自动登记支线并跟踪契约变更。
      </div>
    );
  }
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return (
    <div className="studio-branch-list">
      {branches.map((branch) => {
        const changes = contractChanges.filter(
          (change) => change.branchId === branch.id,
        );
        return (
          <article key={branch.id} className="studio-branch-card">
            <div className="studio-branch-head">
              <span className="studio-mono">{branch.name}</span>
              <span className="studio-pill" data-tone="accent">
                {BRANCH_STATUS_LABELS[branch.status]}
              </span>
              <span className="studio-faint" style={{ marginLeft: "auto" }}>
                {changes.length} 个契约变更
              </span>
            </div>
            <div className="studio-branch-goal">
              {branch.goal || "没有写支线目标。"}
            </div>
            <div className="studio-branch-meta">
              {branch.taskId === null
                ? "未绑定任务"
                : (taskById.get(branch.taskId)?.title ?? branch.taskId)}
              {branch.contractKeys.length > 0
                ? ` · 契约：${branch.contractKeys.join("、")}`
                : " · 还没有契约变更"}
            </div>
            {changes.length > 0 ? (
              <div className="studio-branch-changes">
                {changes.slice(-3).map((change) => (
                  <div key={change.id}>
                    <span className="studio-mono">{change.contract}</span>
                    <span>{change.change}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function TaskBoard({
  tasks,
  roles,
  mergeProposals,
  onOpenTask,
}: {
  tasks: Task[];
  roles: Role[];
  mergeProposals: MergeProposal[];
  onOpenTask: (id: string) => void;
}) {
  return (
    <div className="studio-board-wrap">
      <div className="studio-board">
        {TASK_STATUS_ORDER.map((status) => {
          const list = tasks.filter((task) => task.status === status);
          return (
            <section key={status} className="studio-column">
              <div className="studio-column-head">
                <span>{TASK_STATUS_LABELS[status]}</span>
                <span className="studio-count">{list.length}</span>
              </div>
              <div className="studio-column-body">
                {list.length === 0 ? (
                  <div
                    className="studio-faint"
                    style={{ padding: "12px 4px", fontSize: 10 }}
                  >
                    暂无任务
                  </div>
                ) : (
                  list.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      roles={roles}
                      mergeProposal={latestMergeForTask(
                        mergeProposals,
                        task.id,
                      )}
                      onOpen={onOpenTask}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  roles,
  mergeProposal,
  onOpen,
}: {
  task: Task;
  roles: Role[];
  mergeProposal: MergeProposal | null;
  onOpen: (id: string) => void;
}) {
  const done = acceptanceDone(task);
  const total = task.acceptance.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <button
      type="button"
      className="studio-task-card"
      onClick={() => onOpen(task.id)}
    >
      <div className="studio-task-top">
        <PriorityPill priority={task.priority} />
        <StatusPill status={task.status} />
        {task.integration ? (
          <span className="studio-pill" data-tone="p1">
            集成
          </span>
        ) : null}
        {mergeProposal !== null && mergeProposal.status !== "rejected" ? (
          <MergePill proposal={mergeProposal} />
        ) : null}
      </div>
      <div className="studio-task-title">{task.title}</div>
      {task.goal ? <div className="studio-task-goal">{task.goal}</div> : null}
      <div className="studio-progress">
        <span style={{ width: `${String(pct)}%` }} />
      </div>
      <div className="studio-task-foot">
        <span className="studio-task-owner">
          {roleName(roles, task.ownerRoleId)}
        </span>
        <span className="studio-task-progress">
          验收 {done}/{total}
        </span>
      </div>
    </button>
  );
}

function TaskDrawer({
  task,
  roles,
  mergeProposal,
  runs,
  verifications,
  reviews,
  codeMode,
  busy,
  onClose,
  onDispatch,
  onVerify,
  onReview,
  onToggleDocs,
  onTransition,
  onToggleAcceptance,
  onAddEvidence,
  onCreateMerge,
  onApproveMerge,
  onRejectMerge,
  onCompleteMerge,
  onExecuteMerge,
  onRollbackMerge,
}: {
  task: Task;
  roles: Role[];
  mergeProposal: MergeProposal | null;
  runs: AgentRun[];
  verifications: Verification[];
  reviews: IndependentReview[];
  codeMode: boolean;
  busy: boolean;
  onClose: () => void;
  onDispatch: () => Promise<boolean>;
  onVerify: (command: string) => Promise<boolean>;
  onReview: () => Promise<boolean>;
  onToggleDocs: () => Promise<void>;
  onTransition: (status: TaskStatus) => void;
  onToggleAcceptance: (id: string) => void;
  onAddEvidence: (text: string) => Promise<boolean>;
  onCreateMerge: (input: CreateMergeProposalInput) => Promise<boolean>;
  onApproveMerge: (note?: string) => void;
  onRejectMerge: (note: string) => void;
  onCompleteMerge: (mergeCommit?: string) => void;
  onExecuteMerge: () => void;
  onRollbackMerge: () => void;
}) {
  const [evidenceText, setEvidenceText] = useState("");
  const done = acceptanceDone(task);
  const total = task.acceptance.length;
  const complete = allAccepted(task);
  const hasEvidence = task.evidence.length > 0;
  const readyToAccept = complete && hasEvidence;
  const transitions = ALLOWED_TRANSITIONS[task.status];

  const submitEvidence = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const text = evidenceText.trim();
    if (text === "") return;
    const ok = await onAddEvidence(text);
    if (ok) setEvidenceText("");
  };

  return (
    <div
      className="studio-drawer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <aside
        className="studio-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`任务：${task.title}`}
      >
        <div className="studio-drawer-head">
          <div>
            <div className="studio-actions" style={{ marginBottom: 8 }}>
              <StatusPill status={task.status} />
              <PriorityPill priority={task.priority} />
              {mergeProposal !== null ? (
                <MergePill proposal={mergeProposal} />
              ) : null}
            </div>
            <h2>{task.title}</h2>
            <div className="studio-muted">
              {roleName(roles, task.ownerRoleId)} 负责 ·{" "}
              {roleName(roles, task.reviewerRoleId)} 验收
            </div>
          </div>
          <button
            type="button"
            className="studio-btn studio-drawer-close"
            data-size="icon"
            onClick={onClose}
            aria-label="关闭"
          >
            <IconX width={15} height={15} />
          </button>
        </div>

        <div className="studio-drawer-body">
          <section>
            <div className="studio-section-label">目标</div>
            <div className="studio-section-text">
              {task.goal || "还没有写目标。"}
            </div>
          </section>

          <section>
            <div className="studio-section-label">
              验收标准 · {done}/{total}
            </div>
            <div className="studio-acceptance">
              {task.acceptance.map((item) => (
                <label
                  key={item.id}
                  className="studio-check"
                  data-done={item.done}
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={busy || task.status === "done"}
                    onChange={() => onToggleAcceptance(item.id)}
                  />
                  <span>{item.text}</span>
                </label>
              ))}
            </div>
            {!complete && task.status === "review" ? (
              <div className="studio-action-note">
                还有 {total - done} 条验收标准未完成，不能验收通过。
              </div>
            ) : null}
            {complete && !hasEvidence && task.status === "review" ? (
              <div className="studio-action-note">
                验收标准已全部勾选，但还需要至少一条可复现的证据。
              </div>
            ) : null}
          </section>

          <section>
            <div className="studio-section-label">证据</div>
            {task.evidence.length === 0 ? (
              <div className="studio-faint" style={{ fontSize: 11 }}>
                还没有记录证据。验收前至少留一条可复现的命令、测试或 replay。
              </div>
            ) : (
              <div className="studio-evidence">
                {task.evidence.map((item) => (
                  <div key={item.id} className="studio-evidence-item">
                    {item.text}
                    <div className="studio-faint">
                      {formatDate(item.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {task.status !== "done" ? (
              <form
                onSubmit={(event) => void submitEvidence(event)}
                style={{ display: "flex", gap: 6, marginTop: 8 }}
              >
                <input
                  className="studio-input"
                  style={{
                    flex: 1,
                    border: "1px solid var(--st-border)",
                    borderRadius: 8,
                    background: "var(--st-panel)",
                    padding: "7px 9px",
                    outline: "none",
                    fontSize: 11,
                  }}
                  value={evidenceText}
                  onChange={(event) => setEvidenceText(event.target.value)}
                  placeholder="例如：pnpm test ability — 42 passed"
                  disabled={busy}
                />
                <button
                  className="studio-btn"
                  data-size="sm"
                  type="submit"
                  disabled={busy || evidenceText.trim() === ""}
                >
                  记录
                </button>
              </form>
            ) : null}
          </section>

          <section>
            <div className="studio-section-label">上下文</div>
            <dl className="studio-kv">
              <dt>票类型</dt>
              <dd>
                {TASK_KIND_LABELS[task.kind]}
                {task.integration ? " · 集成/playtest" : ""}
              </dd>
              {task.diagnosis !== "" ? (
                <>
                  <dt>诊断</dt>
                  <dd className="studio-pre">{task.diagnosis}</dd>
                </>
              ) : null}
              {task.plan !== "" ? (
                <>
                  <dt>修改计划</dt>
                  <dd className="studio-pre">{task.plan}</dd>
                </>
              ) : null}
              <dt>模块</dt>
              <dd className="studio-mono">{task.module ?? "未指定"}</dd>
              <dt>契约</dt>
              <dd className="studio-mono">{task.contractRef ?? "未指定"}</dd>
              <dt>失败次数</dt>
              <dd>
                {runs.filter((run) => run.status === "failed").length} / 2
              </dd>
              {task.originTaskId !== null ? (
                <>
                  <dt>重拆来源</dt>
                  <dd className="studio-mono">{task.originTaskId}</dd>
                </>
              ) : null}
              <dt>分支</dt>
              <dd className="studio-mono">{task.branch ?? "未创建"}</dd>
              <dt>负责人</dt>
              <dd>
                {roleName(roles, task.ownerRoleId)}
                {roleTitle(roles, task.ownerRoleId)
                  ? ` · ${roleTitle(roles, task.ownerRoleId)}`
                  : ""}
              </dd>
              <dt>验收人</dt>
              <dd>
                {roleName(roles, task.reviewerRoleId)}
                {roleTitle(roles, task.reviewerRoleId)
                  ? ` · ${roleTitle(roles, task.reviewerRoleId)}`
                  : ""}
              </dd>
              <dt>创建</dt>
              <dd>{formatDate(task.createdAt)}</dd>
              <dt>更新</dt>
              <dd>{formatDate(task.updatedAt)}</dd>
              <dt>任务 ID</dt>
              <dd className="studio-mono">{task.id}</dd>
            </dl>
            <label className="studio-check" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={task.docsSynced}
                onChange={() => void onToggleDocs()}
              />
              文档已同步（PRD / ADR / CONTEXT）
            </label>
            <div className="studio-hint">
              项目绑定了知识文档时，完成前必须确认文档已同步。
            </div>
          </section>

          <TaskAgentPanel
            task={task}
            runs={runs}
            busy={busy}
            codeMode={codeMode}
            onDispatch={onDispatch}
          />

          <TaskVerificationPanel
            task={task}
            runs={runs}
            verifications={verifications}
            busy={busy}
            onVerify={onVerify}
          />

          <TaskReviewPanel
            task={task}
            runs={runs}
            reviews={reviews}
            ownerModel={
              roles.find((role) => role.id === task.ownerRoleId)?.model ??
              null
            }
            busy={busy}
            onReview={onReview}
          />

          <TaskMergePanel
            task={task}
            proposal={mergeProposal}
            verification={
              mergeProposal?.verificationId === null ||
              mergeProposal?.verificationId === undefined
                ? null
                : (verifications.find(
                    (item) => item.id === mergeProposal.verificationId,
                  ) ?? null)
            }
            verifications={verifications}
            codeMode={codeMode}
            busy={busy}
            onCreate={onCreateMerge}
            onApprove={onApproveMerge}
            onReject={onRejectMerge}
            onComplete={onCompleteMerge}
            onExecute={onExecuteMerge}
            onRollback={onRollbackMerge}
          />

          <section>
            <div className="studio-section-label">推进任务</div>
            {transitions.length === 0 ? (
              <div className="studio-faint" style={{ fontSize: 11 }}>
                任务已完成，不能继续推进。需要新工作请创建后续任务。
              </div>
            ) : (
              <div className="studio-actions">
                {transitions.map((status) => {
                  const blockedByAcceptance = status === "done" && !readyToAccept;
                  return (
                    <button
                      key={status}
                      type="button"
                      className="studio-btn"
                      data-variant={status === "done" ? "primary" : undefined}
                      data-size="sm"
                      disabled={busy || blockedByAcceptance}
                      title={
                        blockedByAcceptance
                          ? complete
                            ? "至少记录一条证据后才能验收通过"
                            : "所有验收标准完成后才能验收通过"
                          : TRANSITION_LABELS[status]
                      }
                      onClick={() => onTransition(status)}
                    >
                      {status === "done" ? (
                        <IconCheck width={13} height={13} />
                      ) : null}
                      {TRANSITION_LABELS[status]}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="studio-action-note">
              v0.9 已接入 worktree 代码执行、Host 独立验证、模块契约与契约护栏、失败/验证门禁、token 计量与决策决策台；合并与 Git 命令仍由人执行。
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function TaskReviewPanel({
  task,
  runs,
  reviews,
  ownerModel,
  busy,
  onReview,
}: {
  task: Task;
  runs: AgentRun[];
  reviews: IndependentReview[];
  ownerModel: string | null;
  busy: boolean;
  onReview: () => Promise<boolean>;
}) {
  const latest = reviews[0] ?? null;
  const hasWorkspace = runs.some((run) => run.workspacePath !== null);
  return (
    <section>
      <div className="studio-section-label">独立评审</div>
      <div className="studio-action-note" style={{ marginTop: 0 }}>
        由验收人角色另开 Agent 会话，只看 diff 和 Host 验证结果，不改代码。
        代码任务完成前必须有一次通过的独立评审。
      </div>
      {!hasWorkspace ? (
        <div className="studio-faint" style={{ fontSize: 11, marginTop: 9 }}>
          还没有带 worktree 的 Run；先派单执行一次。
        </div>
      ) : (
        <>
          <button
            type="button"
            className="studio-btn"
            data-size="sm"
            style={{ marginTop: 9 }}
            disabled={busy}
            onClick={() => void onReview()}
          >
            <IconSpark width={13} height={13} />
            运行独立评审
          </button>
          {latest !== null ? (
            <div
              className="studio-review"
              data-verdict={latest.verdict}
            >
              <div className="studio-review-head">
                <span
                  className="studio-pill"
                  data-tone={latest.verdict === "pass" ? "ok" : "p0"}
                >
                  {latest.verdict === "pass" ? "通过" : "不通过"}
                </span>
                <span className="studio-faint">
                  {latest.model ?? "未知模型"} ·{" "}
                  {latest.tokens === null
                    ? "未计量"
                    : `${String(latest.tokens)} tokens`}
                </span>
              </div>
              <p>{latest.summary}</p>
              {ownerModel !== null &&
              latest.model !== null &&
              ownerModel === latest.model ? (
                <div className="studio-alert" data-tone="warn">
                  评审与实现使用同一模型（{latest.model}），可能存在共享盲点。
                </div>
              ) : null}
              {latest.findings.length > 0 ? (
                <ul>
                  {latest.findings.slice(0, 8).map((finding, index) => (
                    <li key={`${String(index)}-${finding}`}>{finding}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="studio-faint" style={{ fontSize: 11, marginTop: 8 }}>
              还没有独立评审记录。
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TaskVerificationPanel({
  task,
  runs,
  verifications,
  busy,
  onVerify,
}: {
  task: Task;
  runs: AgentRun[];
  verifications: Verification[];
  busy: boolean;
  onVerify: (command: string) => Promise<boolean>;
}) {
  const [command, setCommand] = useState(
    task.verifyCommand ?? "npm test",
  );
  const latest = verifications[0] ?? null;
  const workspaceRun = runs.find((run) => run.workspacePath !== null);
  return (
    <section>
      <div className="studio-section-label">独立验证</div>
      <div className="studio-action-note" style={{ marginTop: 0 }}>
        由 Studio Host 在任务 worktree 内直接执行，不经过 Agent 会话。
        验证通过会写入 evidence，但不会自动通过验收。
      </div>
      {workspaceRun === undefined ? (
        <div className="studio-faint" style={{ fontSize: 11, marginTop: 9 }}>
          还没有带 worktree 的 Run；先派单执行一次。
        </div>
      ) : (
        <>
          <div className="studio-verify-form">
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              aria-label="验证命令"
              placeholder="npm test"
            />
            <button
              type="button"
              className="studio-btn"
              data-size="sm"
              disabled={busy || command.trim() === ""}
              onClick={() => void onVerify(command.trim())}
            >
              <IconCheck width={13} height={13} />
              运行验证
            </button>
          </div>
          {latest === null ? (
            <div className="studio-faint" style={{ fontSize: 11, marginTop: 8 }}>
              还没有验证记录。
            </div>
          ) : (
            <div
              className="studio-verification"
              data-passed={latest.passed}
            >
              <div className="studio-verification-head">
                <span className="studio-pill" data-tone={latest.passed ? "ok" : "p0"}>
                  {latest.passed ? "通过" : "失败"}
                </span>
                <code>{latest.command}</code>
                <span className="studio-faint">exit {latest.exitCode}</span>
              </div>
              <pre>{latest.output.slice(0, 4000) || "（无输出）"}</pre>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TaskAgentPanel({
  task,
  runs,
  busy,
  codeMode,
  onDispatch,
}: {
  task: Task;
  runs: AgentRun[];
  busy: boolean;
  codeMode: boolean;
  onDispatch: () => Promise<boolean>;
}) {
  const latest = runs[0] ?? null;
  const canDispatch =
    task.ownerRoleId !== null &&
    (task.status === "backlog" || task.status === "ready");

  return (
    <section>
      <div className="studio-section-label">Agent 派单</div>
      <div className="studio-action-note" style={{ marginTop: 0 }}>
        {codeMode
          ? "代码模式：Agent 在独立 worktree 内实现任务、运行测试并把 diff 写入 Run；不会合并或推送。"
          : "分析模式：还没有绑定代码仓库。Agent 只读任务与契约，返回结构化回执；在设置里绑定仓库即可进入代码模式。"}
      </div>
      <div className="studio-actions" style={{ marginTop: 9 }}>
        <button
          type="button"
          className="studio-btn"
          data-variant="primary"
          data-size="sm"
          disabled={busy || !canDispatch}
          title={
            task.ownerRoleId === null
              ? "请先给任务指定负责人角色"
              : canDispatch
                ? "派单给负责人角色做分析"
                : "任务已在执行或验收，不能重复派单"
          }
          onClick={() => void onDispatch()}
        >
          <IconSpark width={13} height={13} />
          {latest?.status === "running" || latest?.status === "queued"
            ? "Agent 执行中…"
            : codeMode
              ? "派单执行"
              : "派单分析"}
        </button>
        {latest !== null ? (
          <span className="studio-pill" data-tone={runTone(latest.status)}>
            {AGENT_RUN_STATUS_LABELS[latest.status]}
          </span>
        ) : null}
      </div>

      {runs.length === 0 ? (
        <div className="studio-faint" style={{ fontSize: 11, marginTop: 9 }}>
          还没有 Agent 运行记录。
        </div>
      ) : (
        <div className="studio-run-list">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}

function runTone(status: AgentRun["status"]): string {
  if (status === "succeeded") return "ok";
  if (status === "failed") return "p0";
  if (status === "running") return "accent";
  return "p2";
}

function RunCard({ run }: { run: AgentRun }) {
  const receipt = run.receipt;
  return (
    <details className="studio-run-card">
      <summary>
        <span className="studio-pill" data-tone={runTone(run.status)}>
          {AGENT_RUN_STATUS_LABELS[run.status]}
        </span>
        <span className="studio-mono">{run.model ?? "默认模型"}</span>
        <span className="studio-faint">
          {run.tokens === null ? "token 待计量" : `${String(run.tokens)} tokens`}
        </span>
        <span className="studio-faint" style={{ marginLeft: "auto" }}>
          {formatDate(run.startedAt)}
        </span>
      </summary>
      <div className="studio-run-body">
        {run.error !== null ? (
          <div className="studio-alert">{run.error}</div>
        ) : null}
        {run.budgetWarning !== null ? (
          <div className="studio-alert" data-tone="warn">
            {run.budgetWarning}
          </div>
        ) : null}
        {run.status === "running" || run.status === "queued" ? (
          <div className="studio-faint" style={{ fontSize: 11 }}>
            Agent 正在工作；页面每 4 秒刷新一次。
          </div>
        ) : null}
        {run.branchName !== null || run.workspacePath !== null ? (
          <div className="studio-run-workspace">
            {run.branchName !== null ? (
              <div>
                <span>分支</span>
                <code>{run.branchName}</code>
              </div>
            ) : null}
            {run.workspacePath !== null ? (
              <div>
                <span>工作区</span>
                <code>{run.workspacePath}</code>
              </div>
            ) : null}
            {run.diffStat !== null && run.diffStat !== "" ? (
              <pre>{run.diffStat}</pre>
            ) : null}
          </div>
        ) : null}
        {receipt !== null ? (
          <ReceiptView receipt={receipt} />
        ) : run.output !== "" ? (
          <pre className="studio-run-output">{run.output}</pre>
        ) : null}
      </div>
    </details>
  );
}

function ReceiptView({ receipt }: { receipt: AgentReceipt }) {
  return (
    <div className="studio-receipt">
      {receipt.summary.trim() === "" || receipt.evidence.length === 0 ? (
        <div className="studio-alert" data-tone="warn">
          回执不完整：Agent 必须给出非空 summary 和至少一条 evidence，任务不能进入验收。
        </div>
      ) : null}
      <div className="studio-section-text">
        {receipt.summary || "（没有 summary）"}
      </div>
      <ReceiptList label="证据" items={receipt.evidence} />
      <ReceiptList
        label="产物"
        items={receipt.artifacts.map(
          (item) => `${item.kind}: ${item.path}`,
        )}
      />
      <ReceiptList
        label="决策"
        items={receipt.decisions.map(
          (item) => `${item.title} (${item.scope}) — ${item.rationale}`,
        )}
      />
      <ReceiptList
        label="契约变更"
        items={receipt.contractDeltas.map(
          (item) => `${item.contract}: ${item.change}`,
        )}
      />
      <ReceiptList
        label="被否决方案"
        items={receipt.rejectedOptions.map(
          (item) => `${item.option} — ${item.reason}`,
        )}
      />
      <ReceiptList label="阻塞" items={receipt.blockers} />
    </div>
  );
}

function ReceiptList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="studio-receipt-list">
      <span>{label}</span>
      <ul>
        {items.map((item, index) => (
          <li key={`${label}-${String(index)}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function TaskMergePanel({
  task,
  proposal,
  verification,
  verifications,
  codeMode,
  busy,
  onCreate,
  onApprove,
  onReject,
  onComplete,
  onExecute,
  onRollback,
}: {
  task: Task;
  proposal: MergeProposal | null;
  verification: Verification | null;
  verifications: Verification[];
  codeMode: boolean;
  busy: boolean;
  onCreate: (input: CreateMergeProposalInput) => Promise<boolean>;
  onApprove: (note?: string) => void;
  onReject: (note: string) => void;
  onComplete: (mergeCommit?: string) => void;
  onExecute: () => void;
  onRollback: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [branch, setBranch] = useState(task.branch ?? "");
  const [base, setBase] = useState("main");
  const [risk, setRisk] = useState<MergeRisk>("medium");
  const [rollback, setRollback] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [mergeCommit, setMergeCommit] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const complete = allAccepted(task);
  const hasEvidence = task.evidence.length > 0;
  const reviewable = task.status === "done";
  const postVerification =
    proposal?.postMergeVerificationId === null ||
    proposal?.postMergeVerificationId === undefined
      ? null
      : (verifications.find(
          (item) => item.id === proposal.postMergeVerificationId,
        ) ?? null);
  const canSubmit =
    reviewable &&
    complete &&
    hasEvidence &&
    branch.trim() !== "" &&
    summary.trim() !== "" &&
    rollback.trim() !== "";
  const activeProposal =
    proposal !== null && proposal.status !== "rejected" ? proposal : null;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) {
      setLocalError("先完成验收、记录证据，并填写分支、摘要和回滚方案。");
      return;
    }
    setLocalError(null);
    const ok = await onCreate({
      branch: branch.trim(),
      base: base.trim() || "main",
      risk,
      summary: summary.trim(),
      rollback: rollback.trim(),
    });
    if (ok) {
      setSummary("");
      setRollback("");
    }
  };

  return (
    <section>
      <div className="studio-section-label">合并治理</div>

      {activeProposal === null ? (
        <>
          {proposal !== null && proposal.status === "rejected" ? (
            <div className="studio-alert" data-tone="warn" style={{ marginBottom: 10 }}>
              上次合并提案被打回：{proposal.reviewNote || "未填写原因"}
            </div>
          ) : null}
          {!reviewable ? (
            <div className="studio-faint" style={{ fontSize: 11 }}>
              任务验收通过后，才能提交合并提案。
            </div>
          ) : !complete || !hasEvidence ? (
            <div className="studio-faint" style={{ fontSize: 11 }}>
              先完成全部验收项并记录至少一条证据，才能提交合并提案。
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="studio-merge-form">
              {codeMode && verification === null ? (
                <div className="studio-alert" data-tone="warn">
                  代码项目需要先跑一次通过的「独立验证」，才能提交合并提案。
                </div>
              ) : null}
              {localError !== null ? (
                <div className="studio-alert">{localError}</div>
              ) : null}
              <div className="studio-field-row">
                <div className="studio-field">
                  <label htmlFor="merge-branch">分支</label>
                  <input
                    id="merge-branch"
                    value={branch}
                    onChange={(event) => setBranch(event.target.value)}
                    placeholder="task/003-ability"
                  />
                </div>
                <div className="studio-field">
                  <label htmlFor="merge-base">目标分支</label>
                  <input
                    id="merge-base"
                    value={base}
                    onChange={(event) => setBase(event.target.value)}
                    placeholder="main"
                  />
                </div>
              </div>
              <div className="studio-field">
                <label htmlFor="merge-risk">风险</label>
                <select
                  id="merge-risk"
                  value={risk}
                  onChange={(event) => setRisk(event.target.value as MergeRisk)}
                >
                  <option value="low">{MERGE_RISK_LABELS.low}</option>
                  <option value="medium">{MERGE_RISK_LABELS.medium}</option>
                  <option value="high">{MERGE_RISK_LABELS.high}</option>
                </select>
              </div>
              <div className="studio-field">
                <label htmlFor="merge-summary">变更摘要</label>
                <textarea
                  id="merge-summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="改了什么、影响哪些契约/模块"
                />
              </div>
              <div className="studio-field">
                <label htmlFor="merge-rollback">回滚方案</label>
                <textarea
                  id="merge-rollback"
                  value={rollback}
                  onChange={(event) => setRollback(event.target.value)}
                  placeholder="出问题时怎么回滚？"
                />
              </div>
              <div className="studio-actions" style={{ marginTop: 10 }}>
                <button
                  type="submit"
                  className="studio-btn"
                  data-variant="primary"
                  data-size="sm"
                  disabled={busy || !canSubmit}
                >
                  <IconGitMerge width={13} height={13} />
                  提交合并提案
                </button>
              </div>
              <div className="studio-action-note">
                Studio 只记录治理状态，不执行 Git。合并命令由人或 Integrator 执行。
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <div className="studio-merge-card">
            <div className="studio-merge-top">
              <MergePill proposal={activeProposal} />
              <span className="studio-pill" data-tone="p2">
                {MERGE_RISK_LABELS[activeProposal.risk]}
              </span>
              <span className="studio-muted" style={{ marginLeft: "auto" }}>
                {activeProposal.branch} → {activeProposal.base}
              </span>
            </div>
            <dl className="studio-kv" style={{ marginTop: 10 }}>
              <dt>变更摘要</dt>
              <dd>{activeProposal.summary}</dd>
              <dt>回滚方案</dt>
              <dd>{activeProposal.rollback}</dd>
              {activeProposal.changedFiles.length > 0 ? (
                <>
                  <dt>变更文件</dt>
                  <dd className="studio-mono">
                    {activeProposal.changedFiles.join("、")}
                  </dd>
                </>
              ) : null}
              {activeProposal.diffStat !== null ? (
                <>
                  <dt>Diff</dt>
                  <dd>
                    <pre className="studio-diff">{activeProposal.diffStat}</pre>
                  </dd>
                </>
              ) : null}
              {verification !== null ? (
                <>
                  <dt>独立验证</dt>
                  <dd>
                    <span
                      className="studio-pill"
                      data-tone={verification.passed ? "ok" : "p0"}
                    >
                      {verification.passed ? "通过" : "失败"}
                    </span>{" "}
                    <code>{verification.command}</code>
                  </dd>
                </>
              ) : null}
              <dt>评审备注</dt>
              <dd>{activeProposal.reviewNote || "无"}</dd>
              {activeProposal.mergeCommit !== null ? (
                <>
                  <dt>合并提交</dt>
                  <dd className="studio-mono">{activeProposal.mergeCommit}</dd>
                </>
              ) : null}
              <dt>创建</dt>
              <dd>{formatDate(activeProposal.createdAt)}</dd>
              {activeProposal.mergedAt !== null ? (
                <>
                  <dt>合并时间</dt>
                  <dd>{formatDate(activeProposal.mergedAt)}</dd>
                </>
              ) : null}
            </dl>
            <div className="studio-merge-command">
              <span className="studio-faint">人工执行：</span>
              <code>
                git switch {activeProposal.base} && git merge --no-ff{" "}
                {activeProposal.branch}
              </code>
            </div>
          </div>

          {activeProposal.status === "review" ? (
            <div className="studio-merge-actions">
              <input
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="评审备注（打回时必填）"
                disabled={busy}
              />
              <div className="studio-actions">
                <button
                  type="button"
                  className="studio-btn"
                  data-variant="primary"
                  data-size="sm"
                  disabled={busy}
                  onClick={() => onApprove(reviewNote.trim() || undefined)}
                >
                  <IconCheck width={13} height={13} />
                  批准
                </button>
                <button
                  type="button"
                  className="studio-btn"
                  data-variant="danger"
                  data-size="sm"
                  disabled={busy || reviewNote.trim() === ""}
                  title={
                    reviewNote.trim() === ""
                      ? "打回必须写清楚原因"
                      : "打回并退回执行"
                  }
                  onClick={() => onReject(reviewNote.trim())}
                >
                  打回
                </button>
              </div>
            </div>
          ) : activeProposal.status === "approved" ? (
            <div className="studio-merge-actions">
              <input
                value={mergeCommit}
                onChange={(event) => setMergeCommit(event.target.value)}
                placeholder="合并提交 SHA（可选）"
                disabled={busy}
              />
              <button
                type="button"
                className="studio-btn"
                data-variant="primary"
                data-size="sm"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `将在当前仓库执行 Git merge ${activeProposal.branch} → ${activeProposal.base}，且要求当前就在 ${activeProposal.base} 上、工作区干净。确定吗？`,
                    )
                  ) {
                    onExecute();
                  }
                }}
              >
                执行 Git 合并
              </button>
              <button
                type="button"
                className="studio-btn"
                data-size="sm"
                disabled={busy}
                onClick={() => onComplete(mergeCommit.trim() || undefined)}
              >
                <IconCheck width={13} height={13} />
                仅记录合并
              </button>
            </div>
          ) : (
            <>
            <div className="studio-action-note">
              合并已完成；如需继续变更，请创建后续任务。
            </div>
            {postVerification !== null ? (
              <div
                className="studio-verification"
                data-passed={postVerification.passed}
                style={{ marginTop: 8 }}
              >
                <div className="studio-verification-head">
                  <span
                    className="studio-pill"
                    data-tone={postVerification.passed ? "ok" : "p0"}
                  >
                    合并后回归{postVerification.passed ? "通过" : "失败"}
                  </span>
                  <code>{postVerification.command}</code>
                  <span className="studio-faint">
                    exit {postVerification.exitCode}
                  </span>
                </div>
                <pre>{postVerification.output.slice(0, 2000) || "（无输出）"}</pre>
              </div>
            ) : null}
            {postVerification !== null &&
            !postVerification.passed &&
            activeProposal.rollbackCommit === null ? (
              <button
                type="button"
                className="studio-btn"
                data-variant="danger"
                data-size="sm"
                style={{ marginTop: 8 }}
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "将在当前仓库执行 git revert <merge commit>，确定回滚吗？",
                    )
                  ) {
                    onRollback();
                  }
                }}
              >
                回滚这次合并
              </button>
            ) : null}
            {activeProposal.rollbackCommit !== null ? (
              <div className="studio-faint" style={{ fontSize: 10, marginTop: 6 }}>
                已回滚：{activeProposal.rollbackCommit}
              </div>
            ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}

function RecentEvents({ events }: { events: BootstrapResponse["events"] }) {
  return (
    <section className="studio-panel">
      <div className="studio-panel-head">
        <IconSpark width={14} height={14} />
        <h3>最近活动</h3>
        <span className="studio-muted">append-only 事件</span>
      </div>
      <div className="studio-panel-body">
        {events.length === 0 ? (
          <div className="studio-faint" style={{ fontSize: 11 }}>
            还没有事件。
          </div>
        ) : (
          <div className="studio-events">
            {events.slice(0, 8).map((event) => (
              <div key={event.id} className="studio-event">
                <span className="studio-event-dot" />
                <span>
                  <span className="studio-mono">{event.type}</span>
                  {event.taskId !== null ? (
                    <span className="studio-faint"> · {event.taskId}</span>
                  ) : null}
                </span>
                <span className="studio-event-time">{formatDate(event.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsView({
  boot,
  data,
  theme,
  onTheme,
  onNewProject,
  onBindRepo,
  onReload,
  onCompany,
  onBundle,
}: {
  boot: NonNullable<ReturnType<typeof readStudioBoot>>;
  data: BootstrapResponse;
  theme: "dark" | "light";
  onTheme: (theme: "dark" | "light") => void;
  onNewProject: () => void;
  onBindRepo: () => void;
  onReload: () => void;
  onCompany: (name: string) => Promise<void>;
  onBundle: () => Promise<void>;
}) {
  const [companyName, setCompanyName] = useState(data.company.name);
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    setCompanyName(data.company.name);
  }, [data.company.name]);

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Runtime</div>
          <h1 className="studio-title">设置</h1>
          <p className="studio-subtitle">
            这里只展示运行事实，不提供“改配置重启”之类的隐式操作。数据在本地文件里，刷新/重启不丢。
          </p>
        </div>
        <div className="studio-head-actions">
          <button className="studio-btn" type="button" onClick={onReload}>
            重新加载
          </button>
        </div>
      </div>

      <div className="studio-settings-grid">
        <section className="studio-settings-card">
          <h3>工作室</h3>
          <form
            className="studio-field"
            onSubmit={(event) => {
              event.preventDefault();
              if (savingCompany || companyName.trim() === "") return;
              setSavingCompany(true);
              void onCompany(companyName.trim()).finally(() =>
                setSavingCompany(false),
              );
            }}
          >
            <label htmlFor="company-name">工作室名称</label>
            <input
              id="company-name"
              value={companyName}
              maxLength={80}
              onChange={(event) => setCompanyName(event.target.value)}
            />
            <p className="studio-hint">
              显示在顶部品牌和工作室仪表盘；默认「AI工作室」。
            </p>
            <button
              className="studio-btn"
              data-size="sm"
              data-variant="primary"
              type="submit"
              disabled={savingCompany || companyName.trim() === ""}
            >
              {savingCompany ? "保存中…" : "保存工作室名称"}
            </button>
          </form>
        </section>

        <section className="studio-settings-card">
          <h3>版本与兼容性</h3>
          <dl className="studio-kv">
            <dt>插件</dt>
            <dd className="studio-mono">v{boot.pluginVersion}</dd>
            <dt>DSH</dt>
            <dd className="studio-mono">{data.app.dshVersion}</dd>
            <dt>兼容状态</dt>
            <dd>
              <span
                className="studio-pill"
                data-tone={
                  data.app.compatibility.status === "supported"
                    ? "ok"
                    : data.app.compatibility.status === "untested"
                      ? "p0"
                      : "p1"
                }
              >
                {data.app.compatibility.status}
              </span>
            </dd>
            <dt>验证基线</dt>
            <dd className="studio-mono">
              {data.app.compatibility.testedWith}
            </dd>
          </dl>
          <p className="studio-hint" style={{ marginTop: 10 }}>
            {data.app.compatibility.message}
          </p>
        </section>

        <section className="studio-settings-card">
          <h3>数据</h3>
          <dl className="studio-kv">
            <dt>数据目录</dt>
            <dd className="studio-mono">{data.app.dataDir}</dd>
            <dt>Schema</dt>
            <dd className="studio-mono">v{String(data.app.schemaVersion)}</dd>
            <dt>服务时间</dt>
            <dd>{formatDate(data.app.serverTime)}</dd>
            <dt>项目</dt>
            <dd>{data.projects.length} 个</dd>
          </dl>
          <div style={{ marginTop: 12 }}>
            <button className="studio-btn" data-size="sm" type="button" onClick={onNewProject}>
              <IconPlus width={13} height={13} />
              新建项目
            </button>
          </div>
        </section>

        <section className="studio-settings-card">
          <h3>代码仓库</h3>
          <dl className="studio-kv">
            <dt>项目</dt>
            <dd>{data.project?.name ?? "未选择"}</dd>
            <dt>仓库路径</dt>
            <dd className="studio-mono">
              {data.project?.repoPath ?? "未绑定（只做分析）"}
            </dd>
          </dl>
          <p className="studio-hint" style={{ marginTop: 8 }}>
            绑定 git 仓库后，派单会为每个任务创建独立 worktree 和
            `studio/&lt;taskId&gt;` 分支；不绑定则只做只读分析。
          </p>
          <div style={{ marginTop: 12 }}>
            <button
              className="studio-btn"
              data-size="sm"
              type="button"
              onClick={onBindRepo}
              disabled={data.project === null}
            >
              绑定 / 更换仓库
            </button>
            <button
              className="studio-btn"
              data-size="sm"
              type="button"
              onClick={() => void onBundle()}
              disabled={data.project === null || data.project.repoPath === null}
              title="导出状态 + Git 历史 + 迁移说明"
            >
              导出项目包
            </button>
          </div>
        </section>

        <section className="studio-settings-card">
          <h3>能力边界</h3>
          <dl className="studio-kv">
            <dt>独立页面</dt>
            <dd>{data.features.independentPage ? "可用" : "不可用"}</dd>
            <dt>文件持久化</dt>
            <dd>{data.features.filePersistence ? "可用" : "不可用"}</dd>
            <dt>公司仪表盘</dt>
            <dd>{data.features.ownerDashboard ? "可用" : "不可用"}</dd>
            <dt>决策台</dt>
            <dd>{data.features.decisionBoard ? "可用" : "不可用"}</dd>
            <dt>支线/契约</dt>
            <dd>{data.features.branchBoard ? "可用" : "不可用"}</dd>
            <dt>代码执行</dt>
            <dd>{data.features.codeExecution ? "可用（worktree）" : "不可用"}</dd>
            <dt>独立验证</dt>
            <dd>{data.features.verification ? "可用（Host 执行）" : "不可用"}</dd>
            <dt>契约护栏</dt>
            <dd>
              {data.features.contractGuard
                ? "可用（契约/禁止路径越界自动升级）"
                : "不可用"}
            </dd>
            <dt>独立评审</dt>
            <dd>
              {data.features.independentReview
                ? "可用（验收人 Agent）"
                : "不可用"}
            </dd>
            <dt>合并治理</dt>
            <dd>
              {data.features.mergeGovernance
                ? "可用（记录评审，人工执行 Git）"
                : "不可用"}
            </dd>
            <dt>Agent 派单</dt>
            <dd>
              {data.features.agentExecution
                ? "可用（分析 / worktree 代码，结构化回执）"
                : "不可用"}
            </dd>
            <dt>Git 自动合并</dt>
            <dd className="studio-faint">
              {data.features.gitMerge ? "已启用" : "未启用（有意）"}
            </dd>
          </dl>
          <p className="studio-hint" style={{ marginTop: 10 }}>
            v0.9 只使用 DSH Web Server 路由、client slots、React 和公开 Agent API，
            不依赖私有 Remote 生成器；Agent 在 worktree 写代码，Host 独立验证并执行契约护栏，决策与合并由人拍板。
          </p>
        </section>

        <section className="studio-settings-card">
          <h3>界面</h3>
          <div className="studio-field">
            <label htmlFor="studio-theme">主题</label>
            <select
              id="studio-theme"
              value={theme}
              onChange={(event) =>
                onTheme(event.target.value === "light" ? "light" : "dark")
              }
            >
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </select>
          </div>
          <p className="studio-hint" style={{ marginTop: 10 }}>
            主题保存在当前浏览器；数据与主题互不影响。
          </p>
        </section>
      </div>

      <section className="studio-panel" style={{ marginTop: 14 }}>
        <div className="studio-panel-head">
          <IconAlert width={14} height={14} />
          <h3>安全说明</h3>
        </div>
        <div className="studio-panel-body">
          <p className="studio-hint" style={{ margin: 0, lineHeight: 1.7 }}>
            Studio API 使用每次进程启动随机生成的 Bearer token，token 只注入到
            当前 DSH 页面；接口同源、无 CORS、禁用缓存。数据写到本机
            DSH_HOME/studio/studio.json，不包含模型密钥。不要把 token 贴到聊天或日志里。
          </p>
        </div>
      </section>
    </>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="studio-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="studio-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="studio-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle !== undefined ? (
              <div className="studio-muted">{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="studio-btn"
            data-size="icon"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
            aria-label="关闭"
          >
            <IconX width={15} height={15} />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

function TaskForm({
  roles,
  busy,
  onCancel,
  onSubmit,
}: {
  roles: Role[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateTaskInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("P1");
  const [ownerRoleId, setOwnerRoleId] = useState(roles[0]?.id ?? "");
  const [reviewerRoleId, setReviewerRoleId] = useState(
    roles[1]?.id ?? roles[0]?.id ?? "",
  );
  const [acceptanceText, setAcceptanceText] = useState("");
  const [branch, setBranch] = useState("");
  const [verifyCommand, setVerifyCommand] = useState("npm test");
  const [moduleName, setModuleName] = useState("");
  const [contractRef, setContractRef] = useState("");
  const [kind, setKind] = useState<TaskKind>("new");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");
  const [integration, setIntegration] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const acceptance = acceptanceText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (title.trim() === "") {
      setLocalError("请填写任务标题");
      return;
    }
    if (acceptance.length === 0) {
      setLocalError("至少写一条可验证的验收标准");
      return;
    }
    if (ownerRoleId === reviewerRoleId) {
      setLocalError("负责人和验收人最好是不同角色");
      return;
    }
    if (
      kind === "fix" &&
      (diagnosis.trim() === "" || plan.trim() === "")
    ) {
      setLocalError("改修票必须写诊断和修改计划");
      return;
    }
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      goal: goal.trim(),
      priority,
      ownerRoleId: ownerRoleId || null,
      reviewerRoleId: reviewerRoleId || null,
      acceptance,
      branch: branch.trim() || null,
      verifyCommand: verifyCommand.trim() || null,
      module: moduleName.trim() || null,
      contractRef: contractRef.trim() || null,
      kind,
      diagnosis: diagnosis.trim(),
      plan: plan.trim(),
      integration,
    });
  };

  return (
    <ModalShell
      title="新建任务"
      subtitle="任务一开始就要有验收标准；完成由证据和独立验收决定。"
      onClose={onCancel}
      footer={
        <div className="studio-modal-foot">
          <button className="studio-btn" type="button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            form="studio-task-form"
            disabled={busy}
          >
            {busy ? "创建中…" : "创建任务"}
          </button>
        </div>
      }
    >
      <form id="studio-task-form" className="studio-modal-body" onSubmit={submit}>
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field">
          <label htmlFor="task-title">标题</label>
          <input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：实现技能冷却与施法前摇"
            autoFocus
          />
        </div>
        <div className="studio-field">
          <label htmlFor="task-goal">目标</label>
          <textarea
            id="task-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="这个任务要解决什么问题？交付什么？"
          />
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="task-priority">优先级</label>
            <select
              id="task-priority"
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as TaskPriority)
              }
            >
              <option value="P0">{PRIORITY_LABELS.P0}</option>
              <option value="P1">{PRIORITY_LABELS.P1}</option>
              <option value="P2">{PRIORITY_LABELS.P2}</option>
            </select>
          </div>
          <div className="studio-field">
            <label htmlFor="task-branch">分支（可选）</label>
            <input
              id="task-branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="task/003-ability"
            />
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="task-verify">验证命令（可选）</label>
          <input
            id="task-verify"
            value={verifyCommand}
            onChange={(event) => setVerifyCommand(event.target.value)}
            placeholder="npm test"
          />
          <div className="studio-hint">
            由 Studio Host 在 worktree 内独立执行；通过会写 evidence，但不自动通过验收。
          </div>
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="task-kind">票类型</label>
            <select
              id="task-kind"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as TaskKind)
              }
            >
              <option value="new">{TASK_KIND_LABELS.new}</option>
              <option value="fix">{TASK_KIND_LABELS.fix}</option>
            </select>
          </div>
          <div className="studio-field">
            <label htmlFor="task-module">模块</label>
            <input
              id="task-module"
              value={moduleName}
              onChange={(event) => setModuleName(event.target.value)}
              placeholder="combat / input / replay"
            />
          </div>
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="task-diagnosis">诊断（改修票必填）</label>
            <textarea
              id="task-diagnosis"
              value={diagnosis}
              onChange={(event) => setDiagnosis(event.target.value)}
              rows={3}
              placeholder="现象、复现步骤、初步根因"
            />
          </div>
          <div className="studio-field">
            <label htmlFor="task-plan">修改计划（改修票必填）</label>
            <textarea
              id="task-plan"
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
              rows={3}
              placeholder="要改哪些文件、怎么验证、风险"
            />
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="task-contract">契约引用</label>
          <input
            id="task-contract"
            value={contractRef}
            onChange={(event) => setContractRef(event.target.value)}
            placeholder="docs/contracts/replay-v1.md"
          />
          <div className="studio-hint">
            实现者只应修改这个契约允许的范围；改契约本身要走架构师/Owner。
          </div>
        </div>
        <label className="studio-check">
          <input
            type="checkbox"
            checked={integration}
            onChange={(event) => setIntegration(event.target.checked)}
          />
          集成 / playtest ticket（打包可玩 + 人玩 10 分钟）
        </label>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="task-owner">负责人</label>
            <select
              id="task-owner"
              value={ownerRoleId}
              onChange={(event) => setOwnerRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                  {role.title ? ` · ${role.title}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="studio-field">
            <label htmlFor="task-reviewer">验收人</label>
            <select
              id="task-reviewer"
              value={reviewerRoleId}
              onChange={(event) => setReviewerRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                  {role.title ? ` · ${role.title}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="task-acceptance">验收标准（每行一条）</label>
          <textarea
            id="task-acceptance"
            value={acceptanceText}
            onChange={(event) => setAcceptanceText(event.target.value)}
            placeholder={"冷却按 tick 计算\n前摇可被控制打断\n单测覆盖边界"}
            style={{ minHeight: 96 }}
          />
          <div className="studio-hint">
            Agent 不能自己把任务推到“已完成”；必须由验收人勾完所有标准。
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

function RoleForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateRoleInput) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [mission, setMission] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [model, setModel] = useState("");
  const [executor, setExecutor] = useState<AgentExecutor>("dsh");
  const [tokenBudget, setTokenBudget] = useState("");
  const [dailyTokenBudget, setDailyTokenBudget] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") {
      setLocalError("请填写角色名");
      return;
    }
    const parseBudget = (value: string, field: string): number | null => {
      if (value.trim() === "") return null;
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 0) {
        throw new Error(`${field} 必须是非负整数`);
      }
      return number === 0 ? null : number;
    };
    let budgets: { tokenBudget: number | null; dailyTokenBudget: number | null };
    try {
      budgets = {
        tokenBudget: parseBudget(tokenBudget, "单任务 token 预算"),
        dailyTokenBudget: parseBudget(dailyTokenBudget, "每日 token 预算"),
      };
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
      return;
    }
    setLocalError(null);
    onSubmit({
      name: name.trim(),
      title: title.trim(),
      mission: mission.trim(),
      responsibilities: responsibilities
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      model: model.trim() || null,
      executor,
      tokenBudget: budgets.tokenBudget,
      dailyTokenBudget: budgets.dailyTokenBudget,
    });
  };

  return (
    <ModalShell
      title="新增角色"
      subtitle="角色是职责契约，不是人设。先写清楚使命、职责和边界。"
      onClose={onCancel}
      footer={
        <div className="studio-modal-foot">
          <button className="studio-btn" type="button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            form="studio-role-form"
            disabled={busy}
          >
            {busy ? "创建中…" : "创建角色"}
          </button>
        </div>
      }
    >
      <form id="studio-role-form" className="studio-modal-body" onSubmit={submit}>
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="role-name">角色名</label>
            <input
              id="role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Builder"
              autoFocus
            />
          </div>
          <div className="studio-field">
            <label htmlFor="role-title">职位</label>
            <input
              id="role-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Gameplay 工程师"
            />
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="role-mission">使命</label>
          <textarea
            id="role-mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            placeholder="这个角色为什么存在？"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="role-responsibilities">职责（每行一条）</label>
          <textarea
            id="role-responsibilities"
            value={responsibilities}
            onChange={(event) => setResponsibilities(event.target.value)}
            placeholder={"实现技能/移动/冷却\n补单测\n维护构建"}
          />
        </div>
        <div className="studio-field">
          <label htmlFor="role-executor">执行器</label>
          <select
            id="role-executor"
            value={executor}
            onChange={(event) =>
              setExecutor(event.target.value as AgentExecutor)
            }
          >
            <option value="dsh">{AGENT_EXECUTOR_LABELS.dsh}</option>
            <option value="claude-code">
              {AGENT_EXECUTOR_LABELS["claude-code"]}
            </option>
            <option value="codex">{AGENT_EXECUTOR_LABELS.codex}</option>
          </select>
          <div className="studio-hint">
            DSH 走内置模型路由；Claude Code / Codex 走本机 headless CLI，需要先登录对应工具。
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="role-model">模型（可选）</label>
          <input
            id="role-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="留空继承默认模型，例如 deepseek-flash"
          />
          <div className="studio-hint">
            “薪资”配置：架构师可以用更强/更贵的模型，实现者用更便宜的模型。
          </div>
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="role-budget">单次任务 token 预算</label>
            <input
              id="role-budget"
              inputMode="numeric"
              value={tokenBudget}
              onChange={(event) => setTokenBudget(event.target.value)}
              placeholder="留空 = 继承项目预算"
            />
          </div>
          <div className="studio-field">
            <label htmlFor="role-daily-budget">每日 token 预算</label>
            <input
              id="role-daily-budget"
              inputMode="numeric"
              value={dailyTokenBudget}
              onChange={(event) => setDailyTokenBudget(event.target.value)}
              placeholder="留空 = 不限制"
            />
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

function ProjectForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateProjectInput) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tokenBudget, setTokenBudget] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") {
      setLocalError("请填写项目名");
      return;
    }
    let budget: number | null = null;
    if (tokenBudget.trim() !== "") {
      const number = Number(tokenBudget);
      if (!Number.isSafeInteger(number) || number < 0) {
        setLocalError("token 预算必须是非负整数");
        return;
      }
      budget = number === 0 ? null : number;
    }
    setLocalError(null);
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      tokenBudget: budget,
      repoPath: repoPath.trim() || null,
    });
  };

  return (
    <ModalShell
      title="新建项目"
      subtitle="项目是任务、角色和事实的边界。"
      onClose={onCancel}
      footer={
        <div className="studio-modal-foot">
          <button className="studio-btn" type="button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            form="studio-project-form"
            disabled={busy}
          >
            {busy ? "创建中…" : "创建项目"}
          </button>
        </div>
      }
    >
      <form id="studio-project-form" className="studio-modal-body" onSubmit={submit}>
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field">
          <label htmlFor="project-name">项目名</label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：官网改版 / 工具链升级 / 数据看板"
            autoFocus
          />
        </div>
        <div className="studio-field">
          <label htmlFor="project-description">一句话描述</label>
          <textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="这个项目要验证什么？"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="project-budget">项目 token 预算（可选）</label>
          <input
            id="project-budget"
            inputMode="numeric"
            value={tokenBudget}
            onChange={(event) => setTokenBudget(event.target.value)}
            placeholder="留空 = 不限制；例如 200000"
          />
          <div className="studio-hint">
            这是公司给该项目的 token 上限；实际消耗来自 DSH token meter。
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="project-repo">代码仓库（可选）</label>
          <input
            id="project-repo"
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="例如 D:\projects\my-app"
          />
          <div className="studio-hint">
            绑定 git 仓库后，派单会为每个任务创建独立 worktree 和分支；不绑定则只做分析。
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

function RepoForm({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (repoPath: string) => void;
}) {
  const [repoPath, setRepoPath] = useState(initial);

  return (
    <ModalShell
      title="绑定代码仓库"
      subtitle="必须是本机 git 仓库根目录。绑定后派单会在 .worktrees/<taskId> 创建独立工作区。"
      onClose={onCancel}
      footer={
        <div className="studio-modal-foot">
          <button className="studio-btn" type="button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            form="studio-repo-form"
            disabled={busy}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      }
    >
      <form
        id="studio-repo-form"
        className="studio-modal-body"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(repoPath);
        }}
      >
        <div className="studio-field">
          <label htmlFor="repo-path">仓库根目录</label>
          <input
            id="repo-path"
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="例如 D:\projects\my-app"
            autoFocus
          />
          <div className="studio-hint">
            留空 = 解绑，派单回到只读分析模式。Studio 不会自动 push 或合并。
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

function DecisionForm({
  tasks,
  busy,
  onCancel,
  onSubmit,
}: {
  tasks: Task[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateDecisionInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [taskId, setTaskId] = useState("");
  const [reversible, setReversible] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (title.trim() === "") {
      setLocalError("请填写决策标题");
      return;
    }
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      context: context.trim(),
      recommendation: recommendation.trim(),
      taskId: taskId === "" ? null : taskId,
      reversible,
    });
  };

  return (
    <ModalShell
      title="提出决策"
      subtitle="把需要 Owner 拍板的事项放进决策台；Agent 的项目级建议也会自动出现在这里。"
      onClose={onCancel}
      footer={
        <div className="studio-modal-foot">
          <button
            className="studio-btn"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            form="studio-decision-form"
            disabled={busy}
          >
            {busy ? "提交中…" : "放入决策台"}
          </button>
        </div>
      }
    >
      <form id="studio-decision-form" className="studio-modal-body" onSubmit={submit}>
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field">
          <label htmlFor="decision-title">决策标题</label>
          <input
            id="decision-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：是否把 replay 校验纳入合并门禁？"
            autoFocus
          />
        </div>
        <div className="studio-field">
          <label htmlFor="decision-context">背景与冲突</label>
          <textarea
            id="decision-context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="写清楚双方目标、冲突点、已尝试的方案。"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="decision-recommendation">建议（可选）</label>
          <textarea
            id="decision-recommendation"
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value)}
            placeholder="Architect/Owner 的建议；没有就留空。"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="decision-task">关联任务（可选）</label>
          <select
            id="decision-task"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          >
            <option value="">项目级，不绑定任务</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </div>
        <label className="studio-check">
          <input
            type="checkbox"
            checked={!reversible}
            onChange={(event) => setReversible(!event.target.checked)}
          />
          不可逆决策（批准时必须写明结论和理由）
        </label>
      </form>
    </ModalShell>
  );
}

function LoadingState() {
  return (
    <div className="studio-root" data-theme="dark">
      <div className="studio-loading">
        <span className="studio-spinner" />
        正在加载 Studio…
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="studio-root" data-theme="dark">
      <div className="studio-loading" style={{ flexDirection: "column", padding: 30 }}>
        <div className="studio-alert" style={{ maxWidth: 560 }}>
          {message}
        </div>
        <button
          className="studio-btn"
          data-variant="primary"
          type="button"
          onClick={onRetry}
          style={{ marginTop: 12 }}
        >
          重试
        </button>
      </div>
    </div>
  );
}

function MissingHost({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  const transport = (
    window as Window & {
      __DSH_TRANSPORT__?: { streamBaseUrl?: string };
    }
  ).__DSH_TRANSPORT__;

  return (
    <div className="studio-root" data-theme="dark">
      <div
        className="studio-loading"
        style={{ flexDirection: "column", textAlign: "center", padding: 30 }}
      >
        <div className="studio-alert" data-tone="warn" style={{ maxWidth: 680 }}>
          Studio Host 没有返回启动参数。插件可能刚启用，或当前页面的 DSH
          会话还没有完成认证。
        </div>
        {error !== null ? (
          <div
            className="studio-mono"
            style={{
              marginTop: 10,
              maxWidth: 720,
              color: "var(--st-muted)",
              overflowWrap: "anywhere",
            }}
          >
            {error}
          </div>
        ) : null}
        <div className="studio-faint" style={{ marginTop: 12, maxWidth: 620 }}>
          检查顺序：Plugins → Studio 是否启用；刷新页面；如果仍失败，重启 DSH
          后再试。桌面端和 Web 端都通过同一个 Host 路由获取启动参数。
        </div>
        <button
          className="studio-btn"
          data-variant="primary"
          type="button"
          style={{ marginTop: 14 }}
          onClick={onRetry}
        >
          刷新重试
        </button>
        <details
          className="studio-faint"
          style={{ marginTop: 18, maxWidth: 680, textAlign: "left", fontSize: 10 }}
        >
          <summary style={{ cursor: "pointer" }}>诊断信息</summary>
          <pre
            className="studio-mono"
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 8 }}
          >
            {JSON.stringify(
              {
                error,
                href: window.location.href,
                origin: window.location.origin,
                transportBase: transport?.streamBaseUrl ?? null,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </div>
    </div>
  );
}
