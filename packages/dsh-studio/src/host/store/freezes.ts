import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
  CreateFreezeChangeRequestInput,
  CreateProjectFreezeInput,
  CreateRequirementDecisionInput,
  FreezeChangeRequest,
  FreezeKind,
  ProjectFreeze,
  RequirementDecision,
  StageCheckItem,
  StudioState,
} from "../../shared/types.js";
import { StudioStoreError, newId, type StoreContext } from "./core.js";
import { requiredText, textList } from "./inputs.js";
import { findProject } from "./lookups.js";

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

function defaultChecklist(kind: FreezeKind): StageCheckItem[] {
  return (kind === "prd" ? PRD_CHECKS : ARCH_CHECKS).map((text) => ({
    id: newId("check"),
    text,
    done: false,
  }));
}

function resolveInside(repoPath: string, relative: string): string {
  const root = path.resolve(repoPath);
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new StudioStoreError(
      "freeze_path_outside_repo",
      "冻结文档必须位于项目仓库内",
      400,
    );
  }
  return target;
}

async function hashFile(file: string): Promise<string> {
  const info = await stat(file).catch(() => null);
  if (info === null || !info.isFile()) {
    throw new StudioStoreError(
      "freeze_doc_missing",
      `冻结文档不存在：${file}`,
      404,
    );
  }
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export function latestFreeze(
  state: StudioState,
  projectId: string,
  kind: FreezeKind,
): ProjectFreeze | null {
  return (
    [...state.freezes]
      .filter(
        (freeze) => freeze.projectId === projectId && freeze.kind === kind,
      )
      .sort((left, right) => right.frozenAt.localeCompare(left.frozenAt))[0] ??
    null
  );
}

export async function createFreeze(
  ctx: StoreContext,
  projectId: string,
  input: CreateProjectFreezeInput,
): Promise<ProjectFreeze> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const project = findProject(state, projectId);
    if (project.repoPath === null) {
      throw new StudioStoreError(
        "repo_required",
        "冻结 PRD/架构前必须先绑定项目仓库",
        409,
      );
    }
    if (!/^v[0-9]+(?:\.[0-9]+)*$/.test(input.version)) {
      throw new StudioStoreError(
        "invalid_version",
        "冻结版本号必须形如 v1 或 v1.1",
        400,
      );
    }
    const kind = input.kind;
    if (kind !== "prd" && kind !== "architecture") {
      throw new StudioStoreError("invalid_kind", "冻结类型无效", 400);
    }
    if (
      state.freezes.some(
        (freeze) =>
          freeze.projectId === projectId &&
          freeze.kind === kind &&
          freeze.version === input.version,
      )
    ) {
      throw new StudioStoreError(
        "freeze_version_exists",
        `版本 ${input.version} 已冻结`,
        409,
      );
    }
    const docPath = requiredText(input.docPath, "docPath", 1000);
    const absolute = resolveInside(project.repoPath, docPath);
    const docHash = await hashFile(absolute);
    const domainModelPath =
      input.domainModelPath === null || input.domainModelPath === undefined
        ? null
        : requiredText(input.domainModelPath, "domainModelPath", 1000);
    if (kind === "prd" && domainModelPath === null) {
      throw new StudioStoreError(
        "domain_model_required",
        "冻结 PRD 前必须登记领域模型路径",
        400,
      );
    }
    if (domainModelPath !== null) {
      await hashFile(resolveInside(project.repoPath, domainModelPath));
    }
    const checklist =
      input.checklist === undefined
        ? defaultChecklist(kind)
        : input.checklist.map((item) => ({
            ...item,
            text: requiredText(item.text, "checklist.text", 500),
          }));
    const waiverReason =
      input.waiverReason === null || input.waiverReason === undefined
        ? null
        : requiredText(input.waiverReason, "waiverReason", 1000);
    if (checklist.length === 0 || checklist.some((item) => !item.done)) {
      if (waiverReason === null) {
        throw new StudioStoreError(
          "freeze_checklist_incomplete",
          "冻结前必须完成检查项，或填写 Owner 豁免理由",
          409,
        );
      }
    }
    const at = ctx.now();
    const freeze: ProjectFreeze = {
      id: newId("freeze"),
      projectId,
      kind,
      version: input.version,
      docPath,
      docHash,
      domainModelPath,
      summary: input.summary?.trim() ?? "",
      openQuestions: textList(input.openQuestions, "openQuestions", 30),
      checklist,
      waiverReason,
      frozenBy: "Owner",
      frozenAt: at,
    };
    state.freezes.push(freeze);
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "freeze.created",
      at,
      projectId,
      payload: {
        freezeId: freeze.id,
        kind,
        version: freeze.version,
        docHash: freeze.docHash,
        waiver: waiverReason !== null,
      },
    });
    await ctx.save();
    return structuredClone(freeze);
  });
}

