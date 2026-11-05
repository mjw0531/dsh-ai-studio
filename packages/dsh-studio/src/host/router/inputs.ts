import type {
  AcceptTriggerInput,
  AddWorkshopNoteInput,
  AgentRun,
  ApiErrorBody,
  ApproveStageGateInput,
  CreateTriggerInput,
  CreateWorkshopInput,
  CreateProviderProfileInput,
  CreatePrototypeDemoInput,
  UpdatePrototypeDemoInput,
  UpdateProviderProfileInput,
  ProviderProfile,
  ProviderProbeResult,
  Workshop,
  CompatibilityInfo,
  CreateDecisionInput,
  CreateMergeProposalInput,
  CreateModuleInput,
  CreateFreezeChangeRequestInput,
  CreateProjectFreezeInput,
  CreateProjectFromTemplateInput,
  CreateProjectInput,
  CreateRequirementDecisionInput,
  CreateRoleInput,
  FreezeChangeRequest,
  FreezeKind,
  ProjectFreeze,
  RequirementDecision,
  AgentExecutor,
  CreateTaskInput,
  DecideDecisionInput,
  Decision,
  IndependentReview,
  MergeProposal,
  MergeRisk,
  ProjectDoc,
  ProjectStage,
  StageArtifact,
  StageCheckItem,
  TaskStatus,
  TransitionTaskInput,
  UpdateModuleInput,
  UpdateProjectInput,
  UpdateStageGateInput,
  UpdateTaskInput,
  UpdateTriggerRulesInput,
  Verification,
} from "../../shared/types.js";
import { isProjectStage } from "../../shared/types.js";
import { HttpError } from "./http.js";

export function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "invalid_input", `${field} 必须是非空字符串`);
  }
  return value;
}

export function asOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new HttpError(
      400,
      "invalid_input",
      `${field} 必须是字符串；留空请省略或传 null`,
    );
  }
  return value.trim() === "" ? undefined : value;
}

export function asStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpError(
      400,
      "invalid_input",
      `${field} 必须是字符串数组；留空请省略或传 null`,
    );
  }
  return value;
}

export function asOptionalTimeout(value: unknown, field: string): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(400, "invalid_input", `${field} 必须是正整数秒`);
  }
  return value;
}

export function asRiskTier(value: unknown): "trivial" | "normal" | "critical" | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "trivial" || value === "normal" || value === "critical") return value;
  throw new HttpError(400, "invalid_input", "riskTier 必须是 trivial/normal/critical");
}

export function asTaskStatus(value: unknown): TaskStatus {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_input", "status 必须是字符串");
  }
  return value as TaskStatus;
}

export function asOptionalBudget(
  value: unknown,
  field: string,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new HttpError(
      400,
      "invalid_input",
      `${field} 必须是非负整数 token 数`,
    );
  }
  return value === 0 ? null : value;
}

export function asUpdateTriggerRules(
  body: Record<string, unknown>,
): UpdateTriggerRulesInput {
  const result: UpdateTriggerRulesInput = {};
  if (body.enabled !== undefined) result.enabled = body.enabled === true;
  if (body.sources !== undefined) {
    result.sources = asStringArray(body.sources, "sources") as UpdateTriggerRulesInput["sources"];
  }
  if (body.repos !== undefined) {
    result.repos = asStringArray(body.repos, "repos");
  }
  if (body.labels !== undefined) {
    result.labels = asStringArray(body.labels, "labels");
  }
  if (body.authors !== undefined) {
    result.authors = asStringArray(body.authors, "authors");
  }
  if (body.mention !== undefined) {
    result.mention = asOptionalString(body.mention, "mention");
  }
  return result;
}

