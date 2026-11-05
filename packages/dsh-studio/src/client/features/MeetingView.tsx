import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import type {
  CreateWorkshopInput,
  Project,
  ProjectFreeze,
  Role,
  Workshop,
  WorkshopAgendaItem,
  WorkshopPerspective,
  WorkshopMeetingType,
  WorkshopMinutesInput,
} from "../../shared/types.js";
import { formatDate } from "../lib/format.js";
import { IconPlus, IconUsers } from "../icons.js";

const MEETING_TYPE_LABELS: Record<WorkshopMeetingType, string> = {
  prd: "PRD 评审",
  architecture: "架构评审",
  balance: "平衡评审",
  custom: "自定义",
};

const AGENDA_TEMPLATES: Record<WorkshopMeetingType, string[]> = {
  prd: [
    "首切片的核心循环是否完整？",
    "哪些需求明确不在第一版？",
    "每条需求是否有可观察的验收口径？",
  ],
  architecture: [
    "模块边界和依赖方向是否清楚？",
    "失败模式与恢复策略是什么？",
    "首个垂直切片的测试策略是什么？",
  ],
  balance: [
    "当前伤害/冷却/资源循环是否过强或过弱？",
    "哪些改动会影响其他角色或系统？",
    "用什么可观察指标验证平衡？",
  ],
  custom: ["本次会议要关闭哪些问题？"],
};

