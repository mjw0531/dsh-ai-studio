import { useEffect, useState } from "react";

import {
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_ORDER,
} from "../../shared/types.js";
import type {
  AddWorkshopNoteInput,
  CreateWorkshopInput,
  Project,
  ProjectStage,
  Role,
  Workshop,
} from "../../shared/types.js";
import { formatDate } from "../lib/format.js";
import { IconSpark, IconUsers } from "../icons.js";

export function WorkshopPanel({
  project,
  roles,
  workshops,
  busy,
  onCreate,
  onAddNote,
  onSynthesize,
  onDecide,
  onRun,
  onSummarize,
}: {
  project: Project;
  roles: Role[];
  workshops: Workshop[];
  busy: boolean;
  onCreate: (input: CreateWorkshopInput) => Promise<boolean>;
  onAddNote: (
    workshopId: string,
    input: AddWorkshopNoteInput,
  ) => Promise<boolean>;
  onSynthesize: (workshopId: string, synthesis: string) => Promise<boolean>;
  onDecide: (workshopId: string, decision: string) => Promise<boolean>;
  onRun: (workshopId: string) => Promise<boolean>;
  onSummarize: (workshopId: string) => Promise<boolean>;
}) {
  const active =
    workshops.find(
      (workshop) =>
        workshop.status === "collecting" ||
        workshop.status === "synthesized",
    ) ?? null;
  const latest = workshops[0] ?? null;
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [stage, setStage] = useState<ProjectStage>(project.stage);
  const [participants, setParticipants] = useState<string[]>(
    roles.map((role) => role.id),
  );
  const [roleId, setRoleId] = useState(active?.participantRoleIds[0] ?? "");
  const [summary, setSummary] = useState("");
  const [objections, setObjections] = useState("");
  const [risks, setRisks] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [synthesis, setSynthesis] = useState(active?.synthesis ?? "");
  const [decision, setDecision] = useState(active?.decision ?? "");

  useEffect(() => {
    setRoleId(active?.participantRoleIds[0] ?? "");
    setSynthesis(active?.synthesis ?? "");
    setDecision(active?.decision ?? "");
  }, [active?.id, active?.updatedAt]);

  const toggleParticipant = (id: string): void => {
    setParticipants((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  return (
    <section className="studio-panel studio-workshop-panel">
      <div className="studio-panel-head">
        <IconUsers width={14} height={14} />
        <h3>研讨会 / Workshop</h3>
        <span className="studio-muted">
          {active === null ? "没有进行中的研讨会" : `${String(active.notes.length)} 条意见`}
        </span>
      </div>
      <div className="studio-panel-body">
        {active === null ? (
          <>
            {latest !== null && latest.status === "decided" ? (
              <div className="studio-workshop-decision">
                上一场「{latest.title}」的结论：{latest.decision}
              </div>
            ) : null}
            {roles.length === 0 ? (
              <div className="studio-empty">
                <strong>先建角色</strong>
                研讨会需要参与角色；去团队页创建 Lead / Architect / Verifier。
              </div>
            ) : (
              <form
                className="studio-workshop-create"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (title.trim() === "" || participants.length === 0) return;
                  void onCreate({
                    title: title.trim(),
                    topic: topic.trim(),
                    stage,
                    participantRoleIds: participants,
                  }).then((ok) => {
                    if (ok) {
                      setTitle("");
                      setTopic("");
                    }
                  });
                }}
              >
                <div className="studio-field-row">
                  <div className="studio-field">
                    <label htmlFor="workshop-title">标题</label>
                    <input
                      id="workshop-title"
                      value={title}
                      disabled={busy}
                      placeholder="例如：登录方案评审"
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="studio-field">
                    <label htmlFor="workshop-stage">阶段</label>
                    <select
                      id="workshop-stage"
                      value={stage}
                      disabled={busy}
                      onChange={(event) =>
                        setStage(event.target.value as ProjectStage)
                      }
                    >
                      {PROJECT_STAGE_ORDER.map((item) => (
                        <option key={item} value={item}>
                          {PROJECT_STAGE_LABELS[item]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="studio-field">
                  <label htmlFor="workshop-topic">议题</label>
                  <textarea
                    id="workshop-topic"
                    value={topic}
                    disabled={busy}
                    placeholder="要讨论的决定、约束和已知风险。"
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </div>
                <div className="studio-workshop-participants">
                  {roles.map((role) => (
                    <label key={role.id} className="studio-stage-check">
                      <input
                        type="checkbox"
                        checked={participants.includes(role.id)}
                        disabled={busy}
                        onChange={() => toggleParticipant(role.id)}
                      />
                      <span>{role.name}</span>
                    </label>
                  ))}
                </div>
                <button
                  className="studio-btn"
                  data-variant="primary"
                  type="submit"
                  disabled={busy || title.trim() === "" || participants.length === 0}
                >
                  创建研讨会
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="studio-workshop-room">
            <div className="studio-stage-gate-head">
              <div>
                <strong>{active.title}</strong>
                <div className="studio-muted">
                  {PROJECT_STAGE_LABELS[active.stage]} · {active.topic || "未填写议题"}
                </div>
              </div>
              <span className="studio-pill" data-tone="accent">
                {active.status === "collecting" ? "收集意见" : "已汇总"}
              </span>
            </div>

            {active.status === "collecting" ? (
              <div className="studio-actions">
                <button
                  className="studio-btn"
                  type="button"
                  disabled={busy || active.participantRoleIds.length === 0}
                  onClick={() => void onRun(active.id)}
                  title="每个参与角色独立调用 DSH Agent；不会修改文件或自动合并"
                >
                  AI 独立评审
                </button>
                <button
                  className="studio-btn"
                  type="button"
                  disabled={busy || active.notes.length === 0}
                  onClick={() => void onSummarize(active.id)}
                  title="生成汇总草稿；不会覆盖原始意见，也不会写 Owner 决策"
                >
                  AI 汇总草稿
                </button>
              </div>
            ) : null}

            {active.aiSummary ? (
              <div className="studio-workshop-summary">
                <div className="studio-role-section-label">
                  AI 汇总草稿（未采纳）
                </div>
                <div>共识：{active.aiSummary.consensus.join("；") || "无"}</div>
                <div>
                  分歧：{active.aiSummary.disagreements.join("；") || "无"}
                </div>
                <div>
                  未决：{active.aiSummary.openQuestions.join("；") || "无"}
                </div>
                <div>
                  候选：{active.aiSummary.candidates.join("；") || "无"}
                </div>
              </div>
            ) : null}

            <div className="studio-workshop-notes">
              {active.notes.length === 0 ? (
                <div className="studio-hint">
                  每位参与者独立提交意见；可以粘贴各 AI 的输出。不要在同一个上下文里轮转。
                </div>
              ) : (
                active.notes.map((note) => (
                  <div key={note.id} className="studio-workshop-note">
                    <strong>{note.roleName}</strong>
                    <p>{note.summary}</p>
                    {note.objections.length > 0 ? (
                      <div className="studio-workshop-list">
                        反对：{note.objections.join("；")}
                      </div>
                    ) : null}
                    {note.risks.length > 0 ? (
                      <div className="studio-workshop-list">
                        风险：{note.risks.join("；")}
                      </div>
                    ) : null}
                    {note.recommendation ? (
                      <div className="studio-workshop-list">
                        建议：{note.recommendation}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {active.status === "collecting" ? (
              <form
                className="studio-workshop-note-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (summary.trim() === "" || roleId === "") return;
                  void onAddNote(active.id, {
                    roleId,
                    summary: summary.trim(),
                    objections: objections
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                    risks: risks
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                    recommendation: recommendation.trim(),
                  }).then((ok) => {
                    if (ok) {
                      setSummary("");
                      setObjections("");
                      setRisks("");
                      setRecommendation("");
                    }
                  });
                }}
              >
                <div className="studio-field">
                  <label htmlFor="workshop-note-role">参与者</label>
                  <select
                    id="workshop-note-role"
                    value={roleId}
                    disabled={busy}
                    onChange={(event) => setRoleId(event.target.value)}
                  >
                    {active.participantRoleIds.map((id) => {
                      const role = roles.find((item) => item.id === id);
                      return (
                        <option key={id} value={id}>
                          {role?.name ?? id}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="studio-field">
                  <label htmlFor="workshop-note-summary">独立意见</label>
                  <textarea
                    id="workshop-note-summary"
                    value={summary}
                    disabled={busy}
                    placeholder="结论、理由、假设。"
                    onChange={(event) => setSummary(event.target.value)}
                  />
                </div>
                <div className="studio-field-row">
                  <div className="studio-field">
                    <label htmlFor="workshop-note-objections">反对意见（每行一条）</label>
                    <textarea
                      id="workshop-note-objections"
                      value={objections}
                      disabled={busy}
                      onChange={(event) => setObjections(event.target.value)}
                    />
                  </div>
                  <div className="studio-field">
                    <label htmlFor="workshop-note-risks">风险（每行一条）</label>
                    <textarea
                      id="workshop-note-risks"
                      value={risks}
                      disabled={busy}
                      onChange={(event) => setRisks(event.target.value)}
                    />
                  </div>
                </div>
                <div className="studio-field">
                  <label htmlFor="workshop-note-recommendation">建议</label>
                  <input
                    id="workshop-note-recommendation"
                    value={recommendation}
                    disabled={busy}
                    onChange={(event) => setRecommendation(event.target.value)}
                  />
                </div>
                <button className="studio-btn" type="submit" disabled={busy || summary.trim() === ""}>
                  记录意见
                </button>
              </form>
            ) : null}

            <div className="studio-field">
              <label htmlFor="workshop-synthesis">汇总 / Synthesis</label>
              <textarea
                id="workshop-synthesis"
                value={synthesis}
                disabled={busy || active.status === "decided"}
                onChange={(event) => setSynthesis(event.target.value)}
              />
            </div>
            {active.status === "collecting" ? (
              <button
                className="studio-btn"
                type="button"
                disabled={busy || synthesis.trim() === ""}
                onClick={() => void onSynthesize(active.id, synthesis)}
              >
                保存汇总
              </button>
            ) : null}

            <div className="studio-field">
              <label htmlFor="workshop-decision">Owner 决策</label>
              <textarea
                id="workshop-decision"
                value={decision}
                disabled={busy || active.status === "decided"}
                onChange={(event) => setDecision(event.target.value)}
              />
            </div>
            {active.status === "synthesized" ? (
              <button
                className="studio-btn"
                data-variant="primary"
                type="button"
                disabled={busy || decision.trim() === ""}
                onClick={() => void onDecide(active.id, decision)}
              >
                记录决策
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

