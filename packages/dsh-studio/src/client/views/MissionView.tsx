import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  AGENT_EXECUTOR_LABELS,
  DECISION_STATUS_LABELS,
  MERGE_RISK_LABELS,
  PRIORITY_LABELS,
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_ORDER,
  TRIGGER_SOURCE_LABELS,
  TRIGGER_STATUS_LABELS,
  TASK_STATUS_LABELS,
  nextProjectStage,
} from "../../shared/types.js";
import type {
  AddWorkshopNoteInput,
  BootstrapResponse,
  Branch,
  CreateModuleInput,
  CreatePrototypeDemoInput,
  CreateProviderProfileInput,
  CreateTriggerInput,
  CreateWorkshopInput,
  Module,
  Project,
  ProjectDoc,
  ProjectStage,
  PrototypeDemo,
  Role,
  StageArtifact,
  StageGate,
  Trigger,
  TriggerSource,
  UpdatePrototypeDemoInput,
  UpdateStageGateInput,
  UpdateTriggerRulesInput,
  Workshop,
} from "../../shared/types.js";
import { allAccepted, formatDate, roleName } from "../lib/format.js";
import { StatCard, StatusPill } from "../components/ui.js";
import { TaskBoard } from "../components/TaskPanels.js";
import { ModalShell } from "../components/Forms.js";
import { RecentEvents } from "../components/RecentEvents.js";
import { TriggerInbox } from "../features/TriggerInbox.js";
import { StagePanel } from "../features/StagePanel.js";
import { WorkshopPanel } from "../features/WorkshopPanel.js";
import { PrototypeDemoPanel } from "../features/PrototypeDemoPanel.js";
import { BranchPanel, Roster } from "./TeamView.js";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconGitMerge,
  IconGrid,
  IconKanban,
  IconPlus,
  IconSpark,
  IconUsers,
  IconX,
} from "../icons.js";

export function ModuleForm({
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

export function MissionView({
  data,
  busy,
  onOpenTask,
  onNewProject,
  onGoTeam,
  onLoadStageGate,
  onSaveStageGate,
  onApproveStageGate,
  onRejectStageGate,
  onIngestTrigger,
  onAcceptTrigger,
  onIgnoreTrigger,
  onSaveTriggerRules,
  onCreatePrototypeDemo,
  onUpdatePrototypeDemo,
  onCreateWorkshop,
  onAddWorkshopNote,
  onSynthesizeWorkshop,
  onDecideWorkshop,
  onRunWorkshop,
  onSummarizeWorkshop,
}: {
  data: BootstrapResponse;
  busy: boolean;
  onOpenTask: (id: string) => void;
  onNewProject: () => void;
  onGoTeam: () => void;
  onLoadStageGate: (stage: ProjectStage) => void;
  onSaveStageGate: (
    stage: ProjectStage,
    input: UpdateStageGateInput,
  ) => Promise<boolean>;
  onApproveStageGate: (
    stage: ProjectStage,
    waiverReason: string,
  ) => Promise<boolean>;
  onRejectStageGate: (
    stage: ProjectStage,
    note: string,
  ) => Promise<boolean>;
  onIngestTrigger: (input: CreateTriggerInput) => Promise<boolean>;
  onAcceptTrigger: (trigger: Trigger) => void;
  onIgnoreTrigger: (trigger: Trigger) => void;
  onSaveTriggerRules: (
    projectId: string,
    input: UpdateTriggerRulesInput,
  ) => Promise<boolean>;
  onCreatePrototypeDemo: (
    input: CreatePrototypeDemoInput,
  ) => Promise<boolean>;
  onUpdatePrototypeDemo: (
    demoId: string,
    input: UpdatePrototypeDemoInput,
  ) => Promise<boolean>;
  onCreateWorkshop: (input: CreateWorkshopInput) => Promise<boolean>;
  onAddWorkshopNote: (
    workshopId: string,
    input: AddWorkshopNoteInput,
  ) => Promise<boolean>;
  onSynthesizeWorkshop: (
    workshopId: string,
    synthesis: string,
  ) => Promise<boolean>;
  onDecideWorkshop: (
    workshopId: string,
    decision: string,
  ) => Promise<boolean>;
  onRunWorkshop: (workshopId: string) => Promise<boolean>;
  onSummarizeWorkshop: (workshopId: string) => Promise<boolean>;
}) {
  const project = data.project;
  const nextStage = project === null ? null : nextProjectStage(project.stage);
  const nextGate =
    project === null || nextStage === null
      ? null
      : data.stageGates.find((gate) => gate.stage === nextStage) ?? null;
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

      {project !== null ? (
        <StagePanel
          project={project}
          gate={nextGate}
          busy={busy}
          onLoad={onLoadStageGate}
          onSave={onSaveStageGate}
          onApprove={onApproveStageGate}
          onReject={onRejectStageGate}
        />
      ) : null}

      {project !== null && project.stage === "prototype" ? (
        <PrototypeDemoPanel
          project={project}
          demos={data.prototypeDemos}
          busy={busy}
          onCreate={onCreatePrototypeDemo}
          onUpdate={onUpdatePrototypeDemo}
        />
      ) : null}

      {project !== null ? (
        <TriggerInbox
          project={project}
          triggers={data.triggers}
          busy={busy}
          onIngest={onIngestTrigger}
          onAccept={onAcceptTrigger}
          onIgnore={onIgnoreTrigger}
          onSaveRules={onSaveTriggerRules}
        />
      ) : null}

      {project !== null ? (
        <WorkshopPanel
          project={project}
          roles={data.roles}
          workshops={data.workshops}
          busy={busy}
          onCreate={onCreateWorkshop}
          onAddNote={onAddWorkshopNote}
          onSynthesize={onSynthesizeWorkshop}
          onDecide={onDecideWorkshop}
          onRun={onRunWorkshop}
          onSummarize={onSummarizeWorkshop}
        />
      ) : null}

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

