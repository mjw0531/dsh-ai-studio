import { useState } from "react";
import type { FormEvent } from "react";
import { AGENT_EXECUTOR_LABELS } from "../../shared/types.js";
import type { AgentExecutor, CreateRoleInput, ProviderProfile } from "../../shared/types.js";
import { ModalShell } from "../components/ModalShell.js";

export function RoleForm({
  busy,
  profiles,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  profiles: ProviderProfile[];
  onCancel: () => void;
  onSubmit: (input: CreateRoleInput) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [mission, setMission] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [providerProfileId, setProviderProfileId] = useState("");
  const [model, setModel] = useState("");
  const [executor, setExecutor] = useState<AgentExecutor>("dsh");
  const [tokenBudget, setTokenBudget] = useState("");
  const [dailyTokenBudget, setDailyTokenBudget] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") {
      setLocalError("请填写角色名");
      return;
    }
    const parseBudget = (value: string, field: string): number | null => {
      if (value.trim() === "") return null;
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 0) {
        throw new Error(`${field} 必须是非负整数`);
      }
      return number === 0 ? null : number;
    };
    let budgets: { tokenBudget: number | null; dailyTokenBudget: number | null };
    try {
      budgets = {
        tokenBudget: parseBudget(tokenBudget, "单任务 token 预算"),
        dailyTokenBudget: parseBudget(dailyTokenBudget, "每日 token 预算"),
      };
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
      return;
    }
    setLocalError(null);
    onSubmit({
      name: name.trim(),
      title: title.trim(),
      mission: mission.trim(),
      responsibilities: responsibilities
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      providerProfileId: providerProfileId || null,
      model: model.trim() || undefined,
      executor,
      tokenBudget: budgets.tokenBudget,
      dailyTokenBudget: budgets.dailyTokenBudget,
    });
  };

  return (
    <ModalShell
      title="新增角色"
      subtitle="角色是职责契约，不是人设。先写清楚使命、职责和边界。"
      onClose={onCancel}
      footer={
        <div className="studio-modal-foot">
          <button className="studio-btn" type="button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            form="studio-role-form"
            disabled={busy}
          >
            {busy ? "创建中…" : "创建角色"}
          </button>
        </div>
      }
    >
      <form id="studio-role-form" className="studio-modal-body" onSubmit={submit}>
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="role-name">角色名</label>
            <input
              id="role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Builder"
              autoFocus
            />
          </div>
          <div className="studio-field">
            <label htmlFor="role-title">职位</label>
            <input
              id="role-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Gameplay 工程师"
            />
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="role-mission">使命</label>
          <textarea
            id="role-mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            placeholder="这个角色为什么存在？"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="role-responsibilities">职责（每行一条）</label>
          <textarea
            id="role-responsibilities"
            value={responsibilities}
            onChange={(event) => setResponsibilities(event.target.value)}
            placeholder={"实现能力/移动/冷却\n补单测\n维护构建"}
          />
        </div>
        <div className="studio-field">
          <label htmlFor="role-provider">Provider Profile</label>
          <select
            id="role-provider"
            value={providerProfileId}
            onChange={(event) => setProviderProfileId(event.target.value)}
          >
            <option value="">自定义 / 部署默认</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
        <div className="studio-field">
          <label htmlFor="role-executor">执行器</label>
          <select
            id="role-executor"
            value={executor}
            onChange={(event) =>
              setExecutor(event.target.value as AgentExecutor)
            }
          >
            <option value="dsh">{AGENT_EXECUTOR_LABELS.dsh}</option>
            <option value="claude-code">
              {AGENT_EXECUTOR_LABELS["claude-code"]}
            </option>
            <option value="codex">{AGENT_EXECUTOR_LABELS.codex}</option>
          </select>
          <div className="studio-hint">
            DSH 走内置模型路由；Claude Code / Codex 走本机 headless CLI，需要先登录对应工具。
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="role-model">模型（可选）</label>
          <input
            id="role-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="留空继承默认模型，例如 deepseek-flash"
          />
          <div className="studio-hint">
            “薪资”配置：架构师可以用更强/更贵的模型，实现者用更便宜的模型。
          </div>
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="role-budget">单次任务 token 预算</label>
            <input
              id="role-budget"
              inputMode="numeric"
              value={tokenBudget}
              onChange={(event) => setTokenBudget(event.target.value)}
              placeholder="留空 = 继承项目预算"
            />
          </div>
          <div className="studio-field">
            <label htmlFor="role-daily-budget">每日 token 预算</label>
            <input
              id="role-daily-budget"
              inputMode="numeric"
              value={dailyTokenBudget}
              onChange={(event) => setDailyTokenBudget(event.target.value)}
              placeholder="留空 = 不限制"
            />
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

