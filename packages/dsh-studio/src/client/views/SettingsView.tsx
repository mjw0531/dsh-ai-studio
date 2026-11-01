import { useEffect, useState } from "react";

import type { BootstrapResponse } from "../../shared/types.js";
import { readStudioBoot } from "../api.js";
import type { StudioBoot } from "../api.js";
import { formatDate } from "../lib/format.js";
import { IconAlert, IconPlus } from "../icons.js";

export function SettingsView({
  boot,
  data,
  theme,
  onTheme,
  onNewProject,
  onBindRepo,
  onReload,
  onCompany,
  onBundle,
  onImportBundle,
}: {
  boot: NonNullable<ReturnType<typeof readStudioBoot>>;
  data: BootstrapResponse;
  theme: "dark" | "light";
  onTheme: (theme: "dark" | "light") => void;
  onNewProject: () => void;
  onBindRepo: () => void;
  onReload: () => void;
  onCompany: (name: string) => Promise<void>;
  onBundle: () => Promise<void>;
  onImportBundle: () => Promise<void>;
}) {
  const [companyName, setCompanyName] = useState(data.company.name);
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    setCompanyName(data.company.name);
  }, [data.company.name]);

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Runtime</div>
          <h1 className="studio-title">设置</h1>
          <p className="studio-subtitle">
            这里只展示运行事实，不提供“改配置重启”之类的隐式操作。数据在本地文件里，刷新/重启不丢。
          </p>
        </div>
        <div className="studio-head-actions">
          <button className="studio-btn" type="button" onClick={onReload}>
            重新加载
          </button>
        </div>
      </div>

      <div className="studio-settings-grid">
        <section className="studio-settings-card">
          <h3>工作室</h3>
          <form
            className="studio-field"
            onSubmit={(event) => {
              event.preventDefault();
              if (savingCompany || companyName.trim() === "") return;
              setSavingCompany(true);
              void onCompany(companyName.trim()).finally(() =>
                setSavingCompany(false),
              );
            }}
          >
            <label htmlFor="company-name">工作室名称</label>
            <input
              id="company-name"
              value={companyName}
              maxLength={80}
              onChange={(event) => setCompanyName(event.target.value)}
            />
            <p className="studio-hint">
              显示在顶部品牌和工作室仪表盘；默认「AI工作室」。
            </p>
            <button
              className="studio-btn"
              data-size="sm"
              data-variant="primary"
              type="submit"
              disabled={savingCompany || companyName.trim() === ""}
            >
              {savingCompany ? "保存中…" : "保存工作室名称"}
            </button>
          </form>
        </section>

        <section className="studio-settings-card">
          <h3>版本与兼容性</h3>
          <dl className="studio-kv">
            <dt>插件</dt>
            <dd className="studio-mono">v{boot.pluginVersion}</dd>
            <dt>DSH</dt>
            <dd className="studio-mono">{data.app.dshVersion}</dd>
            <dt>兼容状态</dt>
            <dd>
              <span
                className="studio-pill"
                data-tone={
                  data.app.compatibility.status === "supported"
                    ? "ok"
                    : data.app.compatibility.status === "untested"
                      ? "p0"
                      : "p1"
                }
              >
                {data.app.compatibility.status}
              </span>
            </dd>
            <dt>验证基线</dt>
            <dd className="studio-mono">
              {data.app.compatibility.testedWith}
            </dd>
          </dl>
          <p className="studio-hint" style={{ marginTop: 10 }}>
            {data.app.compatibility.message}
          </p>
        </section>

        <section className="studio-settings-card">
          <h3>数据</h3>
          <dl className="studio-kv">
            <dt>数据目录</dt>
            <dd className="studio-mono">{data.app.dataDir}</dd>
            <dt>Schema</dt>
            <dd className="studio-mono">v{String(data.app.schemaVersion)}</dd>
            <dt>服务时间</dt>
            <dd>{formatDate(data.app.serverTime)}</dd>
            <dt>项目</dt>
            <dd>{data.projects.length} 个</dd>
          </dl>
          <div style={{ marginTop: 12 }}>
            <button className="studio-btn" data-size="sm" type="button" onClick={onNewProject}>
              <IconPlus width={13} height={13} />
              新建项目
            </button>
          </div>
        </section>

        <section className="studio-settings-card">
          <h3>代码仓库</h3>
          <dl className="studio-kv">
            <dt>项目</dt>
            <dd>{data.project?.name ?? "未选择"}</dd>
            <dt>仓库路径</dt>
            <dd className="studio-mono">
              {data.project?.repoPath ?? "未绑定（只做分析）"}
            </dd>
          </dl>
          <p className="studio-hint" style={{ marginTop: 8 }}>
            绑定 git 仓库后，派单会为每个任务创建独立 worktree 和
            `studio/&lt;taskId&gt;` 分支；不绑定则只做只读分析。
          </p>
          <div style={{ marginTop: 12 }}>
            <button
              className="studio-btn"
              data-size="sm"
              type="button"
              onClick={onBindRepo}
              disabled={data.project === null}
            >
              绑定 / 更换仓库
            </button>
            <button
              className="studio-btn"
              data-size="sm"
              type="button"
              onClick={() => void onBundle()}
              disabled={data.project === null || data.project.repoPath === null}
              title="导出状态 + Git 历史 + 迁移说明"
            >
              导出项目包
            </button>
            <button
              className="studio-btn"
              data-size="sm"
              type="button"
              onClick={() => void onImportBundle()}
              title="从项目包恢复状态并 clone 仓库"
            >
              导入项目包
            </button>
          </div>
        </section>

        <section className="studio-settings-card">
          <h3>能力边界</h3>
          <dl className="studio-kv">
            <dt>独立页面</dt>
            <dd>{data.features.independentPage ? "可用" : "不可用"}</dd>
            <dt>文件持久化</dt>
            <dd>{data.features.filePersistence ? "可用" : "不可用"}</dd>
            <dt>公司仪表盘</dt>
            <dd>{data.features.ownerDashboard ? "可用" : "不可用"}</dd>
            <dt>决策台</dt>
            <dd>{data.features.decisionBoard ? "可用" : "不可用"}</dd>
            <dt>支线/契约</dt>
            <dd>{data.features.branchBoard ? "可用" : "不可用"}</dd>
            <dt>代码执行</dt>
            <dd>{data.features.codeExecution ? "可用（worktree）" : "不可用"}</dd>
            <dt>独立验证</dt>
            <dd>{data.features.verification ? "可用（Host 执行）" : "不可用"}</dd>
            <dt>契约护栏</dt>
            <dd>
              {data.features.contractGuard
                ? "可用（契约/禁止路径越界自动升级）"
                : "不可用"}
            </dd>
            <dt>独立评审</dt>
            <dd>
              {data.features.independentReview
                ? "可用（验收人 Agent）"
                : "不可用"}
            </dd>
            <dt>合并治理</dt>
            <dd>
              {data.features.mergeGovernance
                ? "可用（记录评审，人工执行 Git）"
                : "不可用"}
            </dd>
            <dt>Agent 派单</dt>
            <dd>
              {data.features.agentExecution
                ? "可用（分析 / worktree 代码，结构化回执）"
                : "不可用"}
            </dd>
            <dt>Git 自动合并</dt>
            <dd className="studio-faint">
              {data.features.gitMerge ? "已启用" : "未启用（有意）"}
            </dd>
          </dl>
          <p className="studio-hint" style={{ marginTop: 10 }}>
            v0.9 只使用 DSH Web Server 路由、client slots、React 和公开 Agent API，
            不依赖私有 Remote 生成器；Agent 在 worktree 写代码，Host 独立验证并执行契约护栏，决策与合并由人拍板。
          </p>
        </section>

        <section className="studio-settings-card">
          <h3>界面</h3>
          <div className="studio-field">
            <label htmlFor="studio-theme">主题</label>
            <select
              id="studio-theme"
              value={theme}
              onChange={(event) =>
                onTheme(event.target.value === "light" ? "light" : "dark")
              }
            >
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </select>
          </div>
          <p className="studio-hint" style={{ marginTop: 10 }}>
            主题保存在当前浏览器；数据与主题互不影响。
          </p>
        </section>
      </div>

      <section className="studio-panel" style={{ marginTop: 14 }}>
        <div className="studio-panel-head">
          <IconAlert width={14} height={14} />
          <h3>安全说明</h3>
        </div>
        <div className="studio-panel-body">
          <p className="studio-hint" style={{ margin: 0, lineHeight: 1.7 }}>
            Studio API 使用每次进程启动随机生成的 Bearer token，token 只注入到
            当前 DSH 页面；接口同源、无 CORS、禁用缓存。数据写到本机
            DSH_HOME/studio/studio.json，不包含模型密钥。不要把 token 贴到聊天或日志里。
          </p>
        </div>
      </section>
    </>
  );
}

