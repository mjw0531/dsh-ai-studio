import { STUDIO_SCHEMA_VERSION } from "../../shared/types.js";
import type { Project, ProjectSlice } from "../../shared/types.js";
import { StudioStoreError, type StoreContext } from "./core.js";
import { requiredText } from "./inputs.js";
import { assertState } from "./validation.js";

function idsOf(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

export async function importProjectSlice(
  ctx: StoreContext,
  slice: ProjectSlice,
  repoPath: string,
): Promise<Project> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    if (slice.schemaVersion !== STUDIO_SCHEMA_VERSION) {
      throw new StudioStoreError(
        "bundle_schema_mismatch",
        `项目包 schema 为 ${String(slice.schemaVersion)}，当前只支持 ${String(
          STUDIO_SCHEMA_VERSION,
        )}`,
        409,
      );
    }
    if (state.projects.some((project) => project.id === slice.project.id)) {
      throw new StudioStoreError(
        "project_conflict",
        `项目 id ${slice.project.id} 已存在；请先删除/改名，或在新 profile 导入`,
        409,
      );
    }
    const existing = new Set<string>([
      ...idsOf(state.projects),
      ...idsOf(state.roles),
      ...idsOf(state.tasks),
      ...idsOf(state.runs),
      ...idsOf(state.reviews),
      ...idsOf(state.verifications),
      ...idsOf(state.decisions),
      ...idsOf(state.stageGates),
      ...idsOf(state.triggers),
      ...idsOf(state.threads),
      ...idsOf(state.workshops),
      ...idsOf(state.providerProfiles),
      ...idsOf(state.prototypeDemos),
      ...idsOf(state.modules),
      ...idsOf(state.branches),
      ...idsOf(state.contractChanges),
      ...idsOf(state.mergeProposals),
    ]);
    const importedIds = [
      slice.project.id,
      ...idsOf(slice.roles),
      ...idsOf(slice.tasks),
      ...idsOf(slice.runs),
      ...idsOf(slice.reviews),
      ...idsOf(slice.verifications),
      ...idsOf(slice.decisions),
      ...idsOf(slice.stageGates),
      ...idsOf(slice.triggers),
      ...idsOf(slice.threads),
      ...idsOf(slice.workshops),
      ...idsOf(slice.providerProfiles),
      ...idsOf(slice.prototypeDemos),
      ...idsOf(slice.modules),
      ...idsOf(slice.branches),
      ...idsOf(slice.contractChanges),
      ...idsOf(slice.mergeProposals),
    ];
    const collision = importedIds.find((id) => existing.has(id));
    if (collision !== undefined) {
      throw new StudioStoreError(
        "object_conflict",
        `项目包里的对象 id ${collision} 与现有数据冲突，拒绝导入`,
        409,
      );
    }
    const project: Project = {
      ...slice.project,
      repoPath: requiredText(repoPath, "repoPath", 1000),
      updatedAt: ctx.now(),
    };
    state.projects.push(project);
    state.stageGates.push(...slice.stageGates);
    state.freezes.push(...slice.freezes);
    state.requirementDecisions.push(...slice.requirementDecisions);
    state.freezeChangeRequests.push(...slice.freezeChangeRequests);
    state.triggers.push(...slice.triggers);
    state.threads.push(...slice.threads);
    state.workshops.push(...slice.workshops);
    state.providerProfiles.push(...slice.providerProfiles);
    state.prototypeDemos.push(...slice.prototypeDemos);
    state.roles.push(...slice.roles);
    state.modules.push(...slice.modules);
    state.tasks.push(...slice.tasks);
    state.mergeProposals.push(...slice.mergeProposals);
    state.runs.push(...slice.runs);
    state.branches.push(...slice.branches);
    state.contractChanges.push(...slice.contractChanges);
    state.decisions.push(...slice.decisions);
    state.verifications.push(...slice.verifications);
    state.reviews.push(...slice.reviews);
    state.events.push(...slice.events);
    assertState(state);
    state.activeProjectId = project.id;
    state.updatedAt = project.updatedAt;
    ctx.recordEvent(state, {
      type: "project.imported",
      at: project.updatedAt,
      projectId: project.id,
      payload: { projectId: project.id, repoPath },
    });
    await ctx.save();
    return structuredClone(project);
  });
}
