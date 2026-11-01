import { useState } from "react";
import type { FormEvent } from "react";
import { PRIORITY_LABELS, TASK_KIND_LABELS } from "../../shared/types.js";
import type {
  CreateTaskInput,
  Role,
  TaskKind,
  TaskPriority,
} from "../../shared/types.js";
import { ModalShell } from "../components/ModalShell.js";

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