export function asCreateProjectFromTemplate(
  body: Record<string, unknown>,
): CreateProjectFromTemplateInput {
  const template = body.template;
  if (template !== "web" && template !== "game" && template !== "tool") {
    throw new HttpError(
      400,
      "invalid_input",
      "template 必须是 web / game / tool",
    );
  }
  return {
    template,
    name: asString(body.name, "name"),
    description: asOptionalString(body.description, "description"),
    repoPath: asOptionalString(body.repoPath, "repoPath") ?? null,
  };
}

export function asCreateProject(body: Record<string, unknown>): CreateProjectInput {
  return {
    name: asString(body.name, "name"),
    description: asOptionalString(body.description, "description"),
    tokenBudget: asOptionalBudget(body.tokenBudget, "tokenBudget"),
  };
}

export function asUpdateProject(
  body: Record<string, unknown>,
): UpdateProjectInput {
  const optionalPath = (
    value: unknown,
    field: string,
  ): string | null | undefined =>
    value === undefined
      ? undefined
      : value === null
        ? null
        : asString(value, field);
  return {
    repoPath: optionalPath(body.repoPath, "repoPath"),
    prdPath: optionalPath(body.prdPath, "prdPath"),
    invariantsPath: optionalPath(
      body.invariantsPath,
      "invariantsPath",
    ),
    modulesPath: optionalPath(body.modulesPath, "modulesPath"),
  };
}

export function asCreateModule(body: Record<string, unknown>): CreateModuleInput {
  return {
    name: asString(body.name, "name"),
    responsibility: asOptionalString(body.responsibility, "responsibility"),
    contractPath: asOptionalString(body.contractPath, "contractPath"),
    contractText: asOptionalString(body.contractText, "contractText"),
    allowedPaths: asStringArray(body.allowedPaths, "allowedPaths"),
    forbiddenPaths: asStringArray(body.forbiddenPaths, "forbiddenPaths"),
    dependsOn: asStringArray(body.dependsOn, "dependsOn"),
  };
}

export function asUpdateModule(body: Record<string, unknown>): UpdateModuleInput {
  return {
    responsibility: asOptionalString(body.responsibility, "responsibility"),
    contractPath:
      body.contractPath === null
        ? null
        : asOptionalString(body.contractPath, "contractPath"),
    contractText: asOptionalString(body.contractText, "contractText"),
    allowedPaths: asStringArray(body.allowedPaths, "allowedPaths"),
    forbiddenPaths: asStringArray(body.forbiddenPaths, "forbiddenPaths"),
    dependsOn: asStringArray(body.dependsOn, "dependsOn"),
  };
}

export function asCreateDecision(
  body: Record<string, unknown>,
): CreateDecisionInput {
  return {
    title: asString(body.title, "title"),
    context: asOptionalString(body.context, "context"),
    recommendation: asOptionalString(body.recommendation, "recommendation"),
    taskId:
      body.taskId === null || body.taskId === undefined
        ? null
        : asString(body.taskId, "taskId"),
    reversible: body.reversible !== false,
  };
}

export function asDecideDecision(
  body: Record<string, unknown>,
): DecideDecisionInput {
  if (body.status !== "approved" && body.status !== "rejected") {
    throw new HttpError(
      400,
      "invalid_input",
      "status 只能是 approved 或 rejected",
    );
  }
  return {
    status: body.status,
    decision: asOptionalString(body.decision, "decision"),
    note: asOptionalString(body.note, "note"),
  };
}

export function asAgentExecutor(value: unknown): AgentExecutor | undefined {
  if (value === undefined) return undefined;
  if (value === "dsh" || value === "claude-code" || value === "codex") {
    return value;
  }
  throw new HttpError(
    400,
    "invalid_input",
    "executor 必须是 dsh / claude-code / codex",
  );
}

export function asPrototypeDemoResult(
  value: unknown,
): CreatePrototypeDemoInput["result"] {
  if (value === "passed" || value === "failed") return value;
  throw new HttpError(
    400,
    "invalid_input",
    "result 必须是 passed 或 failed",
  );
}

