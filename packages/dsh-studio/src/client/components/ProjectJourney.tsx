import type {
  Project,
  ProjectFreeze,
  PrototypeDemo,
  StageGate,
  Task,
} from "../../shared/types.js";

export function ProjectJourney({
  project,
  freezes,
  stageGates,
  demos,
  tasks,
}: {
  project: Project | null;
  freezes: ProjectFreeze[];
  stageGates: StageGate[];
  demos: PrototypeDemo[];
  tasks: Task[];
}) {
  if (project === null) return null;
  const hasPrd = freezes.some((freeze) => freeze.kind === "prd");
  const hasArchitecture = freezes.some((freeze) => freeze.kind === "architecture");
  const hasDemo =
    demos.some((demo) => demo.result === "passed") ||
    stageGates.some((gate) =>
      gate.artifacts.some((artifact) => artifact.kind === "demo"),
    );
  const development = project.stage === "development";
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const steps = [
    { id: "setup", label: "立项", state: "done" },
    {
      id: "prd",
      label: "PRD 冻结",
      state: hasPrd ? "done" : project.stage === "discovery" ? "active" : "todo",
    },
    {
      id: "architecture",
      label: "架构冻结",
      state: hasArchitecture
        ? "done"
        : hasPrd && project.stage !== "development"
          ? "active"
          : "todo",
    },
    {
      id: "demo",
      label: "原型 / Demo",
      state: hasDemo
        ? "done"
        : project.stage === "prototype"
          ? "active"
          : "todo",
    },
    {
      id: "development",
      label: "开发",
      state: development ? "done" : hasDemo ? "active" : "todo",
    },
    {
      id: "tasks",
      label: tasks.length === 0 ? "任务" : `任务 ${doneTasks}/${tasks.length}`,
      state: development ? (doneTasks === tasks.length && tasks.length > 0 ? "done" : "active") : "todo",
    },
  ] as const;

  return (
    <div className="studio-journey" aria-label="项目旅程">
      {steps.map((step, index) => (
        <div className="studio-journey-step" data-state={step.state} key={step.id}>
          <span className="studio-journey-index">{index + 1}</span>
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}