function agendaFrom(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function MeetingComposer({
  roles,
  freezes,
  busy,
  onCreate,
}: {
  roles: Role[];
  freezes: ProjectFreeze[];
  busy: boolean;
  onCreate: (input: CreateWorkshopInput) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [meetingType, setMeetingType] = useState<WorkshopMeetingType>("prd");
  const [participants, setParticipants] = useState<string[]>(
    roles.slice(0, 4).map((role) => role.id),
  );
  const [agendaText, setAgendaText] = useState(
    AGENDA_TEMPLATES.prd.join("\n"),
  );
  const [freezeId, setFreezeId] = useState(freezes[0]?.id ?? "");
  const [perspectives, setPerspectives] = useState<Record<string, WorkshopPerspective>>({});
  const perspectiveOrder: WorkshopPerspective[] = [
    "experience",
    "competitor",
    "feasibility",
    "contrarian",
  ];
  const [error, setError] = useState<string | null>(null);

  const changeType = (next: WorkshopMeetingType): void => {
    setMeetingType(next);
    if (agendaText.trim() === AGENDA_TEMPLATES[meetingType].join("\n")) {
      setAgendaText(AGENDA_TEMPLATES[next].join("\n"));
    }
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (title.trim() === "") {
      setError("请填写会议标题");
      return;
    }
    if (participants.length === 0) {
      setError("至少选择一位参会角色");
      return;
    }
    if (agendaFrom(agendaText).length === 0) {
      setError("至少写一条议程；没有议程的会议会变成闲聊");
      return;
    }
    setError(null);
    const ok = await onCreate({
      title: title.trim(),
      topic: topic.trim(),
      meetingType,
      participantRoleIds: participants,
      agenda: agendaFrom(agendaText),
      freezeId: freezeId || null,
      perspectives: participants.map((roleId, index) => ({
        roleId,
        perspective:
          perspectives[roleId] ??
          perspectiveOrder[index % 4] ??
          "experience",
      })),
    });
    if (ok) {
      setTitle("");
      setTopic("");
    }
  };

  return (
    <form className="studio-panel studio-form" onSubmit={(event) => void submit(event)}>
      <div className="studio-panel-head">
        <IconPlus width={14} height={14} />
        <h3>新建会议</h3>
      </div>
      <div className="studio-panel-body">
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="meeting-title">会议标题</label>
            <input
              id="meeting-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="战斗体系评审"
            />
          </div>
          <div className="studio-field">
            <label htmlFor="meeting-type">会议类型</label>
            <select
              id="meeting-type"
              value={meetingType}
              onChange={(event) =>
                changeType(event.target.value as WorkshopMeetingType)
              }
            >
              {(Object.keys(MEETING_TYPE_LABELS) as WorkshopMeetingType[]).map(
                (type) => (
                  <option key={type} value={type}>
                    {MEETING_TYPE_LABELS[type]}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="meeting-topic">会议主题 / 背景</label>
          <textarea
            id="meeting-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="这次会议要解决什么，不讨论什么"
          />
        </div>
        <div className="studio-field">
          <label>绑定冻结版本（可选）</label>
          <select
            value={freezeId}
            onChange={(event) => setFreezeId(event.target.value)}
          >
            <option value="">不绑定</option>
            {freezes.map((freeze) => (
              <option key={freeze.id} value={freeze.id}>
                {freeze.kind === "prd" ? "PRD" : "架构"} {freeze.version}
              </option>
            ))}
          </select>
        </div>
        <div className="studio-field">
          <label>参会角色</label>
          <div className="studio-check-grid">
            {roles.map((role) => (
              <label className="studio-check" key={role.id}>
                <input
                  type="checkbox"
                  checked={participants.includes(role.id)}
                  onChange={(event) =>
                    setParticipants((current) =>
                      event.target.checked
                        ? [...current, role.id]
                        : current.filter((id) => id !== role.id),
                    )
                  }
                />
                {role.name}
                {participants.includes(role.id) ? (
                  <select
                    value={
                      perspectives[role.id] ??
                      perspectiveOrder[
                        Math.max(0, participants.indexOf(role.id)) % 4
                      ]
                    }
                    onChange={(event) =>
                      setPerspectives((current) => ({
                        ...current,
                        [role.id]: event.target.value as WorkshopPerspective,
                      }))
                    }
                  >
                    <option value="experience">体验</option>
                    <option value="competitor">竞品</option>
                    <option value="feasibility">技术可行性</option>
                    <option value="contrarian">反方</option>
                  </select>
                ) : null}
              </label>
            ))}
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="meeting-agenda">议程（每行一个问题）</label>
          <textarea
            id="meeting-agenda"
            value={agendaText}
            onChange={(event) => setAgendaText(event.target.value)}
          />
          <div className="studio-hint">
            会议结束前应关闭这些问题；关闭不了的要转成待办或明确不解决。
          </div>
        </div>
        {error !== null ? <div className="studio-alert">{error}</div> : null}
        <button className="studio-btn" data-variant="primary" disabled={busy}>
          创建会议
        </button>
      </div>
    </form>
  );
}

function AgendaPanel({
  workshop,
  onUpdate,
}: {
  workshop: Workshop;
  onUpdate: (itemId: string, status: "open" | "closed" | "deferred") => void;
}) {
  return (
    <div className="studio-meeting-agenda">
      {workshop.agenda.length === 0 ? (
        <span className="studio-faint">没有议程。</span>
      ) : (
        workshop.agenda.map((item: WorkshopAgendaItem) => (
          <div className="studio-meeting-agenda-row" key={item.id}>
            <span className="studio-pill" data-tone="p2">
              {item.status}
            </span>
            <span>{item.text}</span>
            <button
              type="button"
              className="studio-btn"
              data-size="sm"
              onClick={() => onUpdate(item.id, "closed")}
            >
              关闭
            </button>
            <button
              type="button"
              className="studio-btn"
              data-size="sm"
              onClick={() => onUpdate(item.id, "deferred")}
            >
              暂不解决
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function Settlement({
  workshop,
  busy,
  onUpdateMessage,
  onSaveMinutes,
  onSummarize,
  onCreateDecision,
  onOpenBoardroom,
}: {
  workshop: Workshop;
  busy: boolean;
  onUpdateMessage: (
    workshopId: string,
    messageId: string,
    content: string,
  ) => Promise<boolean>;
  onSaveMinutes: (
    workshopId: string,
    input: WorkshopMinutesInput,
  ) => Promise<boolean>;
  onSummarize: (workshopId: string) => Promise<boolean>;
  onCreateDecision: (workshopId: string) => Promise<boolean>;
  onOpenBoardroom: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [consensus, setConsensus] = useState(
    workshop.minutes?.consensus.join("\n") ?? "",
  );
  const [disagreements, setDisagreements] = useState(
    workshop.minutes?.disagreements.join("\n") ?? "",
  );
  const [openQuestions, setOpenQuestions] = useState(
    workshop.minutes?.openQuestions.join("\n") ?? "",
  );
  const [draft, setDraft] = useState(
    workshop.minutes?.decisionDraft ?? "",
  );
  const [noDisagreementReason, setNoDisagreementReason] = useState(
    workshop.minutes?.noDisagreementReason ?? "",
  );

  useEffect(() => {
    setConsensus(workshop.minutes?.consensus.join("\n") ?? "");
    setDisagreements(workshop.minutes?.disagreements.join("\n") ?? "");
    setOpenQuestions(workshop.minutes?.openQuestions.join("\n") ?? "");
    setDraft(workshop.minutes?.decisionDraft ?? "");
    setNoDisagreementReason(workshop.minutes?.noDisagreementReason ?? "");
  }, [workshop.id, workshop.minutes?.savedAt]);

  const saveMinutes = async (): Promise<void> => {
    await onSaveMinutes(workshop.id, {
      consensus: lines(consensus),
      disagreements: lines(disagreements),
      openQuestions: lines(openQuestions),
      decisionDraft: draft,
      noDisagreementReason: noDisagreementReason.trim() || null,
    });
  };

  return (
    <div className="studio-meeting-settlement">
      <div className="studio-section-label">结算：逐条检查发言</div>
      <div className="studio-meeting-messages">
        {workshop.messages.map((message) => (
          <div className="studio-meeting-message" key={message.id}>
            <div className="studio-meeting-message-head">
              <strong>{message.roleName}</strong>
              <span className="studio-faint">
                {message.kind === "owner" ? "Owner" : "参会角色"} ·{" "}
                {formatDate(message.createdAt)}
                {message.editedAt !== null ? " · 已编辑" : ""}
              </span>
            </div>
            <textarea
              value={edits[message.id] ?? message.content}
              onChange={(event) =>
                setEdits((current) => ({
                  ...current,
                  [message.id]: event.target.value,
                }))
              }
            />
            <div className="studio-meeting-message-actions">
              <button
                className="studio-btn"
                type="button"
                disabled={busy || !edits[message.id]}
                onClick={() =>
                  void onUpdateMessage(
                    workshop.id,
                    message.id,
                    edits[message.id] ?? message.content,
                  )
                }
              >
                保存编辑
              </button>
              {message.originalContent !== null &&
              message.originalContent !== message.content ? (
                <details className="studio-meeting-original">
                  <summary>查看原始发言</summary>
                  <pre>{message.originalContent}</pre>
                </details>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="studio-section-label">会议纪要</div>
      <div className="studio-meeting-minutes">
        <div className="studio-field">
          <label>共识</label>
          <textarea value={consensus} onChange={(event) => setConsensus(event.target.value)} />
        </div>
        <div className="studio-field">
          <label>分歧（必须显式保留）</label>
          <textarea
            value={disagreements}
            onChange={(event) => setDisagreements(event.target.value)}
          />
        </div>
        <div className="studio-field">
          <label>未决问题</label>
          <textarea
            value={openQuestions}
            onChange={(event) => setOpenQuestions(event.target.value)}
          />
        </div>
        <div className="studio-field">
          <label>无分歧理由（分歧为空时必填）</label>
          <input
            value={noDisagreementReason}
            onChange={(event) => setNoDisagreementReason(event.target.value)}
          />
        </div>
        <div className="studio-field">
          <label>决策草案</label>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        </div>
        <div className="studio-meeting-actions">
          <button className="studio-btn" type="button" disabled={busy} onClick={() => void onSummarize(workshop.id)}>
            AI 生成纪要草稿
          </button>
          <button className="studio-btn" type="button" disabled={busy} onClick={() => void saveMinutes()}>
            保存纪要
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="button"
            disabled={busy || workshop.minutes === null || workshop.decisionId !== null}
            onClick={() => void onCreateDecision(workshop.id)}
          >
            生成决策草案
          </button>
          {workshop.decisionId !== null ? (
            <button className="studio-btn" type="button" onClick={onOpenBoardroom}>
              去决策台批准
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MeetingView({
  project,
  roles,
  freezes,
  workshops,
  busy,
  onCreate,
  onSpeak,
  onSideSpeak,
  onUpdateAgenda,
  onUpdateMessage,
  onSettle,
  onSaveMinutes,
  onSummarize,
  onCreateDecision,
  onOpenBoardroom,
}: {
  project: Project | null;
  roles: Role[];
  freezes: ProjectFreeze[];
  workshops: Workshop[];
  busy: boolean;
  onCreate: (input: CreateWorkshopInput) => Promise<boolean>;
  onSpeak: (
    workshopId: string,
    content: string,
    targetRoleId: string | null,
  ) => Promise<boolean>;
  onSideSpeak: (
    workshopId: string,
    roleId: string,
    content: string,
  ) => Promise<boolean>;
  onUpdateAgenda: (
    workshopId: string,
    items: Array<{ id: string; status: "open" | "closed" | "deferred" }>,
  ) => Promise<boolean>;
  onUpdateMessage: (
    workshopId: string,
    messageId: string,
    content: string,
  ) => Promise<boolean>;
  onSettle: (workshopId: string) => Promise<boolean>;
  onSaveMinutes: (
    workshopId: string,
    input: WorkshopMinutesInput,
  ) => Promise<boolean>;
  onSummarize: (workshopId: string) => Promise<boolean>;
  onCreateDecision: (workshopId: string) => Promise<boolean>;
  onOpenBoardroom: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    workshops[0]?.id ?? null,
  );
  const [message, setMessage] = useState("");
  const [targetRoleId, setTargetRoleId] = useState("");
  const [chatTab, setChatTab] = useState<string>("group");
  const [sideMessage, setSideMessage] = useState("");
  const [showComposer, setShowComposer] = useState(workshops.length === 0);

  const active = useMemo(
    () => workshops.find((item) => item.id === selectedId) ?? workshops[0] ?? null,
    [selectedId, workshops],
  );

  useEffect(() => {
    if (active === null) {
      setSelectedId(null);
      return;
    }
    setSelectedId(active.id);
    setTargetRoleId(active.participantRoleIds[0] ?? "");
    setChatTab("group");
    setMessage("");
    setSideMessage("");
  }, [active?.id]);

  if (project === null) {
    return (
      <div className="studio-page">
        <div className="studio-page-head">
          <div>
            <div className="studio-eyebrow">MEETING ROOM</div>
            <h1 className="studio-title">会议室</h1>
            <p>先选择或创建一个项目。</p>
          </div>
        </div>
      </div>
    );
  }

  const participantRoles = roles.filter((role) =>
    active?.participantRoleIds.includes(role.id),
  );
  const canTalk = active !== null && active.status === "collecting";
  const settled = active !== null && active.status !== "collecting";

  return (
    <div className="studio-page">
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">MEETING ROOM</div>
          <div className="studio-meeting-title-row">
            <h1 className="studio-title">会议室</h1>
            <p className="studio-meeting-subtitle">
              人控制发言节奏；单聊不进群聊；会议产出是纪要，不是开发上下文。
            </p>
          </div>
        </div>
      </div>

      {showComposer ? (
        <MeetingComposer
        roles={roles}
        freezes={freezes}
        busy={busy}
        onCreate={onCreate}
      />
      ) : null}

      <div className="studio-meeting-layout">
        <aside className="studio-panel studio-meeting-list">
          <div className="studio-panel-head">
            <IconUsers width={14} height={14} />
            <h3>会议</h3>
          </div>
          <div className="studio-panel-body">
            {workshops.length === 0 ? (
              <span className="studio-faint">还没有会议。</span>
            ) : (
              workshops.map((workshop) => (
                <button
                  key={workshop.id}
                  type="button"
                  className="studio-meeting-list-row"
                  data-active={workshop.id === active?.id}
                  onClick={() => setSelectedId(workshop.id)}
                >
                  <strong>{workshop.title}</strong>
                  <span className="studio-faint">
                    {MEETING_TYPE_LABELS[workshop.meetingType]} ·{" "}
                    {workshop.status}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="studio-meeting-list-foot">
            <button
              className="studio-btn"
              type="button"
              onClick={() => setShowComposer((current) => !current)}
            >
              <IconPlus width={14} height={14} />
              {showComposer ? "收起新建" : "新建会议"}
            </button>
          </div>
        </aside>

        <main className="studio-meeting-main">
          {active === null ? (
            <div className="studio-empty">新建一场会议，或从左侧选择。</div>
          ) : (
            <>
              <details className="studio-panel studio-meeting-content" open>
                <summary className="studio-panel-head">
                  <h3>会议内容：{active.title}</h3>
                  <span className="studio-muted">
                    {MEETING_TYPE_LABELS[active.meetingType]} · {active.status}
                  </span>
                </summary>
                <div className="studio-panel-body">
                  {active.topic !== "" ? (
                    <p className="studio-meeting-topic">{active.topic}</p>
                  ) : null}
                  <AgendaPanel
                    workshop={active}
                    onUpdate={(itemId, status) =>
                      void onUpdateAgenda(active.id, [{ id: itemId, status }])
                    }
                  />
                  <div className="studio-meeting-participants">
                    {participantRoles.map((role) => (
                      <span className="studio-pill" key={role.id}>
                        {role.name}
                      </span>
                    ))}
                    {active.freezeId !== null ? (
                      <span className="studio-pill" data-tone="accent">
                        冻结：
                        {(() => {
                          const freeze = freezes.find(
                            (item) => item.id === active.freezeId,
                          );
                          return freeze === undefined
                            ? active.freezeId
                            : `${freeze.kind === "prd" ? "PRD" : "架构"} ${freeze.version}`;
                        })()}
                      </span>
                    ) : null}
                    {active.status !== "collecting" && active.decisionId === null ? (
                      <span className="studio-pill" data-tone="p0">
                        未闭环
                      </span>
                    ) : null}
                  </div>
                </div>
              </details>

              {!settled ? (
                <div className="studio-panel studio-chat-panel">
                  <div className="studio-meeting-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={chatTab === "group"}
                      data-active={chatTab === "group"}
                      onClick={() => setChatTab("group")}
                    >
                      群聊
                    </button>
                    {participantRoles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        role="tab"
                        aria-selected={chatTab === role.id}
                        data-active={chatTab === role.id}
                        onClick={() => setChatTab(role.id)}
                      >
                        单聊 · {role.name}
                      </button>
                    ))}
                  </div>

                  <div className="studio-panel-body">
                    {chatTab === "group" ? (
                      <>
                        <div className="studio-meeting-messages">
                          {active.messages.length === 0 ? (
                            <div className="studio-empty">
                              还没有发言。输入一句话，选择一位角色回答。
                            </div>
                          ) : (
                            active.messages.map((item) => (
                              <div
                                className="studio-meeting-message"
                                key={item.id}
                                data-kind={item.kind}
                              >
                                <div className="studio-meeting-message-head">
                                  <strong>{item.roleName}</strong>
                                  <span className="studio-faint">
                                    {formatDate(item.createdAt)}
                                  </span>
                                </div>
                                <div className="studio-meeting-message-content">
                                  {item.content}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="studio-meeting-speak">
                          <textarea
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            placeholder="输入你的发言；选择一位角色回答"
                          />
                          <div className="studio-meeting-speak-actions">
                            <select
                              value={targetRoleId}
                              onChange={(event) =>
                                setTargetRoleId(event.target.value)
                              }
                            >
                              {participantRoles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  @ {role.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="studio-btn"
                              data-variant="primary"
                              type="button"
                              disabled={busy || message.trim() === "" || !canTalk}
                              onClick={() =>
                                void (async () => {
                                  const ok = await onSpeak(
                                    active.id,
                                    message.trim(),
                                    targetRoleId || null,
                                  );
                                  if (ok) setMessage("");
                                })()
                              }
                            >
                              发言并让角色回答
                            </button>
                          </div>
                        </div>
                        <button
                          className="studio-btn"
                          type="button"
                          disabled={busy || active.messages.length === 0}
                          onClick={() => void onSettle(active.id)}
                        >
                          结束会议，进入结算
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="studio-meeting-tab-note">
                          与 {participantRoles.find((role) => role.id === chatTab)?.name ?? "该角色"} 的单聊；内容不进入群聊，也不自动进入纪要。
                        </div>
                        <div className="studio-meeting-side-messages">
                          {(active.sideChats.find((chat) => chat.roleId === chatTab)?.messages ?? []).map((item) => (
                            <div className="studio-meeting-side-message" key={item.id}>
                              <strong>{item.roleName}</strong>
                              <span>{item.content}</span>
                            </div>
                          ))}
                        </div>
                        <textarea
                          value={sideMessage}
                          onChange={(event) => setSideMessage(event.target.value)}
                          placeholder="只和这个角色说的话"
                        />
                        <button
                          className="studio-btn"
                          type="button"
                          disabled={busy || sideMessage.trim() === ""}
                          onClick={() =>
                            void (async () => {
                              const ok = await onSideSpeak(
                                active.id,
                                chatTab,
                                sideMessage.trim(),
                              );
                              if (ok) setSideMessage("");
                            })()
                          }
                        >
                          发送单聊
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <Settlement
                  workshop={active}
                  busy={busy}
                  onUpdateMessage={onUpdateMessage}
                  onSaveMinutes={onSaveMinutes}
                  onSummarize={onSummarize}
                  onCreateDecision={onCreateDecision}
                  onOpenBoardroom={onOpenBoardroom}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}