export async function assertFreezeCurrent(
  ctx: StoreContext,
  projectId: string,
  kind: FreezeKind,
): Promise<ProjectFreeze> {
  const state = ctx.requireState();
  const project = findProject(state, projectId);
  if (project.repoPath === null) {
    throw new StudioStoreError(
      "repo_required",
      "项目还没有绑定代码仓库，不能校验冻结版本",
      409,
    );
  }
  const freeze = latestFreeze(state, projectId, kind);
  if (freeze === null) {
    throw new StudioStoreError(
      "freeze_required",
      kind === "prd"
        ? "进入架构设计前必须先冻结 PRD"
        : "进入开发前必须先冻结架构",
      409,
    );
  }
  const current = await hashFile(
    resolveInside(project.repoPath, freeze.docPath),
  );
  if (current !== freeze.docHash) {
    throw new StudioStoreError(
      "freeze_drift",
      `${kind === "prd" ? "PRD" : "架构"}文件在冻结后被修改；请创建新版本或变更单`,
      409,
    );
  }
  return freeze;
}

export function listFreezes(
  state: StudioState,
  projectId: string,
): ProjectFreeze[] {
  return state.freezes
    .filter((freeze) => freeze.projectId === projectId)
    .map((freeze) => structuredClone(freeze));
}

export function listRequirementDecisions(
  state: StudioState,
  projectId: string,
): RequirementDecision[] {
  return state.requirementDecisions
    .filter((decision) => decision.projectId === projectId)
    .map((decision) => structuredClone(decision));
}

export async function createRequirementDecision(
  ctx: StoreContext,
  projectId: string,
  input: CreateRequirementDecisionInput,
): Promise<RequirementDecision> {
  const state = ctx.requireState();
  findProject(state, projectId);
  const at = ctx.now();
  const status = input.status ?? "pending";
  if (status !== "accepted" && status !== "rejected" && status !== "pending") {
    throw new StudioStoreError("invalid_status", "需求决策状态无效", 400);
  }
  const decision: RequirementDecision = {
    id: newId("rdec"),
    projectId,
    freezeId: input.freezeId ?? null,
    title: requiredText(input.title, "title", 200),
    source: requiredText(input.source, "source", 120),
    recommendation: requiredText(
      input.recommendation,
      "recommendation",
      4000,
    ),
    status,
    rationale: input.rationale?.trim() ?? "",
    createdAt: at,
    decidedAt: status === "pending" ? null : at,
  };
  state.requirementDecisions.push(decision);
  state.updatedAt = at;
  ctx.recordEvent(state, {
    type: "requirement.decided",
    at,
    projectId,
    payload: { decisionId: decision.id, status, source: decision.source },
  });
  await ctx.save();
  return structuredClone(decision);
}

export async function createFreezeChangeRequest(
  ctx: StoreContext,
  projectId: string,
  input: CreateFreezeChangeRequestInput,
): Promise<FreezeChangeRequest> {
  const state = ctx.requireState();
  findProject(state, projectId);
  const freeze = state.freezes.find(
    (item) => item.id === input.freezeId && item.projectId === projectId,
  );
  if (freeze === undefined) {
    throw new StudioStoreError("freeze_not_found", "冻结版本不存在", 404);
  }
  const at = ctx.now();
  const request: FreezeChangeRequest = {
    id: newId("fcr"),
    projectId,
    freezeId: freeze.id,
    title: requiredText(input.title, "title", 200),
    reason: requiredText(input.reason, "reason", 4000),
    impact: input.impact?.trim() ?? "",
    status: "pending",
    createdAt: at,
    decidedAt: null,
  };
  state.freezeChangeRequests.push(request);
  state.updatedAt = at;
  ctx.recordEvent(state, {
    type: "freeze.change_requested",
    at,
    projectId,
    payload: { requestId: request.id, freezeId: freeze.id, version: freeze.version },
  });
  await ctx.save();
  return structuredClone(request);
}

export async function decideFreezeChangeRequest(
  ctx: StoreContext,
  projectId: string,
  requestId: string,
  status: "accepted" | "rejected",
): Promise<FreezeChangeRequest> {
  const state = ctx.requireState();
  findProject(state, projectId);
  const request = state.freezeChangeRequests.find(
    (item) => item.id === requestId && item.projectId === projectId,
  );
  if (request === undefined) {
    throw new StudioStoreError("change_request_not_found", "变更单不存在", 404);
  }
  if (request.status !== "pending") {
    throw new StudioStoreError(
      "change_request_decided",
      "变更单已经处理",
      409,
    );
  }
  request.status = status;
  request.decidedAt = ctx.now();
  state.updatedAt = request.decidedAt;
  ctx.recordEvent(state, {
    type: "freeze.change_decided",
    at: request.decidedAt,
    projectId,
    payload: { requestId: request.id, status },
  });
  await ctx.save();
  return structuredClone(request);
}

export function listFreezeChangeRequests(
  state: StudioState,
  projectId: string,
): FreezeChangeRequest[] {
  return state.freezeChangeRequests
    .filter((request) => request.projectId === projectId)
    .map((request) => structuredClone(request));
}
