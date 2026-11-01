import { useState } from "react";
import type { FormEvent } from "react";

import {
  MERGE_RISK_LABELS,
  TASK_STATUS_LABELS,
  TRANSITION_LABELS,
} from "../../shared/types.js";
import type {
  AgentRun,
  CreateMergeProposalInput,
  MergeProposal,
  MergeRisk,
  Role,
  Task,
  Verification,
} from "../../shared/types.js";
import {
  acceptanceDone,
  allAccepted,
  formatDate,
  latestMergeForTask,
  roleName,
} from "../lib/format.js";
import { MergePill, PriorityPill, StatusPill } from "./ui.js";
import { IconAlert, IconCheck, IconGitMerge } from "../icons.js";

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

