export interface ErrorGuide {
  code: string;
  message: string;
  action: string;
}

const GUIDES: Record<string, string> = {
  unauthorized: "重新加载页面；访问令牌可能已过期。",
  repo_required: "到「设置 → 代码仓库」绑定仓库后再试。",
  project_required: "先创建或选择一个项目。",
  stage_not_dispatchable: "先完成阶段门禁，再派单。",
  owner_required: "给任务指定负责人角色后再派单。",
  dependency_not_done: "先完成前置任务，再派单。",
  verification_required: "先在任务里运行 Host 验证，通过后再完成。",
  review_required: "先让验收角色完成独立评审。",
  acceptance_incomplete: "在任务抽屉里勾完所有验收项。",
  evidence_required: "至少补一条可复现的验证证据。",
  docs_not_synced: "同步 PRD / INVARIANTS / MODULES 后再完成。",
  doc_dirty: "先提交或还原目标文档，再发布。",
  doc_required: "先在知识库绑定文档路径。",
  dependency_cycle: "调整前置任务，去掉循环依赖。",
  milestone_not_found: "刷新页面，重新选择里程碑。",
  git_auth: "检查仓库的 git user.name / user.email 配置。",
  git_failed: "检查仓库工作区是否干净，再重试。",
  network_failed: "检查 DSH 是否仍在运行，然后重试。",
  timeout: "操作超时；稍后重试，或缩小任务范围。",
};

export function guideError(code: string, message: string): ErrorGuide {
  return {
    code,
    message,
    action: GUIDES[code] ?? "检查设置后重试；如果持续失败，重启 DSH。",
  };
}

export function fallbackGuide(message: string): ErrorGuide {
  return {
    code: "unknown",
    message,
    action: "检查网络和 DSH 服务后重试。",
  };
}
