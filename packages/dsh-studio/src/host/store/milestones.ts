import type {
  CreateMilestoneInput,
  Milestone,
  MilestoneStatus,
  UpdateMilestoneInput,
} from "../../shared/types.js";
import { StudioStoreError, newId, type StoreContext } from "./core.js";
import { optionalText, requiredText } from "./inputs.js";
import { findProject } from "./lookups.js";

export async function createMilestone(
  ctx: StoreContext,
  projectId: string,
  input: CreateMilestoneInput,
): Promise<Milestone> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    findProject(state, projectId);
    const at = ctx.now();
    const milestone: Milestone = {
      id: newId("milestone"),
      projectId,
      title: requiredText(input.title, "title", 160),
      goal: optionalText(input.goal, "goal", 2000),
      status: "planned",
      order:
        state.milestones.filter((item) => item.projectId === projectId).length +
        1,
      createdAt: at,
      updatedAt: at,
    };
    state.milestones.push(milestone);
    state.updatedAt = at;
    ctx.recordEvent(state, {
      type: "milestone.created",
      at,
      projectId,
      payload: { milestoneId: milestone.id },
    });
    await ctx.save();
    return structuredClone(milestone);
  });
}

export async function updateMilestone(
  ctx: StoreContext,
  milestoneId: string,
  input: UpdateMilestoneInput,
): Promise<Milestone> {
  return ctx.runExclusive(async () => {
    const state = ctx.requireState();
    const milestone = state.milestones.find((item) => item.id === milestoneId);
    if (milestone === undefined) {
      throw new StudioStoreError("milestone_not_found", "里程碑不存在", 404);
    }
    if (input.title !== undefined) {
      milestone.title = requiredText(input.title, "title", 160);
    }
    if (input.goal !== undefined) {
      milestone.goal = optionalText(input.goal, "goal", 2000);
    }
    if (input.status !== undefined) {
      const status: MilestoneStatus = input.status;
      if (status !== "planned" && status !== "active" && status !== "done") {
        throw new StudioStoreError("invalid_status", "里程碑状态无效", 400);
      }
      milestone.status = status;
    }
    milestone.updatedAt = ctx.now();
    state.updatedAt = milestone.updatedAt;
    await ctx.save();
    return structuredClone(milestone);
  });
}
