import { useState } from "react";

import {
  COMPANY_HEALTH_LABELS,
  ROLE_LOAD_LABELS,
} from "../../shared/types.js";
import type {
  BootstrapResponse,
  CompanyProjectSummary,
  OwnerNeed,
  Project,
  RoleLoadSummary,
} from "../../shared/types.js";
import {
  IconAlert,
  IconBuilding,
  IconChevronRight,
  IconGitMerge,
  IconGrid,
  IconPlus,
  IconSpark,
  IconUsers,
} from "../icons.js";
import { formatDate } from "../lib/format.js";
import { StatCard } from "../components/ui.js";

function OnboardingPanel({
  data,
  onNewProject,
  onOpenProject,
}: {
  data: BootstrapResponse;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
}) {
  const [dismissed, setDismissed] = useState(
    () => window.localStorage.getItem("studio.onboarding.dismissed") === "1",
  );
  const project = data.project;
  const steps = [
    {
      label: "创建项目",
      done: data.projects.length > 0,
    },
    {
      label: "创建角色",
      done: data.roles.length > 0,
    },
    {
      label: "创建第一个任务",
      done: data.tasks.length > 0,
    },
    {
      label: "绑定代码仓库",
      done: project !== null && project.repoPath !== null,
    },
  ];
  if (dismissed || steps.every((step) => step.done)) return null;

  return (
    <section className="studio-panel studio-onboarding">
      <div className="studio-panel-head">
        <IconSpark width={14} height={14} />
        <h3>开始使用 / Getting Started</h3>
        <button
          className="studio-icon-btn"
          type="button"
          onClick={() => {
            window.localStorage.setItem("studio.onboarding.dismissed", "1");
            setDismissed(true);
          }}
          aria-label="关闭引导"
        >
          ×
        </button>
      </div>
      <div className="studio-panel-body">
        <div className="studio-onboarding-steps">
          {steps.map((step, index) => (
            <div
              key={step.label}
              className="studio-onboarding-step"
              data-done={step.done}
            >
              <span>{step.done ? "✓" : String(index + 1)}</span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>
        <div className="studio-actions">
          {project === null ? (
            <button
              className="studio-btn"
              data-variant="primary"
              type="button"
              onClick={onNewProject}
            >
              新建项目
            </button>
          ) : (
            <button
              className="studio-btn"
              data-variant="primary"
              type="button"
              onClick={() => onOpenProject(project.id)}
            >
              打开当前项目
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function CompanyView({
  data,
  busy,
  onOpenProject,
  onOpenNeed,
  onNewProject,
}: {
  data: BootstrapResponse;
  busy: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenNeed: (need: OwnerNeed) => void;
  onNewProject: () => void;
}) {
  const company = data.company;
  const acceptanceRate =
    company.totals.acceptanceTotal === 0
      ? 0
      : Math.round(
          (company.totals.acceptanceDone / company.totals.acceptanceTotal) *
            100,
        );
  const projectNameById = new Map(
    company.projects.map((summary) => [
      summary.project.id,
      summary.project.name,
    ]),
  );
  const maxRoleLoad = Math.max(
    1,
    ...company.roles.map((role) => role.activeTasks),
  );
  const configuredBudget = company.projects.reduce(
    (sum, summary) => sum + (summary.project.tokenBudget ?? 0),
    0,
  );
  const tokenUse =
    configuredBudget === 0
      ? `${company.totals.tokensUsed.toLocaleString()} tokens`
      : `${company.totals.tokensUsed.toLocaleString()} / ${configuredBudget.toLocaleString()}`;

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Owner Dashboard</div>
          <h1 className="studio-title">赛博公司</h1>
          <p className="studio-subtitle">
            老板视角：项目组合是否健康、哪里需要你拍板、产能花在哪。
            这里展示真实控制面数据；token 消耗来自 DSH 计量，金额成本等报价接入后再显示。
          </p>
        </div>
        <div className="studio-head-actions">
          {data.activeProjectId !== null ? (
            <button
              className="studio-btn"
              type="button"
              disabled={busy}
              onClick={() => onOpenProject(data.activeProjectId as string)}
            >
              <IconGrid width={14} height={14} />
              当前项目
            </button>
          ) : (
            <button
              className="studio-btn"
              data-variant="primary"
              type="button"
              onClick={onNewProject}
            >
              <IconPlus width={14} height={14} />
              新建项目
            </button>
          )}
        </div>
      </div>

      <OnboardingPanel
        data={data}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
      />

      <div className="studio-grid-stats">
        <StatCard
          label="项目"
          value={`${String(company.totals.activeProjects)}/${String(
            company.totals.projects,
          )}`}
          note="活跃 / 总数"
        />
        <StatCard
          label="未完成"
          value={String(company.totals.openTasks)}
          note={`${String(company.totals.inReview)} 个待验收`}
        />
        <StatCard
          label="需要你"
          value={String(company.needs.length)}
          note="决策 / 阻塞 / 老化"
          tone={company.needs.length > 0 ? "warn" : undefined}
        />
        <StatCard
          label="待合并"
          value={String(company.totals.mergePending)}
          note={`${String(company.totals.merged)} 个已合并`}
        />
        <StatCard
          label="验收完成率"
          value={`${String(acceptanceRate)}%`}
          note={`${String(company.totals.acceptanceDone)} / ${String(
            company.totals.acceptanceTotal,
          )} 条已勾选`}
          tone={acceptanceRate === 100 ? "ok" : undefined}
        />
      </div>

      <div className="studio-split">
        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconSpark width={14} height={14} />
            <h3>老板收件箱</h3>
            <span className="studio-muted">
              {company.needs.length === 0
                ? "没有需要你处理的事项"
                : `${String(company.needs.length)} 项`}
            </span>
          </div>
          <div className="studio-panel-body">
            {company.needs.length === 0 ? (
              <div className="studio-empty">
                <strong>没有需要你拍板的事</strong>
                所有任务和合并提案都在自动流转中。
              </div>
            ) : (
              <div className="studio-needs">
                {company.needs.slice(0, 8).map((need) => (
                  <button
                    key={need.id}
                    type="button"
                    className="studio-need"
                    onClick={() => onOpenNeed(need)}
                  >
                    <span
                      className="studio-need-mark"
                      data-tone={
                        need.severity === "critical"
                          ? "danger"
                          : need.severity === "warning"
                            ? "accent"
                            : "info"
                      }
                    />
                    <span>
                      <span className="studio-need-title">{need.title}</span>
                      <span className="studio-need-meta">
                        {need.projectName} · {need.detail}
                        {need.ageHours !== null
                          ? ` · ${String(need.ageHours)}h`
                          : ""}
                      </span>
                    </span>
                    <IconChevronRight
                      className="studio-need-arrow"
                      width={14}
                      height={14}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconUsers width={14} height={14} />
            <h3>现金与产能</h3>
            <span className="studio-muted">{company.roles.length} 个角色</span>
          </div>
          <div className="studio-panel-body">
            <div className="studio-company-placeholder">
              <div className="studio-section-label">token 消耗 / 预算</div>
              <strong>{tokenUse}</strong>
              <p>
                {configuredBudget === 0
                  ? "项目还没有配置 token 预算；消耗来自 DSH token meter。"
                  : `预算使用率 ${String(
                      Math.min(
                        100,
                        Math.round(
                          (company.totals.tokensUsed / configuredBudget) * 100,
                        ),
                      ),
                    )}%。`}
                {" "}
                {company.totals.runs} 次运行
                {company.totals.runningRuns > 0
                  ? `，${String(company.totals.runningRuns)} 个执行中`
                  : ""}
                。金额成本等报价接入后再显示。
              </p>
            </div>
            {company.roles.length === 0 ? (
              <div className="studio-empty" style={{ marginTop: 12 }}>
                <strong>还没有角色</strong>
                建一个 Lead、Builder 和 Verifier，任务才有负责人。
              </div>
            ) : (
              <div className="studio-role-load">
                {company.roles.slice(0, 6).map((role) => (
                  <RoleLoadRow
                    key={`${role.projectId}-${role.roleId}`}
                    role={role}
                    max={maxRoleLoad}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="studio-panel" style={{ marginBottom: 16 }}>
        <div className="studio-panel-head">
          <IconGrid width={14} height={14} />
          <h3>公司级组合</h3>
          <span className="studio-muted">预算 · 优先级 · 角色覆盖</span>
        </div>
        <div className="studio-panel-body studio-company-portfolio">
          <div className="studio-company-placeholder">
            <div className="studio-section-label">预算</div>
            <strong>
              {company.budget.totalBudget === null
                ? "未配置"
                : `${company.budget.totalSpent.toLocaleString()} / ${company.budget.totalBudget.toLocaleString()} tokens`}
            </strong>
            <p>
              {company.budget.overBudgetProjects > 0
                ? `${String(company.budget.overBudgetProjects)} 个项目超预算`
                : "没有项目超预算"}
              {" · "}
              {company.budget.unbudgetedProjects} 个未配置
            </p>
          </div>
          <div className="studio-company-placeholder">
            <div className="studio-section-label">跨项目优先级</div>
            {company.priorities.length === 0 ? (
              <p>没有未完成任务。</p>
            ) : (
              <div className="studio-priority-list">
                {company.priorities.slice(0, 6).map((item) => (
                  <button
                    key={item.taskId}
                    className="studio-priority-row"
                    type="button"
                    onClick={() => {
                      onOpenProject(item.projectId);
                    }}
                  >
                    <span className="studio-pill">{item.priority}</span>
                    <span>{item.title}</span>
                    <span className="studio-muted">
                      {item.projectName} · {item.ownerName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="studio-company-placeholder">
            <div className="studio-section-label">角色覆盖</div>
            {company.roleCoverage.length === 0 ? (
              <p>还没有角色。</p>
            ) : (
              <div className="studio-actions">
                {company.roleCoverage.map((role) => (
                  <span key={role.roleName} className="studio-pill">
                    {role.roleName} · {role.projects} 项目 /{" "}
                    {role.activeTasks} 活跃
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="studio-panel" style={{ marginBottom: 16 }}>
        <div className="studio-panel-head">
          <IconBuilding width={14} height={14} />
          <h3>项目组合</h3>
          <span className="studio-muted">
            {company.projects.length} 个项目 · 点击项目进入 Mission Control
          </span>
        </div>
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>健康</th>
                <th>任务</th>
                <th>验收</th>
                <th>合并</th>
                <th>角色</th>
                <th>最近活动</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {company.projects.map((summary) => (
                <ProjectRow
                  key={summary.project.id}
                  summary={summary}
                  onOpen={onOpenProject}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="studio-company-bottom">
        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconAlert width={14} height={14} />
            <h3>风险雷达</h3>
            <span className="studio-muted">需要结构化关注</span>
          </div>
          <div className="studio-panel-body">
            <div className="studio-risk-grid">
              <RiskItem label="停滞任务" value={company.risk.staleTasks} />
              <RiskItem label="老化合并" value={company.risk.agingMerges} />
              <RiskItem label="缺证据" value={company.risk.missingEvidence} />
              <RiskItem label="阻塞" value={company.risk.blocked} />
              <RiskItem label="无人负责" value={company.risk.unowned} />
            </div>
          </div>
        </section>

        <section className="studio-panel">
          <div className="studio-panel-head">
            <IconGitMerge width={14} height={14} />
            <h3>交付流</h3>
            <span className="studio-muted">跨项目最近事件</span>
          </div>
          <div className="studio-panel-body">
            {company.recentEvents.length === 0 ? (
              <div className="studio-faint" style={{ fontSize: 11 }}>
                还没有交付事件。
              </div>
            ) : (
              <div className="studio-events">
                {company.recentEvents.slice(0, 10).map((event) => (
                  <div key={event.id} className="studio-event">
                    <span className="studio-event-dot" />
                    <span>
                      <span className="studio-mono">{event.type}</span>
                      <span className="studio-faint">
                        {" "}
                        ·{" "}
                        {event.projectId === null
                          ? "公司"
                          : (projectNameById.get(event.projectId) ??
                            event.projectId)}
                      </span>
                    </span>
                    <span className="studio-event-time">
                      {formatDate(event.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function ProjectRow({
  summary,
  onOpen,
}: {
  summary: CompanyProjectSummary;
  onOpen: (projectId: string) => void;
}) {
  const { stats, project } = summary;
  return (
    <tr>
      <td>
        <div className="studio-table-project">{project.name}</div>
        {project.description !== "" ? (
          <div className="studio-table-sub">{project.description}</div>
        ) : null}
      </td>
      <td>
        <span className={`studio-health studio-health-${summary.health}`}>
          {COMPANY_HEALTH_LABELS[summary.health]}
        </span>
      </td>
      <td>
        {summary.openTasks}/{stats.total} 未完成
      </td>
      <td>
        {stats.acceptanceDone}/{stats.acceptanceTotal}
      </td>
      <td>
        待 {stats.mergeReview + stats.mergeApproved} · 已 {stats.mergeMerged}
      </td>
      <td>
        {summary.roleCount} 人
        {summary.activeRoleCount > 0
          ? ` · ${String(summary.activeRoleCount)} 在忙`
          : ""}
      </td>
      <td className="studio-table-time">
        {summary.lastActivityAt === null
          ? "无"
          : formatDate(summary.lastActivityAt)}
      </td>
      <td>
        <button
          type="button"
          className="studio-btn"
          data-size="sm"
          onClick={() => onOpen(project.id)}
        >
          打开
        </button>
      </td>
    </tr>
  );
}

function RoleLoadRow({
  role,
  max,
}: {
  role: RoleLoadSummary;
  max: number;
}) {
  const width =
    role.activeTasks === 0
      ? 0
      : Math.max(8, Math.round((role.activeTasks / max) * 100));
  return (
    <div className="studio-role-load-row">
      <div className="studio-role-load-head">
        <span>{role.roleName}</span>
        <span className="studio-faint">{role.projectName}</span>
        <span className="studio-role-load-state" data-state={role.state}>
          {ROLE_LOAD_LABELS[role.state]}
        </span>
        <strong>{role.activeTasks}</strong>
      </div>
      <div className="studio-role-load-track">
        <span style={{ width: `${String(width)}%` }} />
      </div>
    </div>
  );
}

function RiskItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="studio-risk-item" data-active={value > 0}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

