import { useState } from "react";
import type { FormEvent } from "react";

import {
  AGENT_RUN_STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  MERGE_RISK_LABELS,
  PRIORITY_LABELS,
  TASK_KIND_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TRANSITION_LABELS,
} from "../../shared/types.js";
import type {
  AgentReceipt,
  AgentRun,
  CreateMergeProposalInput,
  IndependentReview,
  MergeProposal,
  MergeRisk,
  Role,
  Task,
  TaskStatus,
  Verification,
} from "../../shared/types.js";
import {
  acceptanceDone,
  allAccepted,
  formatDate,
  latestMergeForTask,
  roleName,
  roleTitle,
} from "../lib/format.js";
import { MergePill, PriorityPill, StatusPill } from "./ui.js";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconGitMerge,
  IconPlus,
  IconSpark,
  IconX,
} from "../icons.js";

export function TaskBoard({
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

export function TaskCard({
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

export function TaskDrawer({
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
              <dt>需求</dt>
              <dd className="studio-mono">
                {task.requirementRefs.length === 0
                  ? "未指定"
                  : task.requirementRefs.join(", ")}
              </dd>
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

export function TaskReviewPanel({
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

export function TaskVerificationPanel({
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

export function TaskAgentPanel({
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

export function RunCard({ run }: { run: AgentRun }) {
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

export function ReceiptView({ receipt }: { receipt: AgentReceipt }) {
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

export function ReceiptList({ label, items }: { label: string; items: string[] }) {
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

export function TaskMergePanel({
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

