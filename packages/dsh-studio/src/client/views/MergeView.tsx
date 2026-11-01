import { useState } from "react";

import { MERGE_RISK_LABELS } from "../../shared/types.js";
import type {
  AgentRun,
  BootstrapResponse,
  MergeProposal,
  MergeRisk,
  Role,
  Task,
} from "../../shared/types.js";
import { formatDate } from "../lib/format.js";
import { MergePill } from "../components/ui.js";
import { IconCheck, IconGitMerge } from "../icons.js";

export function MergeView({
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

