import { useState } from "react";
import type { FormEvent } from "react";

import {
  TRIGGER_SOURCE_LABELS,
  TRIGGER_STATUS_LABELS,
} from "../../shared/types.js";
import type {
  CreateTriggerInput,
  Project,
  Trigger,
  TriggerSource,
  UpdateTriggerRulesInput,
} from "../../shared/types.js";
import { IconAlert, IconPlus, IconSpark } from "../icons.js";

export function TriggerInbox({
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

