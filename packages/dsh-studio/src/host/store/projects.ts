import { existsSync } from "node:fs";
import path from "node:path";

import { nextProjectStage } from "../../shared/types.js";
import type {
  ApproveStageGateInput,
  CreateProjectFromTemplateInput,
  CreateProjectInput,
  Project,
  ProjectStage,
  Role,
  StageArtifact,
  StageCheckItem,
  StageGate,
  UpdateProjectInput,
  UpdateStageGateInput,
} from "../../shared/types.js";
import { newId, StudioStoreError, type StoreContext } from "./core.js";
import { assertFreezeCurrent } from "./freezes.js";
import {
  defaultStageChecklist,
  defaultTriggerRules,
  normalizeStageArtifacts,
  normalizeStageChecklist,
  optionalText,
  optionalTokenBudget,
  requiredText,
} from "./inputs.js";
import { findProject, findStageGate, pickProject } from "./lookups.js";
import { projectTemplates } from "./templates.js";

export async function createProject(
  ctx: StoreContext,input: CreateProjectInput): Promise<Project> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const at = ctx.now();
      const project: Project = {
        id: newId("proj"),
        name: requiredText(input.name, "name", 80),
        description: optionalText(input.description, "description", 600),
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        repoPath: optionalText(input.repoPath, "repoPath", 1000) || null,
        prdPath: null,
        invariantsPath: null,
        modulesPath: null,
        triggerRules: defaultTriggerRules(),
        stage: "discovery",
        createdAt: at,
        updatedAt: at,
      };
      state.projects.push(project);
      state.activeProjectId = project.id;
      ctx.recordEvent(state, {
        type: "project.created",
        at,
        projectId: project.id,
        payload: { name: project.name },
      });
      state.updatedAt = at;
      await ctx.save();
      return structuredClone(project);
    });
  }

export async function createProjectFromTemplate(
  ctx: StoreContext,
    input: CreateProjectFromTemplateInput,
  ): Promise<Project> {
    const template = projectTemplates[input.template];
    if (template === undefined) {
      throw new StudioStoreError(
        "invalid_input",
        "未知的项目模板",
      );
    }
    const project = await ctx.createProject({
      name: input.name,
      description: input.description,
      repoPath: input.repoPath,
    });
    const roles = new Map<string, Role>();
    for (const spec of template.roles) {
      const role = await ctx.createRole({
        name: spec.name,
        title: spec.title,
        mission: spec.mission,
        responsibilities: spec.responsibilities,
        decisionRights: spec.decisionRights,
      });
      roles.set(spec.name, role);
    }
    for (const spec of template.tasks) {
      const owner = roles.get(spec.owner);
      const reviewer = roles.get(spec.reviewer);
      await ctx.createTask({
        title: spec.title,
        goal: spec.goal,
        priority: spec.priority,
        ownerRoleId: owner?.id ?? null,
        reviewerRoleId: reviewer?.id ?? null,
        acceptance: spec.acceptance,
      });
    }
    return project;
  }

function normalizeDocPath(
  value: string,
  root: string | null,
  previousRoot: string | null,
  allowDrop: boolean,
): string | null {
  if (value.trim() === "") return null;
  if (root === null) {
    if (path.isAbsolute(value)) {
      throw new StudioStoreError(
        "repo_required",
        "绑定仓库前只能保存相对文档路径",
        409,
      );
    }
    return value.replaceAll("\\", "/");
  }
  if (!path.isAbsolute(value)) {
    const target = path.resolve(root, value);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new StudioStoreError(
        "doc_path_outside_repo",
        "文档路径必须位于仓库内",
        400,
      );
    }
    return value.replaceAll("\\", "/");
  }
  for (const candidate of [root, previousRoot]) {
    if (candidate === null) continue;
    const base = path.resolve(candidate);
    const target = path.resolve(value);
    if (target === base || target.startsWith(`${base}${path.sep}`)) {
      return path.relative(base, target).replaceAll("\\", "/");
    }
  }
  if (allowDrop) return null;
  throw new StudioStoreError(
    "doc_path_outside_repo",
    "绝对路径不属于当前或旧仓库，请改成仓库内相对路径",
    400,
  );
}

