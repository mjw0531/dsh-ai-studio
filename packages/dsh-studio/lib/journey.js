// src/shared/journey.ts
function buildJourneySteps(input) {
  const hasPrd = input.freezes.some((freeze) => freeze.kind === "prd");
  const hasArchitecture = input.freezes.some(
    (freeze) => freeze.kind === "architecture"
  );
  const hasDemo = input.demos.some((demo) => demo.result === "passed") || input.stageGates.some(
    (gate) => gate.artifacts.some((artifact) => artifact.kind === "demo")
  );
  const development = input.stage === "development";
  const doneTasks = input.tasks.filter((task) => task.status === "done").length;
  return [
    { id: "setup", label: "\u7ACB\u9879", state: "done" },
    {
      id: "prd",
      label: "PRD \u51BB\u7ED3",
      state: hasPrd ? "done" : input.stage === "discovery" ? "active" : "todo"
    },
    {
      id: "architecture",
      label: "\u67B6\u6784\u51BB\u7ED3",
      state: hasArchitecture ? "done" : hasPrd && input.stage !== "development" ? "active" : "todo"
    },
    {
      id: "demo",
      label: "\u539F\u578B / Demo",
      state: hasDemo ? "done" : input.stage === "prototype" ? "active" : "todo"
    },
    {
      id: "development",
      label: "\u5F00\u53D1",
      state: development ? "done" : hasDemo ? "active" : "todo"
    },
    {
      id: "tasks",
      label: input.tasks.length === 0 ? "\u4EFB\u52A1" : `\u4EFB\u52A1 ${doneTasks}/${input.tasks.length}`,
      state: development ? doneTasks === input.tasks.length && input.tasks.length > 0 ? "done" : "active" : "todo"
    }
  ];
}
export {
  buildJourneySteps
};