export function asCreatePrototypeDemo(
  body: Record<string, unknown>,
): CreatePrototypeDemoInput {
  return {
    title: asString(body.title, "title"),
    entry: asOptionalString(body.entry, "entry"),
    startCommand: asOptionalString(body.startCommand, "startCommand"),
    steps: asOptionalString(body.steps, "steps"),
    result: asPrototypeDemoResult(body.result),
    screenshotPath: asOptionalString(body.screenshotPath, "screenshotPath"),
    notes: asOptionalString(body.notes, "notes"),
  };
}

export function asUpdatePrototypeDemo(
  body: Record<string, unknown>,
): UpdatePrototypeDemoInput {
  return {
    title:
      body.title === undefined ? undefined : asString(body.title, "title"),
    entry: asOptionalString(body.entry, "entry"),
    startCommand: asOptionalString(body.startCommand, "startCommand"),
    steps: asOptionalString(body.steps, "steps"),
    result:
      body.result === undefined
        ? undefined
        : asPrototypeDemoResult(body.result),
    screenshotPath: asOptionalString(body.screenshotPath, "screenshotPath"),
    notes: asOptionalString(body.notes, "notes"),
  };
}

export function asCreateProviderProfile(
  body: Record<string, unknown>,
): CreateProviderProfileInput {
  return {
    name: asString(body.name, "name"),
    executor: asAgentExecutor(body.executor),
    provider: asOptionalString(body.provider, "provider"),
    model: asOptionalString(body.model, "model"),
    note: asOptionalString(body.note, "note"),
  };
}

export function asUpdateProviderProfile(
  body: Record<string, unknown>,
): UpdateProviderProfileInput {
  return {
    name:
      body.name === undefined ? undefined : asString(body.name, "name"),
    executor: asAgentExecutor(body.executor),
    provider: asOptionalString(body.provider, "provider"),
    model: asOptionalString(body.model, "model"),
    note: asOptionalString(body.note, "note"),
  };
}

export function asCreateRole(body: Record<string, unknown>): CreateRoleInput {
  return {
    name: asString(body.name, "name"),
    title: asOptionalString(body.title, "title"),
    mission: asOptionalString(body.mission, "mission"),
    responsibilities: asStringArray(body.responsibilities, "responsibilities"),
    providerProfileId:
      body.providerProfileId === null
        ? null
        : asOptionalString(body.providerProfileId, "providerProfileId"),
    model: asOptionalString(body.model, "model") ?? null,
    executor: asAgentExecutor(body.executor),
    tokenBudget: asOptionalBudget(body.tokenBudget, "tokenBudget"),
    dailyTokenBudget: asOptionalBudget(
      body.dailyTokenBudget,
      "dailyTokenBudget",
    ),
  };
}

export function asCreateTask(body: Record<string, unknown>): CreateTaskInput {
  const owner =
    body.ownerRoleId === null || body.ownerRoleId === undefined
      ? null
      : asString(body.ownerRoleId, "ownerRoleId");
  const reviewer =
    body.reviewerRoleId === null || body.reviewerRoleId === undefined
      ? null
      : asString(body.reviewerRoleId, "reviewerRoleId");
  const priority =
    body.priority === "P0" || body.priority === "P1" || body.priority === "P2"
      ? body.priority
      : "P1";
  const kind =
    body.kind === "fix" || body.kind === "new" ? body.kind : undefined;
  return {
    title: asString(body.title, "title"),
    goal: asOptionalString(body.goal, "goal"),
    priority,
    ownerRoleId: owner,
    reviewerRoleId: reviewer,
    acceptance: asStringArray(body.acceptance, "acceptance"),
    branch: asOptionalString(body.branch, "branch") ?? null,
    verifyCommand:
      asOptionalString(body.verifyCommand, "verifyCommand") ?? null,
    module: asOptionalString(body.module, "module") ?? null,
    contractRef:
      asOptionalString(body.contractRef, "contractRef") ?? null,
    requirementRefs: asStringArray(body.requirementRefs, "requirementRefs") ?? [],
    timeoutSeconds: asOptionalTimeout(body.timeoutSeconds, "timeoutSeconds"),
    riskTier: asRiskTier(body.riskTier),
    diagnosis: asOptionalString(body.diagnosis, "diagnosis") ?? "",
    plan: asOptionalString(body.plan, "plan") ?? "",
    kind,
    integration: body.integration === true,
    originTaskId:
      asOptionalString(body.originTaskId, "originTaskId") ?? null,
  };
}

