import { useState } from "react";
import type { FormEvent } from "react";
import type { CreateProjectFromTemplateInput, CreateProjectInput, Project } from "../../shared/types.js";
import { ModalShell } from "../components/ModalShell.js";

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

