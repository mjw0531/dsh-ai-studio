import type {
  CreateProviderProfileInput,
  ProviderProfile,
  UpdateProviderProfileInput,
} from "../../shared/types.js";
import { StudioStoreError, newId, type StoreContext } from "./core.js";
import { optionalText, requiredText } from "./inputs.js";
import { findProviderProfile, pickProject } from "./lookups.js";

export async function createProviderProfile(
  ctx: StoreContext,
  input: CreateProviderProfileInput,
): Promise<ProviderProfile> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const project = pickProject(state, undefined);
    if (project === null) {
      throw new StudioStoreError("project_required", "请先创建一个项目");
    }
    const at = ctx.now();
    const profile: ProviderProfile = {
      id: newId("provider"),
      projectId: project.id,
      name: requiredText(input.name, "name", 80),
      executor:
        input.executor === "claude-code" || input.executor === "codex"
          ? input.executor
          : "dsh",
      provider: optionalText(input.provider, "provider", 120),
      model: optionalText(input.model, "model", 160),
      note: optionalText(input.note, "note", 500),
      createdAt: at,
      updatedAt: at,
    };
    state.providerProfiles.push(profile);
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "provider.created",
      at,
      projectId: project.id,
      payload: { profileId: profile.id, name: profile.name },
    });
    await ctx.save();
    return structuredClone(profile);
  });
}

export async function updateProviderProfile(
  ctx: StoreContext,
  profileId: string,
  input: UpdateProviderProfileInput,
): Promise<ProviderProfile> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const profile = findProviderProfile(state, profileId);
    if (input.name !== undefined) {
      profile.name = requiredText(input.name, "name", 80);
    }
    if (input.executor !== undefined) {
      profile.executor =
        input.executor === "claude-code" || input.executor === "codex"
          ? input.executor
          : "dsh";
    }
    if (input.provider !== undefined) {
      profile.provider = optionalText(input.provider, "provider", 120);
    }
    if (input.model !== undefined) {
      profile.model = optionalText(input.model, "model", 160);
    }
    if (input.note !== undefined) {
      profile.note = optionalText(input.note, "note", 500);
    }
    profile.updatedAt = ctx.now();
    state.updatedAt = profile.updatedAt;
    await ctx.save();
    return structuredClone(profile);
  });
}

export async function deleteProviderProfile(
  ctx: StoreContext,
  profileId: string,
): Promise<void> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const profile = findProviderProfile(state, profileId);
    if (state.roles.some((role) => role.providerProfileId === profileId)) {
      throw new StudioStoreError(
        "provider_profile_in_use",
        "还有角色在使用这个 Provider Profile，不能删除",
        409,
      );
    }
    state.providerProfiles = state.providerProfiles.filter(
      (item) => item.id !== profile.id,
    );
    state.updatedAt = ctx.now();
    await ctx.save();
  });
}

export async function reassignProviderProfile(
  ctx: StoreContext,
  fromProfileId: string,
  toProfileId: string,
): Promise<{
  fromProfileId: string;
  toProfileId: string;
  movedRoleIds: string[];
}> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    if (fromProfileId === toProfileId) {
      throw new StudioStoreError(
        "invalid_input",
        "备用 Profile 不能是当前 Profile",
        400,
      );
    }
    const from = findProviderProfile(state, fromProfileId);
    const to = findProviderProfile(state, toProfileId);
    if (from.projectId !== to.projectId) {
      throw new StudioStoreError(
        "invalid_input",
        "备用 Profile 必须属于同一项目",
        400,
      );
    }
    const at = ctx.now();
    const movedRoleIds: string[] = [];
    for (const role of state.roles) {
      if (
        role.projectId === from.projectId &&
        role.providerProfileId === fromProfileId
      ) {
        role.providerProfileId = toProfileId;
        role.updatedAt = at;
        movedRoleIds.push(role.id);
      }
    }
    if (movedRoleIds.length === 0) {
      throw new StudioStoreError(
        "provider_profile_unused",
        "没有角色绑定这个 Provider Profile",
        409,
      );
    }
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "provider.reassigned",
      at,
      projectId: from.projectId,
      payload: { fromProfileId, toProfileId, movedRoleIds },
    });
    await ctx.save();
    return { fromProfileId, toProfileId, movedRoleIds };
  });
}

export async function getProviderProfile(
  ctx: StoreContext,
  profileId: string,
): Promise<ProviderProfile> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    return structuredClone(findProviderProfile(state, profileId));
  });
}

export async function getRoleProvider(
  ctx: StoreContext,
  roleId: string,
): Promise<ProviderProfile | null> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const role = state.roles.find((item) => item.id === roleId);
    if (role === undefined || role.providerProfileId === null) return null;
    const profile = state.providerProfiles.find(
      (item) =>
        item.id === role.providerProfileId &&
        item.projectId === role.projectId,
    );
    return profile === undefined ? null : structuredClone(profile);
  });
}