export async function updateProject(
  ctx: StoreContext,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      const previousRepo = project.repoPath;
      if (input.repoPath !== undefined) {
        project.repoPath =
          optionalText(input.repoPath, "repoPath", 1000) || null;
      }
      if (previousRepo !== project.repoPath) {
        project.prdPath = project.prdPath === null
          ? null
          : normalizeDocPath(project.prdPath, project.repoPath, previousRepo, true);
        project.invariantsPath = project.invariantsPath === null
          ? null
          : normalizeDocPath(
              project.invariantsPath,
              project.repoPath,
              previousRepo,
              true,
            );
        project.modulesPath = project.modulesPath === null
          ? null
          : normalizeDocPath(
              project.modulesPath,
              project.repoPath,
              previousRepo,
              true,
            );
      }
      if (input.prdPath !== undefined) {
        project.prdPath = normalizeDocPath(
          optionalText(input.prdPath, "prdPath", 500) || "",
          project.repoPath,
          previousRepo,
          false,
        );
      }
      if (input.invariantsPath !== undefined) {
        project.invariantsPath = normalizeDocPath(
          optionalText(input.invariantsPath, "invariantsPath", 500) || "",
          project.repoPath,
          previousRepo,
          false,
        );
      }
      if (input.modulesPath !== undefined) {
        project.modulesPath = normalizeDocPath(
          optionalText(input.modulesPath, "modulesPath", 500) || "",
          project.repoPath,
          previousRepo,
          false,
        );
      }
      const at = ctx.now();
      project.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "project.updated",
        at,
        projectId: project.id,
        payload: { repoPath: project.repoPath },
      });
      await ctx.save();
      return structuredClone(project);
    });
  }

export async function getStageGate(
  ctx: StoreContext,
    projectId: string,
    stage: ProjectStage,
  ): Promise<StageGate> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = findProject(state, projectId);
      const next = nextProjectStage(project.stage);
      if (next === null) {
        throw new StudioStoreError(
          "stage_complete",
          "项目已经进入持续开发，没有下一阶段门禁",
          409,
        );
      }
      if (stage !== next) {
        throw new StudioStoreError(
          "stage_gate_out_of_order",
          `下一阶段是 ${next}，不能创建 ${stage} 门禁`,
          409,
        );
      }
      let gate = state.stageGates.find(
        (item) => item.projectId === projectId && item.stage === stage,
      );
      if (gate === undefined) {
        const at = ctx.now();
        gate = {
          id: newId("gate"),
          projectId,
          stage,
          status: "pending",
          checklist: defaultStageChecklist(stage),
          artifacts: [],
          note: "",
          decisionId: null,
          freezeId: null,
          approvedBy: "",
          approvedAt: null,
          waiverReason: null,
          createdAt: at,
          updatedAt: at,
        };
        state.stageGates.push(gate);
        state.updatedAt = at;
        await ctx.save();
      }
      return structuredClone(gate);
    });
  }

export async function updateStageGate(
  ctx: StoreContext,
    projectId: string,
    stage: ProjectStage,
    input: UpdateStageGateInput,
  ): Promise<StageGate> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = findProject(state, projectId);
      const gate = findStageGate(state, project, stage);
      if (gate.status === "approved") {
        throw new StudioStoreError(
          "stage_gate_locked",
          "阶段门禁已经批准，不能再修改",
          409,
        );
      }
      if (input.checklist !== undefined) {
        gate.checklist = normalizeStageChecklist(input.checklist);
      }
      if (input.artifacts !== undefined) {
        gate.artifacts = normalizeStageArtifacts(input.artifacts);
      }
      if (input.note !== undefined) {
        gate.note = optionalText(input.note, "note", 4000);
      }
      gate.status = "pending";
      gate.approvedBy = "";
      gate.approvedAt = null;
      gate.waiverReason = null;
      gate.updatedAt = ctx.now();
      state.updatedAt = gate.updatedAt;
      await ctx.save();
      return structuredClone(gate);
    });
  }

