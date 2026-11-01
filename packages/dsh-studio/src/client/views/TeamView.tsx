import { useState } from "react";

import {
  AGENT_EXECUTOR_LABELS,
  BRANCH_STATUS_LABELS,
} from "../../shared/types.js";
import type {
  AgentExecutor,
  BootstrapResponse,
  Branch,
  ContractChange,
  CreateProviderProfileInput,
  ProviderProfile,
  ProviderProfileHealth,
  ProviderProbeResult,
  Role,
  Task,
  UpdateProviderProfileInput,
} from "../../shared/types.js";
import {
  IconPlus,
  IconSettings,
  IconUsers,
} from "../icons.js";
import { formatDate, initials } from "../lib/format.js";

function ProviderProfilesPanel({
  profiles,
  health,
  busy,
  onCreate,
  onUpdate,
  onDelete,
  onReassign,
  onProbe,
}: {
  profiles: ProviderProfile[];
  health: ProviderProfileHealth[];
  busy: boolean;
  onCreate: (input: CreateProviderProfileInput) => Promise<boolean>;
  onUpdate: (
    profileId: string,
    input: UpdateProviderProfileInput,
  ) => Promise<boolean>;
  onDelete: (profileId: string) => Promise<boolean>;
  onReassign: (
    fromProfileId: string,
    toProfileId: string,
  ) => Promise<boolean>;
  onProbe: (profileId: string) => Promise<ProviderProbeResult>;
}) {
  const [name, setName] = useState("");
  const [executor, setExecutor] = useState<AgentExecutor>("dsh");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [probingId, setProbingId] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, ProviderProbeResult>>(
    {},
  );

  return (
    <section className="studio-panel studio-provider-panel">
      <div className="studio-panel-head">
        <IconSettings width={14} height={14} />
        <h3>Provider Profiles</h3>
        <span className="studio-muted">
          {profiles.length === 0 ? "未配置" : `${String(profiles.length)} 个`}
        </span>
      </div>
      <div className="studio-panel-body">
        <div className="studio-hint">
          角色可以绑定一个 Profile，统一指定执行器、provider 和模型；不绑定则使用角色自己的配置。
        </div>
        <form
          className="studio-provider-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() === "") return;
            void onCreate({
              name: name.trim(),
              executor,
              provider: provider.trim(),
              model: model.trim(),
            }).then((ok) => {
              if (ok) {
                setName("");
                setProvider("");
                setModel("");
              }
            });
          }}
        >
          <input
            value={name}
            placeholder="Profile 名称，例如 Claude Sonnet"
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <select
            value={executor}
            disabled={busy}
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
          <input
            value={provider}
            placeholder="DSH provider（可空）"
            disabled={busy}
            onChange={(event) => setProvider(event.target.value)}
          />
          <input
            value={model}
            placeholder="模型 ID（可空）"
            disabled={busy}
            onChange={(event) => setModel(event.target.value)}
          />
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            disabled={busy || name.trim() === ""}
          >
            新增
          </button>
        </form>

        {profiles.length > 0 ? (
          <div className="studio-provider-list">
            {profiles.map((profile) => {
              const current = health.find(
                (item) => item.profileId === profile.id,
              );
              return (
              <div key={profile.id} className="studio-provider-row">
                <strong>{profile.name}</strong>
                <span className="studio-pill">
                  {AGENT_EXECUTOR_LABELS[profile.executor]}
                </span>
                <span className="studio-mono">
                  {profile.provider || "auto"} / {profile.model || "default"}
                </span>
                <span className="studio-muted">
                  {current?.state ?? "unknown"} · {current?.successCount ?? 0}/
                  {current?.runCount ?? 0} 成功 ·{" "}
                  {Math.round((current?.failureRate ?? 0) * 100)}% 失败 ·{" "}
                  {(current?.tokens ?? 0).toLocaleString()} tokens
                </span>
                {current?.suggestedProfileId ? (
                  <span className="studio-pill" data-tone="warn">
                    建议切换：
                    {profiles.find(
                      (item) => item.id === current.suggestedProfileId,
                    )?.name ?? current.suggestedProfileId}
                    <button
                      className="studio-btn"
                      data-size="sm"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const target = profiles.find(
                          (item) => item.id === current.suggestedProfileId,
                        );
                        if (
                          target !== undefined &&
                          window.confirm(
                            `把绑定「${profile.name}」的角色改绑到「${target.name}」？`,
                          )
                        ) {
                          void onReassign(profile.id, target.id);
                        }
                      }}
                    >
                      改绑
                    </button>
                  </span>
                ) : null}
                <button
                  className="studio-btn"
                  data-size="sm"
                  type="button"
                  disabled={busy || probingId === profile.id}
                  onClick={() => {
                    setProbingId(profile.id);
                    void onProbe(profile.id)
                      .then((result) => {
                        setProbes((currentProbes) => ({
                          ...currentProbes,
                          [profile.id]: result,
                        }));
                      })
                      .catch((error: unknown) => {
                        setProbes((currentProbes) => ({
                          ...currentProbes,
                          [profile.id]: {
                            profileId: profile.id,
                            executor: profile.executor,
                            provider: profile.provider,
                            model: profile.model,
                            ok: false,
                            checkedAt: new Date().toISOString(),
                            message:
                              error instanceof Error
                                ? error.message
                                : String(error),
                            availableModels: [],
                          },
                        }));
                      })
                      .finally(() => setProbingId(null));
                  }}
                >
                  {probingId === profile.id ? "探测中…" : "探测"}
                </button>
                <button
                  className="studio-btn"
                  data-size="sm"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const next = window.prompt("新的 Profile 名称：", profile.name);
                    if (next !== null && next.trim() !== "") {
                      void onUpdate(profile.id, { name: next.trim() });
                    }
                  }}
                >
                  改名
                </button>
                <button
                  className="studio-btn"
                  data-size="sm"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`删除 Provider Profile「${profile.name}」？`)) {
                      void onDelete(profile.id);
                    }
                  }}
                >
                  删除
                </button>
                {probes[profile.id] ? (
                  <div className="studio-provider-probe">
                    <span
                      className="studio-pill"
                      data-tone={probes[profile.id]?.ok ? "ok" : "warn"}
                    >
                      {probes[profile.id]?.ok ? "探测通过" : "探测失败"}
                    </span>
                    <span className="studio-muted">
                      {probes[profile.id]?.message}
                    </span>
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function TeamView({
  data,
  busy,
  onNewRole,
  onExecutor,
  onProvider,
  onCreateProvider,
  onUpdateProvider,
  onDeleteProvider,
  onReassignProvider,
  onProbeProvider,
}: {
  data: BootstrapResponse;
  busy: boolean;
  onNewRole: () => void;
  onExecutor: (roleId: string, executor: AgentExecutor) => Promise<void>;
  onProvider: (
    roleId: string,
    providerProfileId: string | null,
  ) => Promise<void>;
  onCreateProvider: (
    input: CreateProviderProfileInput,
  ) => Promise<boolean>;
  onUpdateProvider: (
    profileId: string,
    input: UpdateProviderProfileInput,
  ) => Promise<boolean>;
  onDeleteProvider: (profileId: string) => Promise<boolean>;
  onReassignProvider: (
    fromProfileId: string,
    toProfileId: string,
  ) => Promise<boolean>;
  onProbeProvider: (profileId: string) => Promise<ProviderProbeResult>;
}) {
  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Org Studio</div>
          <h1 className="studio-title">团队</h1>
          <p className="studio-subtitle">
            角色是持久的职责契约，Agent 是可替换的运行实例。v0.1 先管理角色卡；下一阶段把它们编译成 DSH Agent Preset。
          </p>
        </div>
        <div className="studio-head-actions">
          <button
            className="studio-btn"
            data-variant="primary"
            type="button"
            onClick={onNewRole}
            disabled={data.project === null}
            title={data.project === null ? "请先创建项目" : "新增角色"}
          >
            <IconPlus width={14} height={14} />
            新增角色
          </button>
        </div>
      </div>

      <ProviderProfilesPanel
        profiles={data.providerProfiles}
        health={data.providerHealth}
        busy={busy}
        onCreate={onCreateProvider}
        onUpdate={onUpdateProvider}
        onDelete={onDeleteProvider}
        onReassign={onReassignProvider}
        onProbe={onProbeProvider}
      />

      {data.roles.length === 0 ? (
        <div className="studio-empty">
          <strong>还没有角色</strong>
          建一个 Lead、一个 Builder 和一个 Verifier，就可以开始跑任务了。
        </div>
      ) : (
        <div className="studio-role-grid">
          {data.roles.map((role) => {
            const load = data.tasks.filter(
              (task) =>
                task.ownerRoleId === role.id &&
                (task.status === "running" || task.status === "review"),
            ).length;
            return (
              <article key={role.id} className="studio-role-card">
                <div className="studio-role-top">
                  <div className="studio-avatar">{initials(role.name)}</div>
                  <div>
                    <h3>{role.name}</h3>
                    <div className="studio-role-title">
                      {role.title || "未填写职位"}
                    </div>
                  </div>
                  <span
                    className="studio-pill"
                    data-tone={load > 0 ? "accent" : "p2"}
                    style={{ marginLeft: "auto" }}
                  >
                    {load} 个进行中
                  </span>
                </div>
                <div className="studio-role-mission">
                  {role.mission || "还没有写使命。"}
                </div>
                {role.responsibilities.length > 0 ? (
                  <div className="studio-role-section">
                    <div className="studio-role-section-label">职责</div>
                    <ul className="studio-role-list">
                      {role.responsibilities.slice(0, 5).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {role.decisionRights.length > 0 ? (
                  <div className="studio-role-section">
                    <div className="studio-role-section-label">决策权</div>
                    <div className="studio-actions">
                      {role.decisionRights.slice(0, 4).map((item) => (
                        <span key={item} className="studio-pill" data-tone="accent">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="studio-role-section">
                  <div className="studio-role-section-label">岗位配置</div>
                  <div className="studio-role-salary">
                    <select
                      value={role.providerProfileId ?? ""}
                      onChange={(event) =>
                        void onProvider(
                          role.id,
                          event.target.value === ""
                            ? null
                            : event.target.value,
                        )
                      }
                      title="Provider Profile"
                    >
                      <option value="">自定义 / 部署默认</option>
                      {data.providerProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={role.executor}
                      onChange={(event) =>
                        void onExecutor(
                          role.id,
                          event.target.value as AgentExecutor,
                        )
                      }
                      title="执行器"
                    >
                      <option value="dsh">{AGENT_EXECUTOR_LABELS.dsh}</option>
                      <option value="claude-code">
                        {AGENT_EXECUTOR_LABELS["claude-code"]}
                      </option>
                      <option value="codex">
                        {AGENT_EXECUTOR_LABELS.codex}
                      </option>
                    </select>
                    <span className="studio-mono">{role.model ?? "默认模型"}</span>
                    <span>
                      {role.tokenBudget === null
                        ? "单任务预算继承项目"
                        : `${role.tokenBudget.toLocaleString()} tokens/次`}
                    </span>
                    <span>
                      {role.dailyTokenBudget === null
                        ? "每日不限制"
                        : `${role.dailyTokenBudget.toLocaleString()} tokens/日`}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export function Roster({
  roles,
  tasks,
  onGoTeam,
}: {
  roles: Role[];
  tasks: Task[];
  onGoTeam: () => void;
}) {
  if (roles.length === 0) {
    return (
      <div className="studio-empty">
        <strong>还没有角色</strong>
        先建一个 Lead 和 Builder，再开始派任务。
        <div style={{ marginTop: 10 }}>
          <button type="button" className="studio-btn" data-size="sm" onClick={onGoTeam}>
            去团队页
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="studio-roster">
      {roles.map((role) => {
        const open = tasks.filter(
          (task) =>
            task.ownerRoleId === role.id &&
            (task.status === "running" || task.status === "review"),
        ).length;
        return (
          <div key={role.id} className="studio-person">
            <div className="studio-avatar">{initials(role.name)}</div>
            <div>
              <div className="studio-person-name">{role.name}</div>
              <div className="studio-person-title">
                {role.title || "未填写职位"}
              </div>
            </div>
            <div className="studio-person-load">
              <strong>{open}</strong>
              进行中
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BranchPanel({
  branches,
  contractChanges,
  tasks,
}: {
  branches: Branch[];
  contractChanges: ContractChange[];
  tasks: Task[];
}) {
  if (branches.length === 0) {
    return (
      <div className="studio-empty" style={{ padding: 18 }}>
        <strong>还没有支线</strong>
        创建带分支名的任务，或派单一次；Studio 会自动登记支线并跟踪契约变更。
      </div>
    );
  }
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return (
    <div className="studio-branch-list">
      {branches.map((branch) => {
        const changes = contractChanges.filter(
          (change) => change.branchId === branch.id,
        );
        return (
          <article key={branch.id} className="studio-branch-card">
            <div className="studio-branch-head">
              <span className="studio-mono">{branch.name}</span>
              <span className="studio-pill" data-tone="accent">
                {BRANCH_STATUS_LABELS[branch.status]}
              </span>
              <span className="studio-faint" style={{ marginLeft: "auto" }}>
                {changes.length} 个契约变更
              </span>
            </div>
            <div className="studio-branch-goal">
              {branch.goal || "没有写支线目标。"}
            </div>
            <div className="studio-branch-meta">
              {branch.taskId === null
                ? "未绑定任务"
                : (taskById.get(branch.taskId)?.title ?? branch.taskId)}
              {branch.contractKeys.length > 0
                ? ` · 契约：${branch.contractKeys.join("、")}`
                : " · 还没有契约变更"}
            </div>
            {changes.length > 0 ? (
              <div className="studio-branch-changes">
                {changes.slice(-3).map((change) => (
                  <div key={change.id}>
                    <span className="studio-mono">{change.contract}</span>
                    <span>{change.change}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
