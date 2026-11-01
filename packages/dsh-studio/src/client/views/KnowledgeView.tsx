import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { Module, Project, ProjectDoc } from "../../shared/types.js";
import { IconPlus } from "../icons.js";

export function KnowledgeView({
  project,
  modules,
  busy,
  onSaveDocs,
  onReadDoc,
  onNewModule,
}: {
  project: Project | null;
  modules: Module[];
  busy: boolean;
  onSaveDocs: (docs: {
    prdPath: string | null;
    invariantsPath: string | null;
    modulesPath: string | null;
  }) => Promise<boolean>;
  onReadDoc: (path: string) => Promise<ProjectDoc | null>;
  onNewModule: () => void;
}) {
  const [prdPath, setPrdPath] = useState(project?.prdPath ?? "");
  const [invariantsPath, setInvariantsPath] = useState(
    project?.invariantsPath ?? "",
  );
  const [modulesPath, setModulesPath] = useState(
    project?.modulesPath ?? "",
  );
  const [doc, setDoc] = useState<ProjectDoc | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    setPrdPath(project?.prdPath ?? "");
    setInvariantsPath(project?.invariantsPath ?? "");
    setModulesPath(project?.modulesPath ?? "");
  }, [project?.id, project?.prdPath, project?.invariantsPath, project?.modulesPath]);
  const read = async (path: string): Promise<void> => {
    if (path.trim() === "") return;
    setReading(true);
    const result = await onReadDoc(path.trim());
    setReading(false);
    if (result !== null) setDoc(result);
  };
  const save = (event: FormEvent): void => {
    event.preventDefault();
    void onSaveDocs({
      prdPath: prdPath.trim() || null,
      invariantsPath: invariantsPath.trim() || null,
      modulesPath: modulesPath.trim() || null,
    });
  };
  return (
    <div className="studio-page">
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">PROJECT KNOWLEDGE</div>
          <h1>知识层</h1>
          <p>
            PRD 是需求唯一事实源；模块契约卡把 Agent 的上下文喂窄。
            这里只读展示仓库里的文档，不复制第二份正文。
          </p>
        </div>
        <button
          type="button"
          className="studio-btn"
          data-tone="primary"
          onClick={onNewModule}
          disabled={busy || project === null}
        >
          <IconPlus width={14} height={14} />
          新建模块
        </button>
      </div>

      <div className="studio-knowledge-grid">
        <section className="studio-panel">
          <div className="studio-section-label">项目文档</div>
          <form onSubmit={save} className="studio-form">
            <div className="studio-field">
              <label htmlFor="prd-path">PRD 路径</label>
              <input
                id="prd-path"
                value={prdPath}
                onChange={(event) => setPrdPath(event.target.value)}
                placeholder="docs/PRD.md"
              />
            </div>
            <div className="studio-field">
              <label htmlFor="invariants-path">INVARIANTS 路径</label>
              <input
                id="invariants-path"
                value={invariantsPath}
                onChange={(event) => setInvariantsPath(event.target.value)}
                placeholder="docs/INVARIANTS.md"
              />
            </div>
            <div className="studio-field">
              <label htmlFor="modules-path">MODULES 路径</label>
              <input
                id="modules-path"
                value={modulesPath}
                onChange={(event) => setModulesPath(event.target.value)}
                placeholder="docs/MODULES.md"
              />
            </div>
            <div className="studio-form-actions">
              <button
                type="button"
                className="studio-btn"
                data-size="sm"
                disabled={reading || prdPath.trim() === ""}
                onClick={() => void read(prdPath)}
              >
                读取 PRD
              </button>
              <button
                type="button"
                className="studio-btn"
                data-size="sm"
                disabled={reading || invariantsPath.trim() === ""}
                onClick={() => void read(invariantsPath)}
              >
                读取不变量
              </button>
              <button type="submit" className="studio-btn" data-size="sm" data-tone="primary" disabled={busy}>
                保存路径
              </button>
            </div>
          </form>
          {doc !== null ? (
            <div className="studio-doc-view">
              <div className="studio-doc-head">
                <span className="studio-mono">{doc.path}</span>
                <span className="studio-pill" data-tone={doc.exists ? "ok" : "p0"}>
                  {doc.exists ? "已读取" : "文件不存在"}
                </span>
              </div>
              <pre>{doc.content || "（空文件）"}</pre>
            </div>
          ) : null}
        </section>

        <section className="studio-panel">
          <div className="studio-section-label">
            模块契约 · {modules.length}
          </div>
          {modules.length === 0 ? (
            <div className="studio-empty">
              还没有模块。先建一个模块契约卡，再派单；实现者只加载这张卡。
            </div>
          ) : (
            <div className="studio-module-list">
              {modules.map((module) => (
                <article key={module.id} className="studio-module-card">
                  <div className="studio-module-head">
                    <strong>{module.name}</strong>
                    <span className="studio-pill" data-tone="p2">
                      {module.allowedPaths.length} 允许路径
                    </span>
                  </div>
                  <p>{module.responsibility || "未填写职责"}</p>
                  {module.contractPath !== null ? (
                    <button
                      type="button"
                      className="studio-link"
                      disabled={reading}
                      onClick={() => void read(module.contractPath ?? "")}
                    >
                      {module.contractPath}
                    </button>
                  ) : null}
                  {module.contractText !== "" ? (
                    <pre className="studio-module-contract">
                      {module.contractText.slice(0, 800)}
                    </pre>
                  ) : null}
                  {module.dependsOn.length > 0 ? (
                    <div className="studio-faint" style={{ fontSize: 10 }}>
                      依赖：{module.dependsOn.join("、")}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