export function asFreezeKind(value: unknown): FreezeKind {
  if (value === "prd" || value === "architecture") return value;
  throw new HttpError(400, "invalid_input", "kind 必须是 prd/architecture");
}

export function asCreateFreeze(body: Record<string, unknown>): CreateProjectFreezeInput {
  const checklist = body.checklist;
  if (
    checklist !== undefined &&
    (!Array.isArray(checklist) ||
      !checklist.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { text?: unknown }).text === "string" &&
          typeof (item as { done?: unknown }).done === "boolean",
      ))
  ) {
    throw new HttpError(400, "invalid_input", "checklist 无效");
  }
  return {
    kind: asFreezeKind(body.kind),
    version: asString(body.version, "version"),
    docPath: asString(body.docPath, "docPath"),
    domainModelPath:
      body.domainModelPath === null || body.domainModelPath === undefined
        ? null
        : asOptionalString(body.domainModelPath, "domainModelPath") ?? null,
    summary: asOptionalString(body.summary, "summary") ?? "",
    openQuestions:
      asStringArray(body.openQuestions, "openQuestions") ?? [],
    checklist: checklist as StageCheckItem[] | undefined,
    waiverReason:
      body.waiverReason === null || body.waiverReason === undefined
        ? null
        : asOptionalString(body.waiverReason, "waiverReason") ?? null,
  };
}

export function asRequirementDecision(
  body: Record<string, unknown>,
): CreateRequirementDecisionInput {
  const status = body.status;
  if (
    status !== undefined &&
    status !== "accepted" &&
    status !== "rejected" &&
    status !== "pending"
  ) {
    throw new HttpError(400, "invalid_input", "status 无效");
  }
  return {
    title: asString(body.title, "title"),
    source: asString(body.source, "source"),
    recommendation: asString(body.recommendation, "recommendation"),
    status,
    rationale: asOptionalString(body.rationale, "rationale") ?? "",
    freezeId:
      body.freezeId === null || body.freezeId === undefined
        ? null
        : asOptionalString(body.freezeId, "freezeId") ?? null,
  };
}

export function asCreateFreezeChangeRequest(
  body: Record<string, unknown>,
): CreateFreezeChangeRequestInput {
  return {
    freezeId: asString(body.freezeId, "freezeId"),
    title: asString(body.title, "title"),
    reason: asString(body.reason, "reason"),
    impact: asOptionalString(body.impact, "impact") ?? "",
  };
}