export async function approveStageGate(
  ctx: StoreContext,
    projectId: string,
    stage: ProjectStage,
    input: ApproveStageGateInput = {},
  ): Promise<StageGate> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = findProject(state, projectId);
      const gate = findStageGate(state, project, stage);
      if (gate.status === "approved") {
        throw new StudioStoreError(
          "stage_gate_locked",
          "阶段门禁已经批准",
          409,
        );
      }
      if (input.checklist !== undefined) {
        gate.checklist = normalizeStageChecklist(input.checklist);
      }
      if (input.artifacts !== undefined) {
        gate.artifacts = normalizeStageArtifacts(input.artifacts);
      }
      if (input.note !== undefined) {
        gate.note = optionalText(input.note, "note", 4000);
      }
      const waiverReason = optionalText(
        input.waiverReason,
        "waiverReason",
        1000,
      );
      const freeze =
        project.repoPath === null || !existsSync(project.repoPath)
          ? null
          : stage === "architecture"
            ? await assertFreezeCurrent(ctx, projectId, "prd")
            : stage === "development"
              ? await assertFreezeCurrent(ctx, projectId, "architecture")
              : null;
      const missingDemo =
        stage === "development" &&
        !gate.artifacts.some((artifact) => artifact.kind === "demo") &&
        !state.prototypeDemos.some(
          (demo) =>
            demo.projectId === projectId && demo.result === "passed",
        );
      const incomplete =
        gate.checklist.length === 0 ||
        gate.checklist.some((item) => !item.done) ||
        gate.artifacts.length === 0;
      if ((incomplete || missingDemo) && waiverReason === "") {
        if (missingDemo && !incomplete) {
          throw new StudioStoreError(
            "prototype_demo_required",
            "进入持续开发前必须登记一个 demo 产物（路径或 URL），或填写 Owner 豁免理由",
            409,
          );
        }
        throw new StudioStoreError(
          "stage_gate_not_ready",
          "阶段门禁未完成：请完成所有检查项并至少登记一个产物，或填写 Owner 豁免理由",
          409,
        );
      }
      const at = ctx.now();
      gate.status = "approved";
      gate.approvedBy = "Owner";
      gate.approvedAt = at;
      gate.waiverReason =
        (incomplete || missingDemo) && waiverReason !== ""
          ? waiverReason
          : null;
      gate.freezeId = freeze?.id ?? null;
      gate.updatedAt = at;
      project.stage = stage;
      project.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "stage.approved",
        at,
        projectId,
        payload: {
          stage,
          waiver: gate.waiverReason !== null,
        },
      });
      await ctx.save();
      return structuredClone(gate);
    });
  }

export async function rejectStageGate(
  ctx: StoreContext,
    projectId: string,
    stage: ProjectStage,
    note: string,
  ): Promise<StageGate> {
    return ctx.runExclusive(async () => {
      if (note.trim() === "") {
        throw new StudioStoreError(
          "decision_reason_required",
          "拒绝阶段门禁必须写明理由",
          400,
        );
      }
      const reason = requiredText(note, "note", 4000);
      const state = ctx.requireState();
      const project = findProject(state, projectId);
      const gate = findStageGate(state, project, stage);
      if (gate.status === "approved") {
        throw new StudioStoreError(
          "stage_gate_locked",
          "阶段门禁已经批准，不能再拒绝",
          409,
        );
      }
      const at = ctx.now();
      gate.status = "rejected";
      gate.note = reason;
      gate.approvedBy = "";
      gate.approvedAt = null;
      gate.waiverReason = null;
      gate.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "stage.rejected",
        at,
        projectId,
        payload: { stage, note: reason },
      });
      await ctx.save();
      return structuredClone(gate);
    });
  }

export async function selectProject(
  ctx: StoreContext,projectId: string): Promise<Project> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      state.activeProjectId = project.id;
      state.updatedAt = ctx.now();
      await ctx.save();
      return structuredClone(project);
    });
  }

