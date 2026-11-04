import { useState } from "react";

import { AGENT_RUN_STATUS_LABELS } from "../../shared/types.js";
import type {
  AgentReceipt,
  AgentRun,
  IndependentReview,
  Task,
  Verification,
} from "../../shared/types.js";
import { formatDate } from "../lib/format.js";
import { IconAlert, IconCheck, IconSpark } from "../icons.js";

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
  if (status === "failed" || status === "timeout") return "p0";
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
        <div className="studio-faint">
          预设 {run.agentPreset ?? "未记录"} · 沙箱{" "}
          {run.sandboxMode ?? "未记录"} · 审批{" "}
          {run.approvalPolicy ?? "未记录"}
          {(run.restrictedTools?.length ?? 0) > 0
            ? ` · 限制 ${String(run.restrictedTools.length)} 个工具`
            : ""}
        </div>
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

