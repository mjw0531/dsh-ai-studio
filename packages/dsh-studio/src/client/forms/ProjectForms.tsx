import { useState } from "react";
import type { FormEvent } from "react";
import type {
  CreateProjectFromTemplateInput,
  CreateProjectInput,
} from "../../shared/types.js";
import { ModalShell } from "../components/ModalShell.js";

type TemplateId = "blank" | "web" | "game" | "tool";

const TEMPLATE_LABELS: Record<TemplateId, string> = {
  blank: "空白项目",
  web: "Web 应用",
  game: "游戏原型",
  tool: "CLI 工具",
};

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
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState<TemplateId>("blank");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tokenBudget, setTokenBudget] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const validateBasic = (): boolean => {
    if (name.trim() === "") {
      setLocalError("请填写项目名");
      return false;
    }
    if (tokenBudget.trim() !== "") {
      const number = Number(tokenBudget);
      if (!Number.isSafeInteger(number) || number < 0) {
        setLocalError("token 预算必须是非负整数");
        return false;
      }
    }
    return true;
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setLocalError(null);
    if (step < 3) {
      if (step === 2 && !validateBasic()) return;
      setStep(step + 1);
      return;
    }
    if (!validateBasic()) {
      setStep(2);
      return;
    }
    let budget: number | null = null;
    if (tokenBudget.trim() !== "") {
      const number = Number(tokenBudget);
      budget = number === 0 ? null : number;
    }
    if (template !== "blank") {
      onSubmitTemplate({
        template,
        name: name.trim(),
        description: description.trim(),
        repoPath: repoPath.trim() || undefined,
      });
      return;
    }
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      tokenBudget: budget,
      repoPath: repoPath.trim() || undefined,
    });
  };

  return (
    <ModalShell
      title="项目开局向导"
      subtitle="三步建立项目、角色与第一张任务；之后可以继续绑定仓库。"
      onClose={onCancel}
      footer={
        <div className="studio-modal-foot">
          <button className="studio-btn" type="button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          {step > 1 ? (
            <button
              className="studio-btn"
              type="button"
              disabled={busy}
              onClick={() => {
                setLocalError(null);
                setStep(step - 1);
              }}
            >
              上一步
            </button>
          ) : null}
          <button
            className="studio-btn"
            data-variant="primary"
            type="submit"
            form="studio-project-form"
            disabled={busy}
          >
            {busy ? "创建中…" : step < 3 ? "下一步" : "创建项目"}
          </button>
        </div>
      }
    >
      <form id="studio-project-form" className="studio-modal-body" onSubmit={submit}>
        <div className="studio-wizard-steps" aria-label="开局步骤">
          {["模板", "基本信息", "确认"].map((label, index) => (
            <div
              className="studio-wizard-step"
              data-active={step === index + 1}
              data-done={step > index + 1}
              key={label}
            >
              <span>{step > index + 1 ? "✓" : String(index + 1)}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {localError !== null ? (
          <div className="studio-alert">{localError}</div>
        ) : null}

        {step === 1 ? (
          <>
            <div className="studio-field">
              <label htmlFor="project-template">模板</label>
              <select
                id="project-template"
                value={template}
                disabled={busy}
                onChange={(event) =>
                  setTemplate(event.target.value as TemplateId)
                }
            >
                <option value="blank">空白项目（自己配置角色）</option>
                <option value="web">Web 应用（Lead / Builder / Verifier）</option>
                <option value="game">游戏原型（Lead / Architect / Builder / Verifier）</option>
                <option value="tool">CLI 工具（Lead / Builder / Verifier）</option>
              </select>
              <div className="studio-hint">
                {template === "blank"
                  ? "空白项目不自动生成角色和任务，适合完全自定义。"
                  : "模板只初始化项目、角色和 backlog 任务；不会自动派单。"}
              </div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
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
                绑定 git 仓库后，派单会为任务创建独立 worktree；留空则先做分析。
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <div className="studio-wizard-summary">
            <div className="studio-section-label">确认开局</div>
            <dl className="studio-kv">
              <dt>模板</dt>
              <dd>{TEMPLATE_LABELS[template]}</dd>
              <dt>项目名</dt>
              <dd>{name || "（未填写）"}</dd>
              <dt>描述</dt>
              <dd>{description || "（未填写）"}</dd>
              <dt>仓库</dt>
              <dd>{repoPath || "稍后绑定"}</dd>
              <dt>token 预算</dt>
              <dd>{tokenBudget || "不限制"}</dd>
            </dl>
          </div>
        ) : null}
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