export function asUpdateTask(body: Record<string, unknown>): UpdateTaskInput {
  const result: UpdateTaskInput = {};
  if (body.title !== undefined) result.title = asString(body.title, "title");
  if (body.goal !== undefined) result.goal = asOptionalString(body.goal, "goal");
  if (body.priority !== undefined) {
    if (
      body.priority !== "P0" &&
      body.priority !== "P1" &&
      body.priority !== "P2"
    ) {
      throw new HttpError(400, "invalid_input", "priority 无效");
    }
    result.priority = body.priority;
  }
  if (body.ownerRoleId !== undefined) {
    result.ownerRoleId =
      body.ownerRoleId === null
        ? null
        : asString(body.ownerRoleId, "ownerRoleId");
  }
  if (body.reviewerRoleId !== undefined) {
    result.reviewerRoleId =
      body.reviewerRoleId === null
        ? null
        : asString(body.reviewerRoleId, "reviewerRoleId");
  }
  if (body.acceptance !== undefined) {
    if (!Array.isArray(body.acceptance)) {
      throw new HttpError(400, "invalid_input", "acceptance 必须是数组");
    }
    result.acceptance = body.acceptance as UpdateTaskInput["acceptance"];
  }
  if (body.evidence !== undefined) {
    if (!Array.isArray(body.evidence)) {
      throw new HttpError(400, "invalid_input", "evidence 必须是数组");
    }
    result.evidence = body.evidence as UpdateTaskInput["evidence"];
  }
  if (body.branch !== undefined) {
    result.branch =
      body.branch === null ? null : asOptionalString(body.branch, "branch");
  }
  if (body.verifyCommand !== undefined) {
    result.verifyCommand =
      body.verifyCommand === null
        ? null
        : asOptionalString(body.verifyCommand, "verifyCommand");
  }
  if (body.module !== undefined) {
    result.module =
      body.module === null
        ? null
        : asOptionalString(body.module, "module");
  }
  if (body.contractRef !== undefined) {
    result.contractRef =
      body.contractRef === null
        ? null
        : asOptionalString(body.contractRef, "contractRef");
  }
  if (body.requirementRefs !== undefined) {
    result.requirementRefs =
      asStringArray(body.requirementRefs, "requirementRefs") ?? [];
  }
  if (body.timeoutSeconds !== undefined) {
    result.timeoutSeconds = asOptionalTimeout(
      body.timeoutSeconds,
      "timeoutSeconds",
    );
  }
  if (body.riskTier !== undefined) {
    result.riskTier = asRiskTier(body.riskTier);
  }
  if (body.kind !== undefined) {
    if (body.kind !== "new" && body.kind !== "fix") {
      throw new HttpError(400, "invalid_input", "kind 无效");
    }
    result.kind = body.kind;
  }
  if (body.diagnosis !== undefined) {
    result.diagnosis = asOptionalString(body.diagnosis, "diagnosis");
  }
  if (body.plan !== undefined) {
    result.plan = asOptionalString(body.plan, "plan");
  }
  if (body.integration !== undefined) {
    if (typeof body.integration !== "boolean") {
      throw new HttpError(400, "invalid_input", "integration 必须是布尔值");
    }
    result.integration = body.integration;
  }
  if (body.docsSynced !== undefined) {
    if (typeof body.docsSynced !== "boolean") {
      throw new HttpError(400, "invalid_input", "docsSynced 必须是布尔值");
    }
    result.docsSynced = body.docsSynced;
  }
  return result;
}

export function asMergeRisk(value: unknown): MergeRisk {
  if (value === undefined) return "medium";
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new HttpError(400, "invalid_input", "risk 必须是 low/medium/high");
}

export function asCreateMergeProposal(
  body: Record<string, unknown>,
): CreateMergeProposalInput {
  return {
    summary: asString(body.summary, "summary"),
    rollback: asString(body.rollback, "rollback"),
    risk: asMergeRisk(body.risk),
    base: asOptionalString(body.base, "base"),
    branch: asOptionalString(body.branch, "branch"),
  };
}

export function asNote(body: Record<string, unknown>): string | undefined {
  return asOptionalString(body.note, "note");
}

export function asTriggerSource(value: unknown): CreateTriggerInput["source"] {
  if (
    value === "manual" ||
    value === "github" ||
    value === "ci" ||
    value === "im" ||
    value === "email"
  ) {
    return value;
  }
  throw new HttpError(
    400,
    "invalid_input",
    "source 必须是 manual/github/ci/im/email",
  );
}

export function asCreateTrigger(body: Record<string, unknown>): CreateTriggerInput {
  return {
    source: asTriggerSource(body.source),
    externalId: asOptionalString(body.externalId, "externalId"),
    threadKey: asOptionalString(body.threadKey, "threadKey"),
    title: asString(body.title, "title"),
    body: asOptionalString(body.body, "body"),
    url: asOptionalString(body.url, "url"),
  };
}

