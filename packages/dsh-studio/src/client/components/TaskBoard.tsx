import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
} from "../../shared/types.js";
import type { MergeProposal, Role, Task } from "../../shared/types.js";
import {
  acceptanceDone,
  formatDate,
  latestMergeForTask,
  roleName,
} from "../lib/format.js";
import { MergePill, PriorityPill, StatusPill } from "./ui.js";

export function TaskBoard({
  tasks,
  roles,
  mergeProposals,
  onOpenTask,
}: {
  tasks: Task[];
  roles: Role[];
  mergeProposals: MergeProposal[];
  onOpenTask: (id: string) => void;
}) {
  return (
    <div className="studio-board-wrap">
      <div className="studio-board">
        {TASK_STATUS_ORDER.map((status) => {
          const list = tasks.filter((task) => task.status === status);
          return (
            <section key={status} className="studio-column">
              <div className="studio-column-head">
                <span>{TASK_STATUS_LABELS[status]}</span>
                <span className="studio-count">{list.length}</span>
              </div>
              <div className="studio-column-body">
                {list.length === 0 ? (
                  <div
                    className="studio-faint"
                    style={{ padding: "12px 4px", fontSize: 10 }}
                  >
                    暂无任务
                  </div>
                ) : (
                  list.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      roles={roles}
                      mergeProposal={latestMergeForTask(
                        mergeProposals,
                        task.id,
                      )}
                      onOpen={onOpenTask}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function TaskCard({
  task,
  roles,
  mergeProposal,
  onOpen,
}: {
  task: Task;
  roles: Role[];
  mergeProposal: MergeProposal | null;
  onOpen: (id: string) => void;
}) {
  const done = acceptanceDone(task);
  const total = task.acceptance.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <button
      type="button"
      className="studio-task-card"
      onClick={() => onOpen(task.id)}
    >
      <div className="studio-task-top">
        <PriorityPill priority={task.priority} />
        <StatusPill status={task.status} />
        {task.integration ? (
          <span className="studio-pill" data-tone="p1">
            集成
          </span>
        ) : null}
        {mergeProposal !== null && mergeProposal.status !== "rejected" ? (
          <MergePill proposal={mergeProposal} />
        ) : null}
      </div>
      <div className="studio-task-title">{task.title}</div>
      {task.goal ? <div className="studio-task-goal">{task.goal}</div> : null}
      <div className="studio-progress">
        <span style={{ width: `${String(pct)}%` }} />
      </div>
      <div className="studio-task-foot">
        <span className="studio-task-owner">
          {roleName(roles, task.ownerRoleId)}
        </span>
        <span className="studio-task-progress">
          验收 {done}/{total}
        </span>
      </div>
    </button>
  );
}

