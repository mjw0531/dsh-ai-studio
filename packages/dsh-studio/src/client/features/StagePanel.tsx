import { useEffect, useState } from "react";

import {
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_ORDER,
  nextProjectStage,
} from "../../shared/types.js";
import type {
  Project,
  ProjectStage,
  Role,
  StageArtifact,
  StageGate,
  UpdateStageGateInput,
} from "../../shared/types.js";
import { formatDate } from "../lib/format.js";
import { StatCard, StatusPill } from "../components/ui.js";
import {
  IconAlert,
  IconCheck,
  IconGrid,
  IconPlus,
  IconX,
} from "../icons.js";

export function StagePanel({
  project,
  gate,
  busy,
  onLoad,
  onSave,
  onApprove,
  onReject,
}: {
  project: Project;
  gate: StageGate | null;
  busy: boolean;
  onLoad: (stage: ProjectStage) => void;
  onSave: (stage: ProjectStage, input: UpdateStageGateInput) => Promise<boolean>;
  onApprove: (stage: ProjectStage, waiverReason: string) => Promise<boolean>;
  onReject: (stage: ProjectStage, note: string) => Promise<boolean>;
}) {
  const nextStage = nextProjectStage(project.stage);
  const [draft, setDraft] = useState<StageGate | null>(gate);
  const [artifactKind, setArtifactKind] = useState<StageArtifact["kind"]>("prd");
  const [artifactLabel, setArtifactLabel] = useState("");
  const [artifactPath, setArtifactPath] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    setDraft(gate);
  }, [gate?.id, gate?.updatedAt]);

  const currentIndex = PROJECT_STAGE_ORDER.indexOf(project.stage);

  return (
    <section className="studio-panel studio-stage-panel">
      <div className="studio-panel-head">
        <IconGrid width={14} height={14} />
        <h3>阶段门禁 / Stage Gate</h3>
        <span className="studio-muted">
          当前：{PROJECT_STAGE_LABELS[project.stage]}
        </span>
      </div>
      <div className="studio-panel-body">
        <div className="studio-stage-track">
          {PROJECT_STAGE_ORDER.map((stage, index) => (
            <div
              key={stage}
              className="studio-stage-step"
              data-state={
                index < currentIndex
                  ? "done"
                  : index === currentIndex
                    ? "current"
                    : "todo"
              }
            >
              <span className="studio-stage-index">{index + 1}</span>
              <span>
                <strong>{PROJECT_STAGE_LABELS[stage]}</strong>
                <small>{stage}</small>
              </span>
            </div>
          ))}
        </div>

        {nextStage === null ? (
          <div className="studio-stage-complete">
            <IconCheck width={16} height={16} />
            已进入持续开发；新的架构决策仍应走 Decision / ADR。
          </div>
        ) : draft === null ? (
          <div className="studio-stage-empty">
            <p>
              下一阶段是 <strong>{PROJECT_STAGE_LABELS[nextStage]}</strong>。
              先建立门禁清单，确认需求或架构产物后再进入。
            </p>
            <button
              className="studio-btn"
              data-variant="primary"
              type="button"
              disabled={busy}
              onClick={() => onLoad(nextStage)}
            >
              <IconPlus width={14} height={14} />
              准备阶段门禁
            </button>
          </div>
        ) : (
          <div className="studio-stage-gate">
            <div className="studio-stage-gate-head">
              <div>
                <strong>进入：{PROJECT_STAGE_LABELS[draft.stage]}</strong>
                <div className="studio-muted">
                  Owner 确认后才会推进项目阶段。
                </div>
              </div>
              <span
                className="studio-pill"
                data-tone={
                  draft.status === "approved"
                    ? "ok"
                    : draft.status === "rejected"
                      ? "p0"
                      : "accent"
                }
              >
                {draft.status === "pending"
                  ? "待确认"
                  : draft.status === "approved"
                    ? "已批准"
                    : "已拒绝"}
              </span>
            </div>

            <div className="studio-stage-checklist">
              {draft.checklist.map((item) => (
                <label key={item.id} className="studio-stage-check">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={busy}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        checklist: draft.checklist.map((current) =>
                          current.id === item.id
                            ? { ...current, done: !current.done }
                            : current,
                        ),
                      })
                    }
                  />
                  <span>{item.text}</span>
                </label>
              ))}
            </div>

            <div className="studio-stage-artifacts">
              <div className="studio-stage-subhead">产物 / Artifacts</div>
              {gate?.stage === "development" &&
              !draft.artifacts.some((artifact) => artifact.kind === "demo") ? (
                <div className="studio-hint">
                  进入持续开发前必须登记一个 <code>demo</code> 产物：Demo 路径、URL 或 playtest 记录。
                </div>
              ) : null}
              {draft.artifacts.length === 0 ? (
                <div className="studio-hint">
                  至少登记一个产物；也可以填写 Owner 豁免理由。
                </div>
              ) : (
                draft.artifacts.map((artifact) => (
                  <div key={artifact.id} className="studio-stage-artifact">
                    <span className="studio-pill">{artifact.kind}</span>
                    <span>{artifact.label}</span>
                    <code>{artifact.path}</code>
                    <button
                      className="studio-icon-btn"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          artifacts: draft.artifacts.filter(
                            (current) => current.id !== artifact.id,
                          ),
                        })
                      }
                    >
                      <IconX width={12} height={12} />
                    </button>
                  </div>
                ))
              )}
              <div className="studio-stage-artifact-form">
                <select
                  value={artifactKind}
                  disabled={busy}
                  onChange={(event) =>
                    setArtifactKind(
                      event.target.value as StageArtifact["kind"],
                    )
                  }
                >
                  <option value="prd">PRD</option>
                  <option value="architecture">Architecture</option>
                  <option value="demo">Demo</option>
                  <option value="adr">ADR</option>
                  <option value="other">Other</option>
                </select>
                <input
                  value={artifactLabel}
                  placeholder="产物名称"
                  disabled={busy}
                  onChange={(event) => setArtifactLabel(event.target.value)}
                />
                <input
                  value={artifactPath}
                  placeholder="docs/PRD.md"
                  disabled={busy}
                  onChange={(event) => setArtifactPath(event.target.value)}
                />
                <button
                  className="studio-btn"
                  data-size="sm"
                  type="button"
                  disabled={
                    busy ||
                    artifactLabel.trim() === "" ||
                    artifactPath.trim() === ""
                  }
                  onClick={() => {
                    setDraft({
                      ...draft,
                      artifacts: [
                        ...draft.artifacts,
                        {
                          id: `artifact-${String(Date.now())}`,
                          kind: artifactKind,
                          label: artifactLabel.trim(),
                          path: artifactPath.trim(),
                        },
                      ],
                    });
                    setArtifactLabel("");
                    setArtifactPath("");
                  }}
                >
                  添加
                </button>
              </div>
            </div>

            <div className="studio-field">
              <label htmlFor="stage-gate-note">门禁说明</label>
              <textarea
                id="stage-gate-note"
                value={draft.note}
                disabled={busy}
                placeholder="本轮确认了什么、还留下什么风险。"
                onChange={(event) =>
                  setDraft({ ...draft, note: event.target.value })
                }
              />
            </div>

            {draft.status === "approved" ? (
              <div className="studio-stage-approved">
                已由 {draft.approvedBy} 批准
                {draft.waiverReason === null
                  ? ""
                  : `；豁免理由：${draft.waiverReason}`}
              </div>
            ) : (
              <>
                <div className="studio-field-row">
                  <div className="studio-field">
                    <label htmlFor="stage-waiver">
                      Owner 豁免理由（可不填）
                    </label>
                    <input
                      id="stage-waiver"
                      value={waiverReason}
                      disabled={busy}
                      placeholder="例如：单人原型，PRD 已在仓库"
                      onChange={(event) => setWaiverReason(event.target.value)}
                    />
                  </div>
                  <div className="studio-field">
                    <label htmlFor="stage-reject-note">拒绝理由</label>
                    <input
                      id="stage-reject-note"
                      value={rejectNote}
                      disabled={busy}
                      placeholder="拒绝必须写理由"
                      onChange={(event) => setRejectNote(event.target.value)}
                    />
                  </div>
                </div>
                <div className="studio-stage-actions">
                  <button
                    className="studio-btn"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void onSave(draft.stage, {
                        checklist: draft.checklist,
                        artifacts: draft.artifacts,
                        note: draft.note,
                      })
                    }
                  >
                    保存草稿
                  </button>
                  <button
                    className="studio-btn"
                    data-variant="primary"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void onApprove(draft.stage, waiverReason)
                    }
                  >
                    批准进入
                  </button>
                  <button
                    className="studio-btn"
                    data-variant="danger"
                    type="button"
                    disabled={busy || rejectNote.trim() === ""}
                    onClick={() => void onReject(draft.stage, rejectNote)}
                  >
                    拒绝
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