export function asAcceptTrigger(body: Record<string, unknown>): AcceptTriggerInput {
  const priority =
    body.priority === "P0" || body.priority === "P1" || body.priority === "P2"
      ? body.priority
      : undefined;
  return {
    acceptance: asStringArray(body.acceptance, "acceptance"),
    ownerRoleId:
      body.ownerRoleId === null
        ? null
        : asOptionalString(body.ownerRoleId, "ownerRoleId"),
    reviewerRoleId:
      body.reviewerRoleId === null
        ? null
        : asOptionalString(body.reviewerRoleId, "reviewerRoleId"),
    priority,
  };
}

export function asCreateWorkshop(
  body: Record<string, unknown>,
): CreateWorkshopInput {
  return {
    title: asString(body.title, "title"),
    topic: asOptionalString(body.topic, "topic"),
    stage:
      body.stage === undefined
        ? undefined
        : asProjectStage(body.stage),
    participantRoleIds: asStringArray(
      body.participantRoleIds,
      "participantRoleIds",
    ),
    meetingType:
      body.meetingType === "prd" ||
      body.meetingType === "architecture" ||
      body.meetingType === "balance" ||
      body.meetingType === "custom"
        ? body.meetingType
        : undefined,
    agenda: asStringArray(body.agenda, "agenda"),
    freezeId:
      body.freezeId === null || body.freezeId === undefined
        ? null
        : asOptionalString(body.freezeId, "freezeId") ?? null,
    perspectives:
      body.perspectives === undefined
        ? undefined
        : Array.isArray(body.perspectives)
          ? body.perspectives.flatMap((item) => {
              if (
                typeof item !== "object" ||
                item === null ||
                typeof (item as { roleId?: unknown }).roleId !== "string" ||
                ((item as { perspective?: unknown }).perspective !== "experience" &&
                  (item as { perspective?: unknown }).perspective !== "competitor" &&
                  (item as { perspective?: unknown }).perspective !== "feasibility" &&
                  (item as { perspective?: unknown }).perspective !== "contrarian")
              ) {
                throw new HttpError(400, "invalid_input", "perspectives 无效");
              }
              return [
                {
                  roleId: (item as { roleId: string }).roleId,
                  perspective: (item as { perspective: "experience" | "competitor" | "feasibility" | "contrarian" }).perspective,
                },
              ];
            })
          : (() => {
              throw new HttpError(400, "invalid_input", "perspectives 必须是数组");
            })(),
  };
}

export function asWorkshopNote(
  body: Record<string, unknown>,
): AddWorkshopNoteInput {
  return {
    roleId: asString(body.roleId, "roleId"),
    summary: asString(body.summary, "summary"),
    objections: asStringArray(body.objections, "objections"),
    risks: asStringArray(body.risks, "risks"),
    recommendation: asOptionalString(body.recommendation, "recommendation"),
  };
}

export function asProjectStage(value: unknown): ProjectStage {
  if (isProjectStage(value)) return value;
  throw new HttpError(
    400,
    "invalid_input",
    "stage 必须是 discovery/architecture/prototype/development",
  );
}

export function asStageGateInput(
  body: Record<string, unknown>,
): UpdateStageGateInput {
  const input: UpdateStageGateInput = {};
  if (body.checklist !== undefined) {
    input.checklist = body.checklist as StageCheckItem[];
  }
  if (body.artifacts !== undefined) {
    input.artifacts = body.artifacts as StageArtifact[];
  }
  if (body.note !== undefined) {
    input.note = asOptionalString(body.note, "note");
  }
  return input;
}

export function asApproveStageGateInput(
  body: Record<string, unknown>,
): ApproveStageGateInput {
  return {
    ...asStageGateInput(body),
    waiverReason: asOptionalString(body.waiverReason, "waiverReason"),
  };
}

