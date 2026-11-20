import type {
  Project,
  ProjectFreeze,
  PrototypeDemo,
  StageGate,
  Task,
} from "../../shared/types.js";
import { buildJourneySteps } from "../../shared/journey.js";

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
  const steps = buildJourneySteps({
    stage: project.stage,
    freezes,
    stageGates,
    demos,
    tasks,
  });

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
