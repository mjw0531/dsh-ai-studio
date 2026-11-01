import { useState } from "react";
import type { FormEvent } from "react";
import type { CreateDecisionInput, Decision, Task } from "../../shared/types.js";
import { ModalShell } from "../components/ModalShell.js";

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

