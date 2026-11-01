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

function WorkshopPanel({
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

function PrototypeDemoPanel({
  project,
  demos,
  busy,
  onCreate,
  onUpdate,
}: {
  project: Project;
  demos: PrototypeDemo[];
  busy: boolean;
  onCreate: (input: CreatePrototypeDemoInput) => Promise<boolean>;
  onUpdate: (
    demoId: string,
    input: UpdatePrototypeDemoInput,
  ) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [entry, setEntry] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [steps, setSteps] = useState("");
  const [result, setResult] = useState<"passed" | "failed">("passed");
  const [screenshotPath, setScreenshotPath] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <section className="studio-panel studio-demo-panel">
      <div className="studio-panel-head">
        <IconSpark width={14} height={14} />
        <h3>原型 Demo 记录 / Prototype Demo</h3>
        <span className="studio-muted">
          {demos.length === 0 ? "还没有记录" : `${String(demos.length)} 条`}
        </span>
      </div>
      <div className="studio-panel-body">
        <div className="studio-hint">
          这是<b>手动记录</b>：Studio 不启动命令、不检测端口、不自动截图。记录会作为进入持续开发的 demo 证据。
        </div>
        <form
          className="studio-demo-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim() === "") return;
            void onCreate({
              title: title.trim(),
              entry: entry.trim(),
              startCommand: startCommand.trim(),
              steps: steps.trim(),
              result,
              screenshotPath: screenshotPath.trim(),
              notes: notes.trim(),
            }).then((ok) => {
              if (ok) {
                setTitle("");
                setEntry("");
                setStartCommand("");
                setSteps("");
                setScreenshotPath("");
                setNotes("");
              }
            });
          }}
        >
          <div className="studio-field-row">
            <div className="studio-field">
              <label>标题</label>
              <input
                value={title}
                disabled={busy}
                placeholder="例如：登录流程 Demo"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="studio-field">
              <label>结果</label>
              <select
                value={result}
                disabled={busy}
                onChange={(event) =>
                  setResult(event.target.value as "passed" | "failed")
                }
              >
                <option value="passed">通过</option>
                <option value="failed">失败</option>
              </select>
            </div>
          </div>
          <div className="studio-field-row">
            <div className="studio-field">
              <label>入口 URL / 路径</label>
              <input
                value={entry}
                disabled={busy}
                placeholder="http://localhost:5173 或 dist/demo"
                onChange={(event) => setEntry(event.target.value)}
              />
            </div>
            <div className="studio-field">
              <label>启动命令（只记录，不执行）</label>
              <input
                value={startCommand}
                disabled={busy}
                placeholder="pnpm dev"
                onChange={(event) => setStartCommand(event.target.value)}
              />
            </div>
          </div>
          <div className="studio-field">
            <label>验证步骤</label>
            <textarea
              value={steps}
              disabled={busy}
              onChange={(event) => setSteps(event.target.value)}
            />
          </div>
          <div className="studio-field-row">
            <div className="studio-field">
              <label>截图 / 录像路径</label>
              <input
                value={screenshotPath}
                disabled={busy}
                onChange={(event) => setScreenshotPath(event.target.value)}
              />
            </div>
            <div className="studio-field">
              <label>已知限制 / 备注</label>
              <input
                value={notes}
                disabled={busy}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            disabled={busy || title.trim() === ""}
          >
            保存 Demo 记录
          </button>
        </form>

        {demos.length > 0 ? (
          <div className="studio-demo-list">
            {demos.map((demo) => (
              <div key={demo.id} className="studio-demo-row">
                <div className="studio-demo-head">
                  <strong>{demo.title}</strong>
                  <span className="studio-pill">
                    {demo.result === "passed" ? "通过" : "失败"}
                  </span>
                  <span className="studio-muted">{demo.recordedBy}</span>
                </div>
                {demo.entry ? (
                  <div className="studio-mono">{demo.entry}</div>
                ) : null}
                {demo.startCommand ? (
                  <div className="studio-demo-command">
                    命令（未执行）：{demo.startCommand}
                  </div>
                ) : null}
                {demo.steps ? (
                  <div className="studio-demo-copy">{demo.steps}</div>
                ) : null}
                {demo.screenshotPath ? (
                  <div className="studio-demo-copy">
                    截图：{demo.screenshotPath}
                  </div>
                ) : null}
                {demo.notes ? (
                  <div className="studio-demo-copy">备注：{demo.notes}</div>
                ) : null}
                <button
                  className="studio-btn"
                  data-size="sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onUpdate(demo.id, {
                      result:
                        demo.result === "passed" ? "failed" : "passed",
                    })
                  }
                >
                  标记为{demo.result === "passed" ? "失败" : "通过"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TriggerInbox({
  project,
  triggers,
  busy,
  onIngest,
  onAccept,
  onIgnore,
  onSaveRules,
}: {
  project: Project;
  triggers: Trigger[];
  busy: boolean;
  onIngest: (input: CreateTriggerInput) => Promise<boolean>;
  onAccept: (trigger: Trigger) => void;
  onIgnore: (trigger: Trigger) => void;
  onSaveRules: (
    projectId: string,
    input: UpdateTriggerRulesInput,
  ) => Promise<boolean>;
}) {
  const [source, setSource] = useState<TriggerSource>("manual");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [threadKey, setThreadKey] = useState("");
  const [rulesEnabled, setRulesEnabled] = useState(
    project.triggerRules.enabled,
  );
  const [ruleSources, setRuleSources] = useState<TriggerSource[]>(
    project.triggerRules.sources,
  );
  const [ruleRepos, setRuleRepos] = useState(
    project.triggerRules.repos.join("\n"),
  );
  const [ruleLabels, setRuleLabels] = useState(
    project.triggerRules.labels.join("\n"),
  );
  const [ruleAuthors, setRuleAuthors] = useState(
    project.triggerRules.authors.join("\n"),
  );
  const [ruleMention, setRuleMention] = useState(
    project.triggerRules.mention,
  );
  const pending = triggers.filter((trigger) => trigger.status === "pending");

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (title.trim() === "") return;
    const ok = await onIngest({
      source,
      title: title.trim(),
      body: body.trim(),
      threadKey: threadKey.trim() || undefined,
    });
    if (ok) {
      setTitle("");
      setBody("");
      setThreadKey("");
    }
  };

  return (
    <section className="studio-panel studio-trigger-panel">
      <div className="studio-panel-head">
        <IconSpark width={14} height={14} />
        <h3>触发收件箱 / Trigger Inbox</h3>
        <span className="studio-muted">
          {pending.length === 0 ? "没有待处理事件" : `${String(pending.length)} 条待处理`}
        </span>
      </div>
      <div className="studio-panel-body">
        <form className="studio-trigger-form" onSubmit={(event) => void submit(event)}>
          <select
            value={source}
            disabled={busy}
            onChange={(event) =>
              setSource(event.target.value as TriggerSource)
            }
          >
            {(Object.keys(TRIGGER_SOURCE_LABELS) as TriggerSource[]).map(
              (item) => (
                <option key={item} value={item}>
                  {TRIGGER_SOURCE_LABELS[item]}
                </option>
              ),
            )}
          </select>
          <input
            value={title}
            placeholder="事件标题，例如：切换会话时偶发白屏"
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            value={threadKey}
            placeholder="Thread key（可选）"
            disabled={busy}
            onChange={(event) => setThreadKey(event.target.value)}
          />
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            disabled={busy || title.trim() === ""}
          >
            捕获
          </button>
        </form>
        <textarea
          className="studio-trigger-body"
          value={body}
          disabled={busy}
          placeholder="事件正文 / 复现信息（可选）"
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="studio-hint">
          同一 threadKey 会归入同一条 Thread；后续事件直接关联到已有任务。捕获不会自动派单或合并。
        </div>

        <details className="studio-webhook-rules">
          <summary>Webhook 接入与规则</summary>
          <div className="studio-webhook-body">
            <div className="studio-hint">
              端点：<code>/studio-api/webhooks/{project.id}/github</code>
              （ci / im 同理）。
              服务端必须设置 <code>DSH_STUDIO_WEBHOOK_SECRET</code>，
              请求头使用 <code>X-Hub-Signature-256: sha256=...</code>。
            </div>
            <label className="studio-stage-check">
              <input
                type="checkbox"
                checked={rulesEnabled}
                disabled={busy}
                onChange={(event) => setRulesEnabled(event.target.checked)}
              />
              <span>启用 Webhook</span>
            </label>
            <div className="studio-actions">
              {(["github", "ci", "im"] as TriggerSource[]).map((item) => (
                <label key={item} className="studio-stage-check">
                  <input
                    type="checkbox"
                    checked={ruleSources.includes(item)}
                    disabled={busy}
                    onChange={() =>
                      setRuleSources((current) =>
                        current.includes(item)
                          ? current.filter((value) => value !== item)
                          : [...current, item],
                      )
                    }
                  />
                  <span>{TRIGGER_SOURCE_LABELS[item]}</span>
                </label>
              ))}
            </div>
            <div className="studio-field-row">
              <div className="studio-field">
                <label>仓库白名单（每行一个，空 = 不限）</label>
                <textarea
                  value={ruleRepos}
                  disabled={busy}
                  onChange={(event) => setRuleRepos(event.target.value)}
                />
              </div>
              <div className="studio-field">
                <label>标签白名单（每行一个）</label>
                <textarea
                  value={ruleLabels}
                  disabled={busy}
                  onChange={(event) => setRuleLabels(event.target.value)}
                />
              </div>
            </div>
            <div className="studio-field-row">
              <div className="studio-field">
                <label>作者白名单（每行一个）</label>
                <textarea
                  value={ruleAuthors}
                  disabled={busy}
                  onChange={(event) => setRuleAuthors(event.target.value)}
                />
              </div>
              <div className="studio-field">
                <label>必须包含的 mention（空 = 不限）</label>
                <input
                  value={ruleMention}
                  disabled={busy}
                  onChange={(event) => setRuleMention(event.target.value)}
                />
              </div>
            </div>
            <button
              className="studio-btn"
              type="button"
              disabled={busy}
              onClick={() => {
                const lines = (value: string): string[] =>
                  value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean);
                void onSaveRules(project.id, {
                  enabled: rulesEnabled,
                  sources: ruleSources,
                  repos: lines(ruleRepos),
                  labels: lines(ruleLabels),
                  authors: lines(ruleAuthors),
                  mention: ruleMention.trim(),
                });
              }}
            >
              保存 Webhook 规则
            </button>
          </div>
        </details>

        {pending.length === 0 ? (
          <div className="studio-empty">
            <strong>收件箱为空</strong>
            外部事件会先进入这里，由你决定是否转成任务。
          </div>
        ) : (
          <div className="studio-trigger-list">
            {pending.map((trigger) => (
              <div key={trigger.id} className="studio-trigger-row">
                <div className="studio-trigger-main">
                  <div className="studio-trigger-title">
                    <span className="studio-pill">{trigger.source}</span>
                    <strong>{trigger.title}</strong>
                    <span className="studio-muted">
                      {TRIGGER_STATUS_LABELS[trigger.status]}
                    </span>
                  </div>
                  {trigger.body ? (
                    <div className="studio-trigger-copy">{trigger.body}</div>
                  ) : null}
                  <div className="studio-trigger-meta">
                    Thread: <code>{trigger.threadKey}</code>
                    {trigger.taskId === null
                      ? ""
                      : " · 已关联任务"}
                  </div>
                </div>
                <div className="studio-trigger-actions">
                  <button
                    className="studio-btn"
                    data-size="sm"
                    type="button"
                    disabled={busy}
                    onClick={() => onAccept(trigger)}
                  >
                    转为任务
                  </button>
                  <button
                    className="studio-btn"
                    data-size="sm"
                    type="button"
                    disabled={busy}
                    onClick={() => onIgnore(trigger)}
                  >
                    忽略
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StagePanel({
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

