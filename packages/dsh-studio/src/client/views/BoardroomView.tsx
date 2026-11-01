import { useState } from "react";

import type {
  AgentRun,
  Decision,
  DecideDecisionInput,
  Task,
} from "../../shared/types.js";
import { DECISION_STATUS_LABELS } from "../../shared/types.js";
import {
  IconCheck,
  IconPlus,
  IconSpark,
  IconX,
} from "../icons.js";
import { formatDate } from "../lib/format.js";
import { StatCard } from "../components/ui.js";

export function BoardroomView({
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

