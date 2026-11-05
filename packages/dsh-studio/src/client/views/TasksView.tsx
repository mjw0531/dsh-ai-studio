import { useState } from "react";

import {
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
} from "../../shared/types.js";
import type {
  BootstrapResponse,
  Role,
  Task,
  TaskStatus,
} from "../../shared/types.js";
import { StatusPill } from "../components/ui.js";
import { TaskBoard } from "../components/TaskBoard.js";
import { IconKanban, IconPlus } from "../icons.js";

export function TasksView({
  data,
  onOpenTask,
  onNewTask,
}: {
  data: BootstrapResponse;
  onOpenTask: (id: string) => void;
  onNewTask: () => void;
}) {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const tasks =
    filter === "all"
      ? data.tasks
      : data.tasks.filter((task) => task.status === filter);

  return (
    <>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">Task Board</div>
          <h1 className="studio-title">任务</h1>
          <p className="studio-subtitle">
            任务状态、负责人和验收标准是同一份事实。Agent 不能自己把任务标记为完成。
          </p>
        </div>
        <button
          type="button"
          className="studio-btn"
          data-variant="primary"
          onClick={onNewTask}
          disabled={data.project === null || data.roles.length === 0}
        >
          <IconPlus width={14} height={14} />
          新建任务
        </button>
      </div>

      <div className="studio-toolbar">
        <div className="studio-tabs">
          <button
            type="button"
            className="studio-tab"
            data-active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            全部 {data.stats.total}
          </button>
          {TASK_STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              className="studio-tab"
              data-active={filter === status}
              onClick={() => setFilter(status)}
            >
              {TASK_STATUS_LABELS[status]} {data.stats[status]}
            </button>
          ))}
        </div>
        <span className="studio-toolbar-spacer" />
        <span className="studio-muted">
          验收项 {data.stats.acceptanceDone}/{data.stats.acceptanceTotal}
        </span>
      </div>

      <TaskBoard
        tasks={tasks}
        roles={data.roles}
        mergeProposals={data.mergeProposals}
        onOpenTask={onOpenTask}
      />
    </>
  );
}

