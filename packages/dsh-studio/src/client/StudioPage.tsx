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
  PRIORITY_LABELS,
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_ORDER,
  ROLE_LOAD_LABELS,
  TRIGGER_SOURCE_LABELS,
  TRIGGER_STATUS_LABELS,
  TASK_KIND_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TRANSITION_LABELS,
  nextProjectStage,
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
  ProjectStage,
  StageArtifact,
  StageGate,
  Trigger,
  TriggerSource,
  UpdateTriggerRulesInput,
  CreateTriggerInput,
  AddWorkshopNoteInput,
  CreateWorkshopInput,
  CreateProviderProfileInput,
  UpdateProviderProfileInput,
  ProviderProfile,
  ProviderProfileHealth,
  ProviderProbeResult,
  CreatePrototypeDemoInput,
  PrototypeDemo,
  UpdatePrototypeDemoInput,
  Workshop,
  UpdateStageGateInput,
  CreateMergeProposalInput,
  CreateProjectFromTemplateInput,
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
import { createStudioActions } from "./studio-actions.js";
import type { ModalState, ToastState } from "./studio-actions.js";
import {
  acceptanceDone,
  allAccepted,
  errorText,
  formatDate,
  initials,
  latestMergeForTask,
  roleName,
  roleTitle,
} from "./lib/format.js";
import {
  MergePill,
  NavIcon,
  PriorityPill,
  StatCard,
  StatusPill,
} from "./components/ui.js";
import type { Tab } from "./components/ui.js";
import { CompanyView } from "./views/CompanyView.js";
import { MeetingView } from "./features/MeetingView.js";
import { BoardroomView } from "./views/BoardroomView.js";
import { KnowledgeView } from "./views/KnowledgeView.js";
import { BranchPanel, Roster, TeamView } from "./views/TeamView.js";
import { MissionView, ModuleForm } from "./views/MissionView.js";
import { TasksView } from "./views/TasksView.js";
import { MergeView } from "./views/MergeView.js";
import { SettingsView } from "./views/SettingsView.js";
import {
  ErrorState,
  LoadingState,
  MissingHost,
} from "./components/States.js";
import { TaskDrawer } from "./components/TaskDrawer.js";
import { ModalShell } from "./components/ModalShell.js";
import { DecisionForm } from "./forms/DecisionForm.js";
import { ProjectForm, RepoForm } from "./forms/ProjectForms.js";
import { RoleForm } from "./forms/RoleForm.js";
import { TaskForm } from "./forms/TaskForm.js";
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


interface NavItem {
  id: Tab;
  label: string;
  caption: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "company", label: "工作室", caption: "Studio Dashboard" },
  { id: "knowledge", label: "知识库", caption: "PRD / Modules" },
  { id: "meeting", label: "会议室", caption: "Meeting Room" },
  { id: "boardroom", label: "决策台", caption: "Decision Desk" },
  { id: "mission", label: "项目", caption: "Mission Control" },
  { id: "tasks", label: "任务", caption: "Task Board" },
  { id: "merges", label: "合并", caption: "Merge Queue" },
  { id: "team", label: "团队", caption: "Roles" },
  { id: "settings", label: "设置", caption: "Runtime" },
];

const STUDIO_TAB_KEY = "studio.ui.tab";
const STUDIO_TASK_KEY = "studio.ui.task";
const TAB_IDS = new Set<Tab>(NAV_ITEMS.map((item) => item.id));

function readStoredTab(): Tab {
  try {
    const value = localStorage.getItem(STUDIO_TAB_KEY);
    return value !== null && TAB_IDS.has(value as Tab)
      ? (value as Tab)
      : "company";
  } catch {
    return "company";
  }
}

