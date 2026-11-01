import type {
  CreateModuleInput,
  CreateRoleInput,
  Module,
  Role,
  UpdateModuleInput,
} from "../../shared/types.js";
import { newId, StudioStoreError, type StoreContext } from "./core.js";
import {
  optionalText,
  optionalTokenBudget,
  requiredText,
  textList,
} from "./inputs.js";
import { findProviderProfile, pickProject } from "./lookups.js";

export async function createModule(
  ctx: StoreContext,input: CreateModuleInput): Promise<Module> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const name = requiredText(input.name, "name", 120);
      if (
        state.modules.some(
          (module) =>
            module.projectId === project.id && module.name === name,
        )
      ) {
        throw new StudioStoreError(
          "module_exists",
          "同一项目下模块名不能重复",
          409,
        );
      }
      const at = ctx.now();
      const module: Module = {
        id: newId("module"),
        projectId: project.id,
        name,
        responsibility: optionalText(
          input.responsibility,
          "responsibility",
          2000,
        ),
        contractPath:
          optionalText(input.contractPath, "contractPath", 500) || null,
        contractText: optionalText(
          input.contractText,
          "contractText",
          8000,
        ),
        allowedPaths: textList(input.allowedPaths, "allowedPaths", 30),
        forbiddenPaths: textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30,
        ),
        dependsOn: textList(input.dependsOn, "dependsOn", 20),
        createdAt: at,
        updatedAt: at,
      };
      state.modules.push(module);
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "module.created",
        at,
        projectId: project.id,
        payload: { moduleId: module.id, name: module.name },
      });
      await ctx.save();
      return structuredClone(module);
    });
  }

export async function updateModule(
  ctx: StoreContext,
    moduleId: string,
    input: UpdateModuleInput,
  ): Promise<Module> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const module = state.modules.find((item) => item.id === moduleId);
      if (module === undefined) {
        throw new StudioStoreError("module_not_found", "模块不存在", 404);
      }
      if (input.responsibility !== undefined) {
        module.responsibility = optionalText(
          input.responsibility,
          "responsibility",
          2000,
        );
      }
      if (input.contractPath !== undefined) {
        module.contractPath =
          optionalText(input.contractPath, "contractPath", 500) || null;
      }
      if (input.contractText !== undefined) {
        module.contractText = optionalText(
          input.contractText,
          "contractText",
          8000,
        );
      }
      if (input.allowedPaths !== undefined) {
        module.allowedPaths = textList(
          input.allowedPaths,
          "allowedPaths",
          30,
        );
      }
      if (input.forbiddenPaths !== undefined) {
        module.forbiddenPaths = textList(
          input.forbiddenPaths,
          "forbiddenPaths",
          30,
        );
      }
      if (input.dependsOn !== undefined) {
        module.dependsOn = textList(input.dependsOn, "dependsOn", 20);
      }
      const at = ctx.now();
      module.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "module.updated",
        at,
        projectId: module.projectId,
        payload: { moduleId: module.id },
      });
      await ctx.save();
      return structuredClone(module);
    });
  }

export async function createRole(
  ctx: StoreContext,input: CreateRoleInput): Promise<Role> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const at = ctx.now();
      const providerProfileId =
        optionalText(input.providerProfileId, "providerProfileId", 120) ||
        null;
      if (providerProfileId !== null) {
        const profile = findProviderProfile(state, providerProfileId);
        if (profile.projectId !== project.id) {
          throw new StudioStoreError(
            "provider_profile_not_found",
            "Provider Profile 不属于当前项目",
            404,
          );
        }
      }
      const role: Role = {
        id: newId("role"),
        projectId: project.id,
        name: requiredText(input.name, "name", 60),
        title: optionalText(input.title, "title", 80),
        mission: optionalText(input.mission, "mission", 600),
        responsibilities: textList(input.responsibilities, "responsibilities"),
        nonGoals: textList(input.nonGoals, "nonGoals"),
        decisionRights: textList(input.decisionRights, "decisionRights"),
        providerProfileId,
        model: optionalText(input.model, "model", 120) || null,
        executor:
          input.executor === "claude-code" || input.executor === "codex"
            ? input.executor
            : "dsh",
        tokenBudget: optionalTokenBudget(input.tokenBudget, "tokenBudget"),
        dailyTokenBudget: optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget",
        ),
        createdAt: at,
        updatedAt: at,
      };
      state.roles.push(role);
      ctx.recordEvent(state, {
        type: "role.created",
        at,
        projectId: project.id,
        payload: { roleId: role.id, name: role.name },
      });
      state.updatedAt = at;
      await ctx.save();
      return structuredClone(role);
    });
  }

export async function updateRole(
  ctx: StoreContext,
    roleId: string,
    input: Partial<CreateRoleInput>,
  ): Promise<Role> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const role = state.roles.find((item) => item.id === roleId);
      if (role === undefined) {
        throw new StudioStoreError("role_not_found", "角色不存在", 404);
      }
      if (input.name !== undefined) {
        role.name = requiredText(input.name, "name", 60);
      }
      if (input.title !== undefined) {
        role.title = optionalText(input.title, "title", 80);
      }
      if (input.mission !== undefined) {
        role.mission = optionalText(input.mission, "mission", 600);
      }
      if (input.responsibilities !== undefined) {
        role.responsibilities = textList(
          input.responsibilities,
          "responsibilities",
        );
      }
      if (input.nonGoals !== undefined) {
        role.nonGoals = textList(input.nonGoals, "nonGoals");
      }
      if (input.decisionRights !== undefined) {
        role.decisionRights = textList(input.decisionRights, "decisionRights");
      }
      if (input.providerProfileId !== undefined) {
        const nextProfileId =
          optionalText(input.providerProfileId, "providerProfileId", 120) ||
          null;
        if (nextProfileId !== null) {
          const profile = findProviderProfile(state, nextProfileId);
          if (profile.projectId !== role.projectId) {
            throw new StudioStoreError(
              "provider_profile_not_found",
              "Provider Profile 不属于当前项目",
              404,
            );
          }
        }
        role.providerProfileId = nextProfileId;
      }
      if (input.model !== undefined) {
        role.model = optionalText(input.model, "model", 120) || null;
      }
      if (input.executor !== undefined) {
        role.executor =
          input.executor === "claude-code" || input.executor === "codex"
            ? input.executor
            : "dsh";
      }
      if (input.tokenBudget !== undefined) {
        role.tokenBudget = optionalTokenBudget(input.tokenBudget, "tokenBudget");
      }
      if (input.dailyTokenBudget !== undefined) {
        role.dailyTokenBudget = optionalTokenBudget(
          input.dailyTokenBudget,
          "dailyTokenBudget",
        );
      }
      role.updatedAt = ctx.now();
      state.updatedAt = role.updatedAt;
      ctx.recordEvent(state, {
        type: "role.updated",
        at: role.updatedAt,
        projectId: role.projectId,
        payload: { roleId: role.id },
      });
      await ctx.save();
      return structuredClone(role);
    });
  }

