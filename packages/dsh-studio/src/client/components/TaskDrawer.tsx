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
import { TaskMergePanel } from "./TaskMergePanel.js";
import {
  TaskAgentPanel,
  TaskReviewPanel,
  TaskVerificationPanel,
} from "./TaskRunPanels.js";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconGitMerge,
  IconPlus,
  IconSpark,
  IconX,
} from "../icons.js";

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

