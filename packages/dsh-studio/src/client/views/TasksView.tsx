import { useEffect, useState } from "react";

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
import { filterTasks } from "../../shared/task-filter.js";
import {
  addSavedTaskView,
  parseSavedTaskViews,
} from "../../shared/task-views.js";
import type { SavedTaskView } from "../../shared/task-views.js";
import { IconKanban, IconPlus } from "../icons.js";

export function TasksView({
  data,
  onOpenTask,
  onNewTask,
  onCreateMilestone,
  onPublishMilestones,
  onBatchReady,
}: {
  data: BootstrapResponse;
  onOpenTask: (id: string) => void;
  onNewTask: () => void;
  onCreateMilestone: (title: string) => Promise<boolean>;
  onPublishMilestones: () => Promise<boolean>;
  onBatchReady: (tasks: Task[]) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [milestoneFilter, setMilestoneFilter] = useState<string>("all");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [views, setViews] = useState<SavedTaskView[]>([]);
  const [viewName, setViewName] = useState("");
  useEffect(() => {
    try {
      setViews(parseSavedTaskViews(localStorage.getItem("studio.task.views")));
    } catch {
      setViews([]);
    }
  }, []);

  const saveView = (): void => {
    const name = viewName.trim();
    if (name === "") return;
    const view: SavedTaskView = {
      id: `view-${String(Date.now())}`,
      name,
      query,
      status: filter,
      milestoneId: milestoneFilter,
    };
    const next = addSavedTaskView(views, view);
    setViews(next);
    setViewName("");
    try {
      localStorage.setItem("studio.task.views", JSON.stringify(next));
    } catch {
      // Saved views are best-effort.
    }
  };

  const applyView = (id: string): void => {
    const view = views.find((item) => item.id === id);
    if (view === undefined) return;
    setQuery(view.query);
    setFilter(view.status);
    setMilestoneFilter(view.milestoneId);
  };

  const tasks = filterTasks(data.tasks, {
    query,
    status: filter,
    milestoneId: milestoneFilter,
  });

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
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索编号、标题、目标"
          aria-label="搜索任务"
        />
        <span className="studio-muted">
          验收项 {data.stats.acceptanceDone}/{data.stats.acceptanceTotal}
        </span>
      </div>

      <div className="studio-toolbar">
        <select
          value={milestoneFilter}
          onChange={(event) => setMilestoneFilter(event.target.value)}
          aria-label="按里程碑筛选"
        >
          <option value="all">全部里程碑</option>
          {data.milestones.map((milestone) => (
            <option key={milestone.id} value={milestone.id}>
              {milestone.title}
            </option>
          ))}
        </select>
        <input
          value={milestoneTitle}
          onChange={(event) => setMilestoneTitle(event.target.value)}
          placeholder="新里程碑名称"
          aria-label="新里程碑名称"
        />
        <button
          type="button"
          className="studio-btn"
          data-size="sm"
          disabled={data.milestones.length === 0}
          onClick={() => void onPublishMilestones()}
        >
          发布里程碑文档
        </button>
        <button
          type="button"
          className="studio-btn"
          data-size="sm"
          disabled={milestoneTitle.trim() === ""}
          onClick={() =>
            void onCreateMilestone(milestoneTitle.trim()).then((ok) => {
              if (ok) setMilestoneTitle("");
            })
          }
        >
          新建里程碑
        </button>
      </div>

      <div className="studio-toolbar">
        <select
          value=""
          onChange={(event) => applyView(event.target.value)}
          aria-label="应用保存的筛选"
        >
          <option value="">保存的筛选</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
        <input
          value={viewName}
          onChange={(event) => setViewName(event.target.value)}
          placeholder="筛选视图名称"
          aria-label="筛选视图名称"
        />
        <button
          type="button"
          className="studio-btn"
          data-size="sm"
          disabled={viewName.trim() === ""}
          onClick={saveView}
        >
          保存当前筛选
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="studio-toolbar">
          <span className="studio-muted">已选 {selected.size} 个任务</span>
          <button
            type="button"
            className="studio-btn"
            data-size="sm"
            disabled={
              !data.tasks.some(
                (task) => selected.has(task.id) && task.status === "backlog",
              )
            }
            onClick={() =>
              void onBatchReady(
                data.tasks.filter((task) => selected.has(task.id)),
              ).then((ok) => {
                if (ok) setSelected(new Set());
              })
            }
          >
            批量标记可开始
          </button>
          <button
            type="button"
            className="studio-btn"
            data-size="sm"
            onClick={() => setSelected(new Set())}
          >
            清空选择
          </button>
        </div>
      ) : null}

      <TaskBoard
        tasks={tasks}
        roles={data.roles}
        mergeProposals={data.mergeProposals}
        selected={selected}
        onOpenTask={onOpenTask}
        onToggleSelect={(id) =>
          setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
      />
    </>
  );
}

