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
    const candidate = structuredClone(state);
    candidate.projects.push(project);
    candidate.stageGates.push(...slice.stageGates);
    candidate.freezes.push(...slice.freezes);
    candidate.requirementDecisions.push(...slice.requirementDecisions);
    candidate.freezeChangeRequests.push(...slice.freezeChangeRequests);
    candidate.triggers.push(...slice.triggers);
    candidate.threads.push(...slice.threads);
    candidate.workshops.push(...slice.workshops);
    candidate.providerProfiles.push(...slice.providerProfiles);
    candidate.prototypeDemos.push(...slice.prototypeDemos);
    candidate.roles.push(...slice.roles);
    candidate.modules.push(...slice.modules);
    candidate.tasks.push(...slice.tasks);
    candidate.mergeProposals.push(...slice.mergeProposals);
    candidate.runs.push(...slice.runs);
    candidate.branches.push(...slice.branches);
    candidate.contractChanges.push(...slice.contractChanges);
    candidate.decisions.push(...slice.decisions);
    candidate.verifications.push(...slice.verifications);
    candidate.reviews.push(...slice.reviews);
    candidate.events.push(...slice.events);
    assertState(candidate);
    candidate.activeProjectId = project.id;
    candidate.updatedAt = project.updatedAt;
    ctx.recordEvent(candidate, {
      type: "project.imported",
      at: project.updatedAt,
      projectId: project.id,
      payload: { projectId: project.id, repoPath },
    });
    Object.assign(state, candidate);
    await ctx.save();
    return structuredClone(project);
  });
}
