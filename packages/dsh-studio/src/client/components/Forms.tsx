import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import {
  AGENT_EXECUTOR_LABELS,
  PRIORITY_LABELS,
  TASK_KIND_LABELS,
} from "../../shared/types.js";
import { IconX } from "../icons.js";
import type {
  AgentExecutor,
  CreateDecisionInput,
  CreateProjectFromTemplateInput,
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  DecideDecisionInput,
  Decision,
  Project,
  ProviderProfile,
  Role,
  Task,
  TaskKind,
  TaskPriority,
} from "../../shared/types.js";

export function ModalShell({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="studio-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="studio-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="studio-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle !== undefined ? (
              <div className="studio-muted">{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="studio-btn"
            data-size="icon"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
            aria-label="关闭"
          >
            <IconX width={15} height={15} />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

export function TaskForm({
  roles,
  busy,
  onCancel,
  onSubmit,
}: {
  roles: Role[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateTaskInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("P1");
  const [ownerRoleId, setOwnerRoleId] = useState(roles[0]?.id ?? "");
  const [reviewerRoleId, setReviewerRoleId] = useState(
    roles[1]?.id ?? roles[0]?.id ?? "",
  );
  const [acceptanceText, setAcceptanceText] = useState("");
  const [branch, setBranch] = useState("");
  const [verifyCommand, setVerifyCommand] = useState("npm test");
  const [moduleName, setModuleName] = useState("");
  const [contractRef, setContractRef] = useState("");
  const [requirementRefs, setRequirementRefs] = useState("");
  const [kind, setKind] = useState<TaskKind>("new");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");
  const [integration, setIntegration] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const acceptance = acceptanceText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (title.trim() === "") {
      setLocalError("请填写任务标题");
      return;
    }
    if (acceptance.length === 0) {
      setLocalError("至少写一条可验证的验收标准");
      return;
    }
    if (ownerRoleId === reviewerRoleId) {
      setLocalError("负责人和验收人最好是不同角色");
      return;
    }
    if (
      kind === "fix" &&
      (diagnosis.trim() === "" || plan.trim() === "")
    ) {
      setLocalError("改修票必须写诊断和修改计划");
      return;
    }
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      goal: goal.trim(),
      priority,
      ownerRoleId: ownerRoleId || null,
      reviewerRoleId: reviewerRoleId || null,
      acceptance,
      branch: branch.trim() || null,
      verifyCommand: verifyCommand.trim() || null,
      module: moduleName.trim() || null,
      contractRef: contractRef.trim() || null,
      requirementRefs: requirementRefs
        .split(/[\n,]/u)
        .map((line) => line.trim())
        .filter(Boolean),
      kind,
      diagnosis: diagnosis.trim(),
      plan: plan.trim(),
      integration,
    });
  };

  return (
    <ModalShell
      title="新建任务"
      subtitle="任务一开始就要有验收标准；完成由证据和独立验收决定。"
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
            form="studio-task-form"
            disabled={busy}
          >
            {busy ? "创建中…" : "创建任务"}
          </button>
        </div>
      }
    >
      <form id="studio-task-form" className="studio-modal-body" onSubmit={submit}>
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field">
          <label htmlFor="task-title">标题</label>
          <input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：实现能力冷却与施法前摇"
            autoFocus
          />
        </div>
        <div className="studio-field">
          <label htmlFor="task-goal">目标</label>
          <textarea
            id="task-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="这个任务要解决什么问题？交付什么？"
          />
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="task-priority">优先级</label>
            <select
              id="task-priority"
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as TaskPriority)
              }
            >
              <option value="P0">{PRIORITY_LABELS.P0}</option>
              <option value="P1">{PRIORITY_LABELS.P1}</option>
              <option value="P2">{PRIORITY_LABELS.P2}</option>
            </select>
          </div>
          <div className="studio-field">
            <label htmlFor="task-branch">分支（可选）</label>
            <input
              id="task-branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="task/003-ability"
            />
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="task-verify">验证命令（可选）</label>
          <input
            id="task-verify"
            value={verifyCommand}
            onChange={(event) => setVerifyCommand(event.target.value)}
            placeholder="npm test"
          />
          <div className="studio-hint">
            由 Studio Host 在 worktree 内独立执行；通过会写 evidence，但不自动通过验收。
          </div>
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="task-kind">票类型</label>
            <select
              id="task-kind"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as TaskKind)
              }
            >
              <option value="new">{TASK_KIND_LABELS.new}</option>
              <option value="fix">{TASK_KIND_LABELS.fix}</option>
            </select>
          </div>
          <div className="studio-field">
            <label htmlFor="task-module">模块</label>
            <input
              id="task-module"
              value={moduleName}
              onChange={(event) => setModuleName(event.target.value)}
              placeholder="combat / input / replay"
            />
          </div>
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="task-diagnosis">诊断（改修票必填）</label>
            <textarea
              id="task-diagnosis"
              value={diagnosis}
              onChange={(event) => setDiagnosis(event.target.value)}
              rows={3}
              placeholder="现象、复现步骤、初步根因"
            />
          </div>
          <div className="studio-field">
            <label htmlFor="task-plan">修改计划（改修票必填）</label>
            <textarea
              id="task-plan"
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
              rows={3}
              placeholder="要改哪些文件、怎么验证、风险"
            />
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="task-contract">契约引用</label>
          <input
            id="task-contract"
            value={contractRef}
            onChange={(event) => setContractRef(event.target.value)}
            placeholder="docs/contracts/replay-v1.md"
          />
          <div className="studio-hint">
            实现者只应修改这个契约允许的范围；改契约本身要走架构师/Owner。
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="task-requirements">需求引用（可选）</label>
          <input
            id="task-requirements"
            value={requirementRefs}
            onChange={(event) => setRequirementRefs(event.target.value)}
            placeholder="PRD-3.2, REQ-AUTH-01"
          />
          <div className="studio-hint">
            指向 PRD 条目或需求 ID，方便从任务追溯回需求。
          </div>
        </div>
        <label className="studio-check">
          <input
            type="checkbox"
            checked={integration}
            onChange={(event) => setIntegration(event.target.checked)}
          />
          集成 / playtest ticket（打包可玩 + 人玩 10 分钟）
        </label>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="task-owner">负责人</label>
            <select
              id="task-owner"
              value={ownerRoleId}
              onChange={(event) => setOwnerRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                  {role.title ? ` · ${role.title}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="studio-field">
            <label htmlFor="task-reviewer">验收人</label>
            <select
              id="task-reviewer"
              value={reviewerRoleId}
              onChange={(event) => setReviewerRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                  {role.title ? ` · ${role.title}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="task-acceptance">验收标准（每行一条）</label>
          <textarea
            id="task-acceptance"
            value={acceptanceText}
            onChange={(event) => setAcceptanceText(event.target.value)}
            placeholder={"冷却按 tick 计算\n前摇可被控制打断\n单测覆盖边界"}
            style={{ minHeight: 96 }}
          />
          <div className="studio-hint">
            Agent 不能自己把任务推到“已完成”；必须由验收人勾完所有标准。
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

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
      model: model.trim() || null,
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

export function ProjectForm({
  busy,
  onCancel,
  onSubmit,
  onSubmitTemplate,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateProjectInput) => void;
  onSubmitTemplate: (input: CreateProjectFromTemplateInput) => void;
}) {
  const [template, setTemplate] = useState<"blank" | "web" | "game" | "tool">(
    "blank",
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tokenBudget, setTokenBudget] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") {
      setLocalError("请填写项目名");
      return;
    }
    let budget: number | null = null;
    if (tokenBudget.trim() !== "") {
      const number = Number(tokenBudget);
      if (!Number.isSafeInteger(number) || number < 0) {
        setLocalError("token 预算必须是非负整数");
        return;
      }
      budget = number === 0 ? null : number;
    }
    setLocalError(null);
    if (template !== "blank") {
      onSubmitTemplate({
        template,
        name: name.trim(),
        description: description.trim(),
        repoPath: repoPath.trim() || null,
      });
      return;
    }
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      tokenBudget: budget,
      repoPath: repoPath.trim() || null,
    });
  };

  return (
    <ModalShell
      title="新建项目"
      subtitle="项目是任务、角色和事实的边界。"
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
            form="studio-project-form"
            disabled={busy}
          >
            {busy ? "创建中…" : "创建项目"}
          </button>
        </div>
      }
    >
      <form id="studio-project-form" className="studio-modal-body" onSubmit={submit}>
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field">
          <label htmlFor="project-template">模板</label>
          <select
            id="project-template"
            value={template}
            disabled={busy}
            onChange={(event) =>
              setTemplate(
                event.target.value as "blank" | "web" | "game" | "tool",
              )
            }
          >
            <option value="blank">空白项目</option>
            <option value="web">Web 应用（含 Lead/Builder/Verifier）</option>
            <option value="game">游戏原型（含 Lead/Architect/Builder/Verifier）</option>
            <option value="tool">CLI 工具（含 Lead/Builder/Verifier）</option>
          </select>
          {template !== "blank" ? (
            <div className="studio-hint">
              会自动创建角色和首批任务；repoPath 可以稍后绑定。
            </div>
          ) : null}
        </div>
        <div className="studio-field">
          <label htmlFor="project-name">项目名</label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：官网改版 / 工具链升级 / 数据看板"
            autoFocus
          />
        </div>
        <div className="studio-field">
          <label htmlFor="project-description">一句话描述</label>
          <textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="这个项目要验证什么？"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="project-budget">项目 token 预算（可选）</label>
          <input
            id="project-budget"
            inputMode="numeric"
            value={tokenBudget}
            onChange={(event) => setTokenBudget(event.target.value)}
            placeholder="留空 = 不限制；例如 200000"
          />
          <div className="studio-hint">
            这是公司给该项目的 token 上限；实际消耗来自 DSH token meter。
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="project-repo">代码仓库（可选）</label>
          <input
            id="project-repo"
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="例如 D:\projects\my-app"
          />
          <div className="studio-hint">
            绑定 git 仓库后，派单会为每个任务创建独立 worktree 和分支；不绑定则只做分析。
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

