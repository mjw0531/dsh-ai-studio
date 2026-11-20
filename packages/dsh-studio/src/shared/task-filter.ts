import type { Task, TaskStatus } from "./types.js";

export function filterTasks(
  tasks: Task[],
  input: {
    query?: string;
    status?: TaskStatus | "all";
    milestoneId?: string | "all";
  },
): Task[] {
  const query = (input.query ?? "").trim().toLowerCase();
  const status = input.status ?? "all";
  const milestoneId = input.milestoneId ?? "all";
  return tasks.filter((task) => {
    if (status !== "all" && task.status !== status) return false;
    if (milestoneId !== "all" && task.milestoneId !== milestoneId) return false;
    if (query === "") return true;
    return (
      task.number.toLowerCase().includes(query) ||
      task.title.toLowerCase().includes(query) ||
      task.goal.toLowerCase().includes(query)
    );
  });
}
