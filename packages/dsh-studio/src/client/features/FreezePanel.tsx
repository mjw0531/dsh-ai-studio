import { useState } from "react";
import type { FormEvent } from "react";

import type {
  CreateProjectFreezeInput,
  CreateRequirementDecisionInput,
  FreezeKind,
  Project,
  ProjectFreeze,
  RequirementDecision,
  StageCheckItem,
} from "../../shared/types.js";
import { formatDate } from "../lib/format.js";

const PRD_CHECKS = [
  "核心循环/状态转换已定义",
  "首切片范围与非目标已写",
  "每条需求有可观察的验收口径",
  "领域模型已登记并可定位",
  "未决问题都有 Owner 和期限",
  "需求 ID 可追溯到模块/任务",
];

const ARCH_CHECKS = [
  "模块边界与依赖方向已写",
  "失败模式与恢复策略已写",
  "测试策略与验收命令已定义",
  "首个垂直切片的风险已列出",
  "架构文档与 ADR 已登记",
];

function checks(kind: FreezeKind): StageCheckItem[] {
  return (kind === "prd" ? PRD_CHECKS : ARCH_CHECKS).map((text, index) => ({
    id: `draft-${String(index)}`,
    text,
    done: false,
  }));
}

export function FreezePanel({
  project,
  freezes,
  decisions,
  busy,
  onCreateFreeze,
  onCreateDecision,
}: {
  project: Project;
  freezes: ProjectFreeze[];
  decisions: RequirementDecision[];
  busy: boolean;
  onCreateFreeze: (input: CreateProjectFreezeInput) => Promise<boolean>;
  onCreateDecision: (input: CreateRequirementDecisionInput) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<FreezeKind>("prd");
  const [version, setVersion] = useState("v1");
  const [docPath, setDocPath] = useState(project.prdPath ?? "docs/PRD.md");
  const [domainModelPath, setDomainModelPath] = useState(
    project.modulesPath ?? "docs/DOMAIN_MODEL.md",
  );
  const [summary, setSummary] = useState("");
  const [openQuestions, setOpenQuestions] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  const [checklist, setChecklist] = useState<StageCheckItem[]>(checks("prd"));
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("AI");
  const [recommendation, setRecommendation] = useState("");
  const [status, setStatus] = useState<"accepted" | "rejected" | "pending">(
    "pending",
  );

  const changeKind = (next: FreezeKind): void => {
    setKind(next);
    setChecklist(checks(next));
    setDocPath(
      next === "prd"
        ? (project.prdPath ?? "docs/PRD.md")
        : "docs/ARCHITECTURE.md",
    );
  };

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const ok = await onCreateFreeze({
      kind,
      version: version.trim(),
      docPath: docPath.trim(),
      domainModelPath:
        kind === "prd" ? domainModelPath.trim() || null : null,
      summary: summary.trim(),
      openQuestions: openQuestions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      checklist,
      waiverReason: waiverReason.trim() || null,
    });
    if (!ok) setError("冻结失败，检查版本、路径、检查项和仓库绑定");
  };

  const decide = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (title.trim() === "" || recommendation.trim() === "") {
      setError("需求决策必须填写标题和建议");
      return;
    }
    const ok = await onCreateDecision({
      title: title.trim(),
      source: source.trim() || "AI",
      recommendation: recommendation.trim(),
      status,
      rationale: "",
      freezeId: freezes.find((item) => item.kind === "prd")?.id ?? null,
    });
    if (ok) {
      setTitle("");
      setRecommendation("");
    }
  };

  return (
    <section className="studio-panel">
      <div className="studio-panel-head">
        <h3>PRD / 架构冻结</h3>
        <span className="studio-muted">
          只有 Owner 主动冻结；冻结后修改必须出新版本
        </span>
      </div>
      <div className="studio-panel-body">
        <div className="studio-freeze-list">
          {freezes.length === 0 ? (
            <p className="studio-faint">还没有冻结版本。</p>
          ) : (
            freezes.map((freeze) => (
              <div className="studio-freeze-row" key={freeze.id}>
                <span className="studio-pill" data-tone="accent">
                  {freeze.kind === "prd" ? "PRD" : "架构"} {freeze.version}
                </span>
                <code>{freeze.docPath}</code>
                <span className="studio-faint">
                  {freeze.docHash.slice(0, 12)} · {formatDate(freeze.frozenAt)}
                </span>
              </div>
            ))
          )}
        </div>

        <form className="studio-form" onSubmit={(event) => void create(event)}>
          <div className="studio-field-row">
            <div className="studio-field">
              <label htmlFor="freeze-kind">冻结类型</label>
              <select
                id="freeze-kind"
                value={kind}
                onChange={(event) =>
                  changeKind(event.target.value as FreezeKind)
                }
              >
                <option value="prd">PRD</option>
                <option value="architecture">架构</option>
              </select>
            </div>
            <div className="studio-field">
              <label htmlFor="freeze-version">版本</label>
              <input
                id="freeze-version"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="v1"
              />
            </div>
          </div>
          <div className="studio-field">
            <label htmlFor="freeze-doc">文档路径（仓库内）</label>
            <input
              id="freeze-doc"
              value={docPath}
              onChange={(event) => setDocPath(event.target.value)}
            />
          </div>
          {kind === "prd" ? (
            <div className="studio-field">
              <label htmlFor="freeze-domain">领域模型路径（仓库内）</label>
              <input
                id="freeze-domain"
                value={domainModelPath}
                onChange={(event) => setDomainModelPath(event.target.value)}
              />
            </div>
          ) : null}
          <div className="studio-field">
            <label>冻结检查项</label>
            {checklist.map((item) => (
              <label key={item.id} className="studio-check">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(event) =>
                    setChecklist((current) =>
                      current.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, done: event.target.checked }
                          : entry,
                      ),
                    )
                  }
                />
                {item.text}
              </label>
            ))}
          </div>
          <div className="studio-field">
            <label htmlFor="freeze-open">未决问题（每行一条）</label>
            <textarea
              id="freeze-open"
              value={openQuestions}
              onChange={(event) => setOpenQuestions(event.target.value)}
            />
          </div>
          <div className="studio-field">
            <label htmlFor="freeze-summary">版本摘要</label>
            <input
              id="freeze-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
          <div className="studio-field">
            <label htmlFor="freeze-waiver">豁免理由（检查项未全勾时必填）</label>
            <input
              id="freeze-waiver"
              value={waiverReason}
              onChange={(event) => setWaiverReason(event.target.value)}
            />
          </div>
          {error !== null ? <div className="studio-alert">{error}</div> : null}
          <button className="studio-btn studio-btn-primary" disabled={busy}>
            冻结 {kind === "prd" ? "PRD" : "架构"} {version}
          </button>
        </form>

        <div className="studio-section-label">需求决策记录</div>
        <div className="studio-freeze-list">
          {decisions.map((decision) => (
            <div className="studio-freeze-row" key={decision.id}>
              <span className="studio-pill" data-tone="accent">
                {decision.status}
              </span>
              <span>{decision.title}</span>
              <span className="studio-faint">
                {decision.source} · {decision.recommendation.slice(0, 80)}
              </span>
            </div>
          ))}
        </div>
        <form className="studio-form" onSubmit={(event) => void decide(event)}>
          <div className="studio-field">
            <label htmlFor="rdec-title">建议标题</label>
            <input
              id="rdec-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="studio-field-row">
            <div className="studio-field">
              <label htmlFor="rdec-source">来源</label>
              <input
                id="rdec-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
            </div>
            <div className="studio-field">
              <label htmlFor="rdec-status">结论</label>
              <select
                id="rdec-status"
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as "accepted" | "rejected" | "pending",
                  )
                }
              >
                <option value="pending">pending</option>
                <option value="accepted">accepted</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
          </div>
          <div className="studio-field">
            <label htmlFor="rdec-text">建议内容</label>
            <textarea
              id="rdec-text"
              value={recommendation}
              onChange={(event) => setRecommendation(event.target.value)}
            />
          </div>
          <button className="studio-btn" disabled={busy}>
            记录需求决策
          </button>
        </form>
      </div>
    </section>
  );
}
