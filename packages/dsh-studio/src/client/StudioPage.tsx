import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";

import {
  ALLOWED_TRANSITIONS,
  MERGE_RISK_LABELS,
  MERGE_STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TRANSITION_LABELS,
} from "../shared/types.js";
import type {
  BootstrapResponse,
  CreateMergeProposalInput,
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  MergeProposal,
  MergeRisk,
  Role,
  Task,
  TaskPriority,
  TaskStatus,
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

type Tab = "mission" | "tasks" | "merges" | "team" | "settings";
type ModalState =
  | { kind: "task" }
  | { kind: "role" }
  | { kind: "project" }
  | null;

type ToastState = { kind: "ok" | "error"; text: string } | null;

interface NavItem {
  id: Tab;
  label: string;
  caption: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "mission", label: "总览", caption: "Mission Control" },
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
  const [tab, setTab] = useState<Tab>("mission");
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
    async (projectId: string): Promise<void> => {
      if (client === null) return;
      setBusy(true);
      try {
        await client.selectProject(projectId);
        await load(projectId, true);
      } catch (cause) {
        setToast({ kind: "error", text: errorText(cause) });
      } finally {
        setBusy(false);
      }
    },
    [client, load],
  );

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

  return (
    <div className="studio-root" data-theme={theme}>
      <header className="studio-header">
        <div className="studio-brand">
          <div className="studio-mark">S</div>
          <div>
            <div className="studio-brand-name">STUDIO</div>
            <div className="studio-brand-sub">AI Workbench</div>
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
              {item.id === "mission" && reviewCount > 0 ? (
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
            <strong>{project?.name ?? "未选择项目"}</strong>
            {data.stats.total} 个任务 · {data.roles.length} 个角色
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
              />
            ) : null}

            {tab === "settings" ? (
              <SettingsView
                boot={boot}
                data={data}
                theme={theme}
                onTheme={setTheme}
                onNewProject={() => setModal({ kind: "project" })}
                onReload={() => void load(undefined, false)}
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
          busy={busy}
          onClose={() => setSelectedTaskId(null)}
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
}: {
  data: BootstrapResponse;
  onNewRole: () => void;
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
  busy,
  onClose,
  onTransition,
  onToggleAcceptance,
  onAddEvidence,
  onCreateMerge,
  onApproveMerge,
  onRejectMerge,
  onCompleteMerge,
}: {
  task: Task;
  roles: Role[];
  mergeProposal: MergeProposal | null;
  busy: boolean;
  onClose: () => void;
  onTransition: (status: TaskStatus) => void;
  onToggleAcceptance: (id: string) => void;
  onAddEvidence: (text: string) => Promise<boolean>;
  onCreateMerge: (input: CreateMergeProposalInput) => Promise<boolean>;
  onApproveMerge: (note?: string) => void;
  onRejectMerge: (note: string) => void;
  onCompleteMerge: (mergeCommit?: string) => void;
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
          </section>

          <TaskMergePanel
            task={task}
            proposal={mergeProposal}
            busy={busy}
            onCreate={onCreateMerge}
            onApprove={onApproveMerge}
            onReject={onRejectMerge}
            onComplete={onCompleteMerge}
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
              v0.2 已接入合并治理：提案、评审、批准、合并记录都会持久化；Git 命令仍由人执行。
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function TaskMergePanel({
  task,
  proposal,
  busy,
  onCreate,
  onApprove,
  onReject,
  onComplete,
}: {
  task: Task;
  proposal: MergeProposal | null;
  busy: boolean;
  onCreate: (input: CreateMergeProposalInput) => Promise<boolean>;
  onApprove: (note?: string) => void;
  onReject: (note: string) => void;
  onComplete: (mergeCommit?: string) => void;
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
                onClick={() => onComplete(mergeCommit.trim() || undefined)}
              >
                <IconCheck width={13} height={13} />
                标记已合并
              </button>
            </div>
          ) : (
            <div className="studio-action-note">
              合并已完成；如需继续变更，请创建后续任务。
            </div>
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
  onReload,
}: {
  boot: NonNullable<ReturnType<typeof readStudioBoot>>;
  data: BootstrapResponse;
  theme: "dark" | "light";
  onTheme: (theme: "dark" | "light") => void;
  onNewProject: () => void;
  onReload: () => void;
}) {
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
          <h3>能力边界</h3>
          <dl className="studio-kv">
            <dt>独立页面</dt>
            <dd>{data.features.independentPage ? "可用" : "不可用"}</dd>
            <dt>文件持久化</dt>
            <dd>{data.features.filePersistence ? "可用" : "不可用"}</dd>
            <dt>合并治理</dt>
            <dd>
              {data.features.mergeGovernance
                ? "可用（记录评审，人工执行 Git）"
                : "不可用"}
            </dd>
            <dt>Agent 执行</dt>
            <dd className="studio-faint">下一阶段</dd>
            <dt>Git 自动合并</dt>
            <dd className="studio-faint">
              {data.features.gitMerge ? "已启用" : "未启用（有意）"}
            </dd>
          </dl>
          <p className="studio-hint" style={{ marginTop: 10 }}>
            v0.2 只使用 DSH Web Server 路由、client slots 和 React，不依赖私有
            Remote 生成器；合并命令由人执行，Studio 不做不可逆的 Git 操作。
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
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      goal: goal.trim(),
      priority,
      ownerRoleId: ownerRoleId || null,
      reviewerRoleId: reviewerRoleId || null,
      acceptance,
      branch: branch.trim() || null,
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
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") {
      setLocalError("请填写角色名");
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
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") {
      setLocalError("请填写项目名");
      return;
    }
    setLocalError(null);
    onSubmit({ name: name.trim(), description: description.trim() });
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
            placeholder="例如：MOBA 垂直切片"
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
