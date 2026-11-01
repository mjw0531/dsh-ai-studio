import { nextProjectStage } from "../../shared/types.js";
import type {
  Project,
  ProjectStage,
  ProviderProfile,
  Role,
  MergeProposal,
  StageGate,
  StudioState,
  Task,
  Trigger,
  Workshop,
} from "../../shared/types.js";
import { StudioStoreError } from "./errors.js";

export function findProject(state: StudioState, projectId: string): Project {
    const project = state.projects.find((item) => item.id === projectId);
    if (project === undefined) {
      throw new StudioStoreError("project_not_found", "项目不存在", 404);
    }
    return project;
  }

export function findStageGate(
    state: StudioState,
    project: Project,
    stage: ProjectStage,
  ): StageGate {
    const gate = state.stageGates.find(
      (item) => item.projectId === project.id && item.stage === stage,
    );
    if (gate !== undefined) return gate;
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
        `下一阶段是 ${next}，不能操作 ${stage} 门禁`,
        409,
      );
    }
    throw new StudioStoreError(
      "stage_gate_not_found",
      "阶段门禁尚未创建，请先打开阶段门禁",
      404,
    );
  }

export function findProviderProfile(
    state: StudioState,
    profileId: string,
  ): ProviderProfile {
    const profile = state.providerProfiles.find(
      (item) => item.id === profileId,
    );
    if (profile === undefined) {
      throw new StudioStoreError(
        "provider_profile_not_found",
        "Provider Profile 不存在",
        404,
      );
    }
    return profile;
  }

export function findWorkshop(state: StudioState, workshopId: string): Workshop {
    const workshop = state.workshops.find((item) => item.id === workshopId);
    if (workshop === undefined) {
      throw new StudioStoreError("workshop_not_found", "研讨会不存在", 404);
    }
    return workshop;
  }

export function findTrigger(state: StudioState, triggerId: string): Trigger {
    const trigger = state.triggers.find((item) => item.id === triggerId);
    if (trigger === undefined) {
      throw new StudioStoreError("trigger_not_found", "触发事件不存在", 404);
    }
    return trigger;
  }

export function findTask(state: StudioState, taskId: string): Task {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task === undefined) {
      throw new StudioStoreError("task_not_found", "任务不存在", 404);
    }
    return task;
  }

export function findMergeProposal(
    state: StudioState,
    proposalId: string,
  ): MergeProposal {
    const proposal = state.mergeProposals.find((item) => item.id === proposalId);
    if (proposal === undefined) {
      throw new StudioStoreError("merge_not_found", "合并提案不存在", 404);
    }
    return proposal;
  }

export function resolveRoleId(
    state: StudioState,
    projectId: string,
    value: string | null | undefined,
    field: string,
  ): string | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") {
      throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
    }
    const role = state.roles.find(
      (item) => item.id === value && item.projectId === projectId,
    );
    if (role === undefined) {
      throw new StudioStoreError(
        "role_not_found",
        `${field} 指向的角色不存在`,
        404,
      );
    }
    return role.id;
  }


export function pickProject(
    state: StudioState,
    projectId: string | undefined,
  ): Project | null {
    if (projectId !== undefined) {
      const project = state.projects.find((item) => item.id === projectId);
      if (project === undefined) {
        throw new StudioStoreError("project_not_found", "项目不存在", 404);
      }
      return project;
    }
    if (state.activeProjectId !== null) {
      const active = state.projects.find(
        (item) => item.id === state.activeProjectId,
      );
      if (active !== undefined) return active;
    }
    return state.projects[0] ?? null;
  }