export function RepoForm({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (repoPath: string) => void;
}) {
  const [repoPath, setRepoPath] = useState(initial);

  return (
    <ModalShell
      title="绑定代码仓库"
      subtitle="必须是本机 git 仓库根目录。绑定后派单会在 .worktrees/<taskId> 创建独立工作区。"
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
            form="studio-repo-form"
            disabled={busy}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      }
    >
      <form
        id="studio-repo-form"
        className="studio-modal-body"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(repoPath);
        }}
      >
        <div className="studio-field">
          <label htmlFor="repo-path">仓库根目录</label>
          <input
            id="repo-path"
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="例如 D:\projects\my-app"
            autoFocus
          />
          <div className="studio-hint">
            留空 = 解绑，派单回到只读分析模式。Studio 不会自动 push 或合并。
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

export function DecisionForm({
  tasks,
  busy,
  onCancel,
  onSubmit,
}: {
  tasks: Task[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateDecisionInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [taskId, setTaskId] = useState("");
  const [reversible, setReversible] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (title.trim() === "") {
      setLocalError("请填写决策标题");
      return;
    }
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      context: context.trim(),
      recommendation: recommendation.trim(),
      taskId: taskId === "" ? null : taskId,
      reversible,
    });
  };

  return (
    <ModalShell
      title="提出决策"
      subtitle="把需要 Owner 拍板的事项放进决策台；Agent 的项目级建议也会自动出现在这里。"
      onClose={onCancel}
      footer={
        <div className="studio-modal-foot">
          <button
            className="studio-btn"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            form="studio-decision-form"
            disabled={busy}
          >
            {busy ? "提交中…" : "放入决策台"}
          </button>
        </div>
      }
    >
      <form id="studio-decision-form" className="studio-modal-body" onSubmit={submit}>
        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}
        <div className="studio-field">
          <label htmlFor="decision-title">决策标题</label>
          <input
            id="decision-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：是否把 replay 校验纳入合并门禁？"
            autoFocus
          />
        </div>
        <div className="studio-field">
          <label htmlFor="decision-context">背景与冲突</label>
          <textarea
            id="decision-context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="写清楚双方目标、冲突点、已尝试的方案。"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="decision-recommendation">建议（可选）</label>
          <textarea
            id="decision-recommendation"
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value)}
            placeholder="Architect/Owner 的建议；没有就留空。"
          />
        </div>
        <div className="studio-field">
          <label htmlFor="decision-task">关联任务（可选）</label>
          <select
            id="decision-task"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          >
            <option value="">项目级，不绑定任务</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </div>
        <label className="studio-check">
          <input
            type="checkbox"
            checked={!reversible}
            onChange={(event) => setReversible(!event.target.checked)}
          />
          不可逆决策（批准时必须写明结论和理由）
        </label>
      </form>
    </ModalShell>
  );
}

