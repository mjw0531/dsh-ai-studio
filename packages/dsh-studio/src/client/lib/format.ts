import type { MergeProposal, Role, Task } from "../../shared/types.js";
import { StudioClientError } from "../api.js";

export function errorText(error: unknown): string {
  if (error instanceof StudioClientError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "??";
}

export function acceptanceDone(task: Task): number {
  return task.acceptance.filter((item) => item.done).length;
}

export function allAccepted(task: Task): boolean {
  return (
    task.acceptance.length > 0 &&
    task.acceptance.every((item) => item.done)
  );
}

export function roleName(roles: Role[], id: string | null): string {
  if (id === null) return "未指派";
  return roles.find((role) => role.id === id)?.name ?? "未知角色";
}

export function roleTitle(roles: Role[], id: string | null): string {
  if (id === null) return "";
  return roles.find((role) => role.id === id)?.title ?? "";
}

export function mergeTone(status: MergeProposal["status"]): string {
  if (status === "merged") return "ok";
  if (status === "approved") return "p1";
  if (status === "rejected") return "p0";
  return "accent";
}

export function latestMergeForTask(
  proposals: MergeProposal[],
  taskId: string,
): MergeProposal | null {
  const matching = proposals
    .filter((proposal) => proposal.taskId === taskId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return (
    matching.find((proposal) => proposal.status !== "rejected") ??
    matching[0] ??
    null
  );
}