function readStoredTaskId(): string | null {
  try {
    const value = localStorage.getItem(STUDIO_TASK_KEY);
    return value !== null && value !== "" ? value : null;
  } catch {
    return null;
  }
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
  const [tab, setTab] = useState<Tab>(readStoredTab);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    readStoredTaskId,
  );
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
    try {
      localStorage.setItem(STUDIO_TAB_KEY, tab);
    } catch {
      // Navigation persistence is best-effort.
    }
  }, [tab]);

  useEffect(() => {
    try {
      if (selectedTaskId === null) {
        localStorage.removeItem(STUDIO_TASK_KEY);
      } else {
        localStorage.setItem(STUDIO_TASK_KEY, selectedTaskId);
      }
    } catch {
      // Task selection persistence is best-effort.
    }
  }, [selectedTaskId]);

  useEffect(() => {
    if (data === null || selectedTaskId === null) return;
    if (!data.tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [data, selectedTaskId]);

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

  const actions = createStudioActions({
    client,
    data,
    load,
    run,
    setModal,
    setToast,
    setError,
  });
  const {
    createFreeze,
    createFreezeChangeRequest,
    decideFreezeChangeRequest,
    createRequirementDecision,
    createTask,
    createRole,
    updateRoleExecutor,
    updateRoleProvider,
    createProviderProfile,
    updateProviderProfile,
    deleteProviderProfile,
    probeProviderProfile,
    reassignProviderProfile,
    createProject,
    createProjectFromTemplate,
    updateProjectRepo,
    updateProjectDocs,
    loadStageGate,
    saveStageGate,
    approveStageGate,
    rejectStageGate,
    ingestTrigger,
    acceptTrigger,
    ignoreTrigger,
    updateTriggerRules,
    createPrototypeDemo,
    updatePrototypeDemo,
    createWorkshop,
    addWorkshopNote,
    synthesizeWorkshop,
    decideWorkshop,
    runWorkshop,
    summarizeWorkshopAi,
    speakWorkshop,
    sideSpeakWorkshop,
    updateWorkshopMessage,
    updateWorkshopAgenda,
    settleWorkshop,
    saveWorkshopMinutes,
    summarizeWorkshopMinutes,
    createWorkshopDecision,
    readProjectDoc,
    createModule,
    transitionTask,
    acceptAllTrivial,
    toggleAcceptance,
    toggleDocsSynced,
    addEvidence,
    dispatchTask,
    verifyTask,
    reviewTask,
    createDecision,
    decideDecision,
    createMerge,
    approveMerge,
    rejectMerge,
    completeMerge,
    executeMerge,
    rollbackMerge,
    exportData,
    importData,
    exportBundle,
    importBundle,
    saveCompany,
    writeAdr,
  } = actions;

  return (
    <div className="studio-root" data-theme={theme}>
      <header className="studio-header">
        <div className="studio-brand">
          <div className="studio-mark">S</div>
          <div className="studio-brand-name">AI Studio</div>
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
        </div>
      </header>

      <div className="studio-body">
        <nav className="studio-nav" aria-label="Studio 导航">
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
                ? data.company.name
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

            {tab === "meeting" ? (
              <MeetingView
                project={data.project}
                roles={data.roles}
                freezes={data.freezes}
                workshops={data.workshops}
                busy={busy}
                onCreate={createWorkshop}
                onSpeak={speakWorkshop}
                onSideSpeak={sideSpeakWorkshop}
                onUpdateAgenda={updateWorkshopAgenda}
                onUpdateMessage={updateWorkshopMessage}
                onSettle={settleWorkshop}
                onSaveMinutes={saveWorkshopMinutes}
                onSummarize={summarizeWorkshopMinutes}
                onCreateDecision={createWorkshopDecision}
                onOpenBoardroom={() => setTab("boardroom")}
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
                freezes={data.freezes}
                changeRequests={data.freezeChangeRequests}
                decisions={data.requirementDecisions}
                onCreateFreeze={createFreeze}
                onCreateFreezeChangeRequest={createFreezeChangeRequest}
                onDecideFreezeChangeRequest={decideFreezeChangeRequest}
                onCreateRequirementDecision={createRequirementDecision}
              />
            ) : null}

            {tab === "mission" ? (
              <MissionView
                data={data}
                busy={busy}
                onOpenTask={setSelectedTaskId}
                onNewProject={() => setModal({ kind: "project" })}
                onGoTeam={() => setTab("team")}
                onLoadStageGate={(stage) => void loadStageGate(stage)}
                onSaveStageGate={saveStageGate}
                onApproveStageGate={approveStageGate}
                onRejectStageGate={rejectStageGate}
                onCreateFreeze={createFreeze}
                onFreezeChangeRequest={createFreezeChangeRequest}
                onDecideFreezeChangeRequest={decideFreezeChangeRequest}
                onCreateRequirementDecision={createRequirementDecision}
                onIngestTrigger={ingestTrigger}
                onAcceptTrigger={(trigger) => void acceptTrigger(trigger)}
                onIgnoreTrigger={(trigger) => void ignoreTrigger(trigger)}
                onSaveTriggerRules={updateTriggerRules}
                onCreatePrototypeDemo={createPrototypeDemo}
                onUpdatePrototypeDemo={updatePrototypeDemo}
                onCreateWorkshop={createWorkshop}
                onAddWorkshopNote={addWorkshopNote}
                onSynthesizeWorkshop={synthesizeWorkshop}
                onDecideWorkshop={decideWorkshop}
                onRunWorkshop={runWorkshop}
                onSummarizeWorkshop={summarizeWorkshopAi}
              />
            ) : null}

            {tab === "tasks" ? (
              <TasksView
                data={data}
                onOpenTask={setSelectedTaskId}
                onNewTask={() => setModal({ kind: "task" })}
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
                busy={busy}
                onNewRole={() => setModal({ kind: "role" })}
                onExecutor={updateRoleExecutor}
                onProvider={updateRoleProvider}
                onCreateProvider={createProviderProfile}
                onUpdateProvider={updateProviderProfile}
                onDeleteProvider={deleteProviderProfile}
                onReassignProvider={reassignProviderProfile}
                onProbeProvider={probeProviderProfile}
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
                onImportBundle={importBundle}
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
          onAcceptAllTrivial={() => acceptAllTrivial(selectedTask)}
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
          profiles={data.providerProfiles}
          onCancel={() => setModal(null)}
          onSubmit={(input) => void createRole(input)}
        />
      ) : null}

      {modal?.kind === "project" ? (
        <ProjectForm
          busy={busy}
          onCancel={() => setModal(null)}
          onSubmit={(input) => void createProject(input)}
          onSubmitTemplate={(input) => void createProjectFromTemplate(input)}
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

