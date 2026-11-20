import type {
  ProjectStage,
  ProjectFreeze,
  PrototypeDemo,
  StageGate,
  Task,
} from "./types.js";

export type JourneyState = "done" | "active" | "todo";

export interface JourneyStep {
  id: string;
  label: string;
  state: JourneyState;
}

export function buildJourneySteps(input: {
  stage: ProjectStage;
  freezes: ProjectFreeze[];
  stageGates: StageGate[];
  demos: PrototypeDemo[];
  tasks: Task[];
}): JourneyStep[] {
  const hasPrd = input.freezes.some((freeze) => freeze.kind === "prd");
  const hasArchitecture = input.freezes.some(
    (freeze) => freeze.kind === "architecture",
  );
  const hasDemo =
    input.demos.some((demo) => demo.result === "passed") ||
    input.stageGates.some((gate) =>
      gate.artifacts.some((artifact) => artifact.kind === "demo"),
    );
  const development = input.stage === "development";
  const doneTasks = input.tasks.filter((task) => task.status === "done").length;
  return [
    { id: "setup", label: "立项", state: "done" },
    {
      id: "prd",
      label: "PRD 冻结",
      state: hasPrd ? "done" : input.stage === "discovery" ? "active" : "todo",
    },
    {
      id: "architecture",
      label: "架构冻结",
      state: hasArchitecture
        ? "done"
        : hasPrd && input.stage !== "development"
          ? "active"
          : "todo",
    },
    {
      id: "demo",
      label: "原型 / Demo",
      state: hasDemo
        ? "done"
        : input.stage === "prototype"
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
      label:
        input.tasks.length === 0
          ? "任务"
          : `任务 ${doneTasks}/${input.tasks.length}`,
      state: development
        ? doneTasks === input.tasks.length && input.tasks.length > 0
          ? "done"
          : "active"
        : "todo",
    },
  ];
}
