// src/host/router.ts
import { timingSafeEqual as timingSafeEqual3 } from "node:crypto";

// src/shared/types.ts
var STUDIO_PLUGIN_VERSION = "3.12.0";
var PROJECT_STAGE_ORDER = [
  "discovery",
  "architecture",
  "prototype",
  "development"
];
function isProjectStage(value) {
  return typeof value === "string" && PROJECT_STAGE_ORDER.includes(value);
}

// src/host/store/core.ts
var StudioStoreError = class extends Error {
  code;
  status;
  constructor(code, message, status = 400) {
    super(message);
    this.name = "StudioStoreError";
    this.code = code;
    this.status = status;
  }
};

// src/host/router/http.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var MAX_BODY_BYTES = 1024 * 1024;
var API_PREFIX = "/studio-api";
var HttpError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
};
function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
function sendJson(res, status, value) {
  const body = `${JSON.stringify(value)}
`;
  setSecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body).toString()
  });
  res.end(body);
}
function sendError(res, status, code, message) {
  const body = { error: { code, message } };
  sendJson(res, status, body);
}
function requestOf(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === void 0) continue;
    headers.set(
      name,
      Array.isArray(value) ? value.join(", ") : String(value)
    );
  }
  const host = req.headers.host ?? "127.0.0.1";
  return new Request(`http://${host}${req.url ?? "/"}`, {
    method: "GET",
    headers
  });
}
function assertJsonRequest(req) {
  const contentType = req.headers["content-type"];
  if (typeof contentType === "string" && !contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F application/json"
    );
  }
}
async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, "payload_too_large", "\u8BF7\u6C42\u4F53\u8D85\u8FC7 1 MB \u9650\u5236");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function verifyWebhookSignature(secret, raw, signature) {
  const provided = signature.replace(/^sha256=/u, "").trim();
  if (provided === "") return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, "payload_too_large", "\u8BF7\u6C42\u4F53\u8D85\u8FC7 1 MB \u9650\u5236");
    }
    chunks.push(buffer);
  }
  if (total === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_json", "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON \u5BF9\u8C61");
  }
}
function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "invalid_path", "\u8DEF\u5F84\u53C2\u6570\u7F16\u7801\u65E0\u6548");
  }
}

// src/host/router/inputs.ts
function asString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "invalid_input", `${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  }
  return value;
}
function asOptionalString(value, field) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string") {
    throw new HttpError(
      400,
      "invalid_input",
      `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF1B\u7559\u7A7A\u8BF7\u7701\u7565\u6216\u4F20 null`
    );
  }
  return value.trim() === "" ? void 0 : value;
}
function asStringArray(value, field) {
  if (value === void 0 || value === null) return void 0;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpError(
      400,
      "invalid_input",
      `${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4\uFF1B\u7559\u7A7A\u8BF7\u7701\u7565\u6216\u4F20 null`
    );
  }
  return value;
}
function asOptionalTimeout(value, field) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(400, "invalid_input", `${field} \u5FC5\u987B\u662F\u6B63\u6574\u6570\u79D2`);
  }
  return value;
}
function asRiskTier(value) {
  if (value === void 0 || value === null) return void 0;
  if (value === "trivial" || value === "normal" || value === "critical") return value;
  throw new HttpError(400, "invalid_input", "riskTier \u5FC5\u987B\u662F trivial/normal/critical");
}
function asTaskStatus(value) {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_input", "status \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
  }
  return value;
}
function asOptionalBudget(value, field) {
  if (value === void 0) return void 0;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(
      400,
      "invalid_input",
      `${field} \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570 token \u6570`
    );
  }
  return value === 0 ? null : value;
}
function asUpdateTriggerRules(body) {
  const result = {};
  if (body.enabled !== void 0) result.enabled = body.enabled === true;
  if (body.sources !== void 0) {
    result.sources = asStringArray(body.sources, "sources");
  }
  if (body.repos !== void 0) {
    result.repos = asStringArray(body.repos, "repos");
  }
  if (body.labels !== void 0) {
    result.labels = asStringArray(body.labels, "labels");
  }
  if (body.authors !== void 0) {
    result.authors = asStringArray(body.authors, "authors");
  }
  if (body.mention !== void 0) {
    result.mention = asOptionalString(body.mention, "mention");
  }
  return result;
}
function asCreateProjectFromTemplate(body) {
  const template = body.template;
  if (template !== "web" && template !== "game" && template !== "tool") {
    throw new HttpError(
      400,
      "invalid_input",
      "template \u5FC5\u987B\u662F web / game / tool"
    );
  }
  return {
    template,
    name: asString(body.name, "name"),
    description: asOptionalString(body.description, "description"),
    repoPath: asOptionalString(body.repoPath, "repoPath") ?? null
  };
}
function asCreateProject(body) {
  return {
    name: asString(body.name, "name"),
    description: asOptionalString(body.description, "description"),
    tokenBudget: asOptionalBudget(body.tokenBudget, "tokenBudget")
  };
}
function asUpdateProject(body) {
  const optionalPath = (value, field) => value === void 0 ? void 0 : value === null ? null : asString(value, field);
  return {
    repoPath: optionalPath(body.repoPath, "repoPath"),
    prdPath: optionalPath(body.prdPath, "prdPath"),
    invariantsPath: optionalPath(
      body.invariantsPath,
      "invariantsPath"
    ),
    modulesPath: optionalPath(body.modulesPath, "modulesPath")
  };
}
function asCreateModule(body) {
  return {
    name: asString(body.name, "name"),
    responsibility: asOptionalString(body.responsibility, "responsibility"),
    contractPath: asOptionalString(body.contractPath, "contractPath"),
    contractText: asOptionalString(body.contractText, "contractText"),
    allowedPaths: asStringArray(body.allowedPaths, "allowedPaths"),
    forbiddenPaths: asStringArray(body.forbiddenPaths, "forbiddenPaths"),
    dependsOn: asStringArray(body.dependsOn, "dependsOn")
  };
}
function asUpdateModule(body) {
  return {
    responsibility: asOptionalString(body.responsibility, "responsibility"),
    contractPath: body.contractPath === null ? null : asOptionalString(body.contractPath, "contractPath"),
    contractText: asOptionalString(body.contractText, "contractText"),
    allowedPaths: asStringArray(body.allowedPaths, "allowedPaths"),
    forbiddenPaths: asStringArray(body.forbiddenPaths, "forbiddenPaths"),
    dependsOn: asStringArray(body.dependsOn, "dependsOn")
  };
}
function asCreateDecision(body) {
  return {
    title: asString(body.title, "title"),
    context: asOptionalString(body.context, "context"),
    recommendation: asOptionalString(body.recommendation, "recommendation"),
    taskId: body.taskId === null || body.taskId === void 0 ? null : asString(body.taskId, "taskId"),
    reversible: body.reversible !== false
  };
}
function asDecideDecision(body) {
  if (body.status !== "approved" && body.status !== "rejected") {
    throw new HttpError(
      400,
      "invalid_input",
      "status \u53EA\u80FD\u662F approved \u6216 rejected"
    );
  }
  return {
    status: body.status,
    decision: asOptionalString(body.decision, "decision"),
    note: asOptionalString(body.note, "note")
  };
}
function asAgentExecutor(value) {
  if (value === void 0) return void 0;
  if (value === "dsh" || value === "claude-code" || value === "codex") {
    return value;
  }
  throw new HttpError(
    400,
    "invalid_input",
    "executor \u5FC5\u987B\u662F dsh / claude-code / codex"
  );
}
function asPrototypeDemoResult(value) {
  if (value === "passed" || value === "failed") return value;
  throw new HttpError(
    400,
    "invalid_input",
    "result \u5FC5\u987B\u662F passed \u6216 failed"
  );
}
function asCreatePrototypeDemo(body) {
  return {
    title: asString(body.title, "title"),
    entry: asOptionalString(body.entry, "entry"),
    startCommand: asOptionalString(body.startCommand, "startCommand"),
    steps: asOptionalString(body.steps, "steps"),
    result: asPrototypeDemoResult(body.result),
    screenshotPath: asOptionalString(body.screenshotPath, "screenshotPath"),
    notes: asOptionalString(body.notes, "notes")
  };
}
function asUpdatePrototypeDemo(body) {
  return {
    title: body.title === void 0 ? void 0 : asString(body.title, "title"),
    entry: asOptionalString(body.entry, "entry"),
    startCommand: asOptionalString(body.startCommand, "startCommand"),
    steps: asOptionalString(body.steps, "steps"),
    result: body.result === void 0 ? void 0 : asPrototypeDemoResult(body.result),
    screenshotPath: asOptionalString(body.screenshotPath, "screenshotPath"),
    notes: asOptionalString(body.notes, "notes")
  };
}
function asCreateProviderProfile(body) {
  return {
    name: asString(body.name, "name"),
    executor: asAgentExecutor(body.executor),
    provider: asOptionalString(body.provider, "provider"),
    model: asOptionalString(body.model, "model"),
    note: asOptionalString(body.note, "note")
  };
}
function asUpdateProviderProfile(body) {
  return {
    name: body.name === void 0 ? void 0 : asString(body.name, "name"),
    executor: asAgentExecutor(body.executor),
    provider: asOptionalString(body.provider, "provider"),
    model: asOptionalString(body.model, "model"),
    note: asOptionalString(body.note, "note")
  };
}
function asCreateRole(body) {
  return {
    name: asString(body.name, "name"),
    title: asOptionalString(body.title, "title"),
    mission: asOptionalString(body.mission, "mission"),
    responsibilities: asStringArray(body.responsibilities, "responsibilities"),
    providerProfileId: body.providerProfileId === null ? null : asOptionalString(body.providerProfileId, "providerProfileId"),
    model: asOptionalString(body.model, "model") ?? null,
    executor: asAgentExecutor(body.executor),
    tokenBudget: asOptionalBudget(body.tokenBudget, "tokenBudget"),
    dailyTokenBudget: asOptionalBudget(
      body.dailyTokenBudget,
      "dailyTokenBudget"
    )
  };
}
function asCreateTask(body) {
  const owner = body.ownerRoleId === null || body.ownerRoleId === void 0 ? null : asString(body.ownerRoleId, "ownerRoleId");
  const reviewer = body.reviewerRoleId === null || body.reviewerRoleId === void 0 ? null : asString(body.reviewerRoleId, "reviewerRoleId");
  const priority = body.priority === "P0" || body.priority === "P1" || body.priority === "P2" ? body.priority : "P1";
  const kind = body.kind === "fix" || body.kind === "new" ? body.kind : void 0;
  return {
    title: asString(body.title, "title"),
    goal: asOptionalString(body.goal, "goal"),
    priority,
    ownerRoleId: owner,
    reviewerRoleId: reviewer,
    acceptance: asStringArray(body.acceptance, "acceptance"),
    branch: asOptionalString(body.branch, "branch") ?? null,
    verifyCommand: asOptionalString(body.verifyCommand, "verifyCommand") ?? null,
    module: asOptionalString(body.module, "module") ?? null,
    contractRef: asOptionalString(body.contractRef, "contractRef") ?? null,
    requirementRefs: asStringArray(body.requirementRefs, "requirementRefs") ?? [],
    timeoutSeconds: asOptionalTimeout(body.timeoutSeconds, "timeoutSeconds"),
    riskTier: asRiskTier(body.riskTier),
    diagnosis: asOptionalString(body.diagnosis, "diagnosis") ?? "",
    plan: asOptionalString(body.plan, "plan") ?? "",
    kind,
    integration: body.integration === true,
    originTaskId: asOptionalString(body.originTaskId, "originTaskId") ?? null
  };
}
function asFreezeKind(value) {
  if (value === "prd" || value === "architecture") return value;
  throw new HttpError(400, "invalid_input", "kind \u5FC5\u987B\u662F prd/architecture");
}
function asCreateFreeze(body) {
  const checklist = body.checklist;
  if (checklist !== void 0 && (!Array.isArray(checklist) || !checklist.every(
    (item) => typeof item === "object" && item !== null && typeof item.id === "string" && typeof item.text === "string" && typeof item.done === "boolean"
  ))) {
    throw new HttpError(400, "invalid_input", "checklist \u65E0\u6548");
  }
  return {
    kind: asFreezeKind(body.kind),
    version: asString(body.version, "version"),
    docPath: asString(body.docPath, "docPath"),
    domainModelPath: body.domainModelPath === null || body.domainModelPath === void 0 ? null : asOptionalString(body.domainModelPath, "domainModelPath") ?? null,
    summary: asOptionalString(body.summary, "summary") ?? "",
    openQuestions: asStringArray(body.openQuestions, "openQuestions") ?? [],
    checklist,
    waiverReason: body.waiverReason === null || body.waiverReason === void 0 ? null : asOptionalString(body.waiverReason, "waiverReason") ?? null
  };
}
function asRequirementDecision(body) {
  const status = body.status;
  if (status !== void 0 && status !== "accepted" && status !== "rejected" && status !== "pending") {
    throw new HttpError(400, "invalid_input", "status \u65E0\u6548");
  }
  return {
    title: asString(body.title, "title"),
    source: asString(body.source, "source"),
    recommendation: asString(body.recommendation, "recommendation"),
    status,
    rationale: asOptionalString(body.rationale, "rationale") ?? "",
    freezeId: body.freezeId === null || body.freezeId === void 0 ? null : asOptionalString(body.freezeId, "freezeId") ?? null
  };
}
function asCreateFreezeChangeRequest(body) {
  return {
    freezeId: asString(body.freezeId, "freezeId"),
    title: asString(body.title, "title"),
    reason: asString(body.reason, "reason"),
    impact: asOptionalString(body.impact, "impact") ?? ""
  };
}
function asUpdateTask(body) {
  const result = {};
  if (body.title !== void 0) result.title = asString(body.title, "title");
  if (body.goal !== void 0) result.goal = asOptionalString(body.goal, "goal");
  if (body.priority !== void 0) {
    if (body.priority !== "P0" && body.priority !== "P1" && body.priority !== "P2") {
      throw new HttpError(400, "invalid_input", "priority \u65E0\u6548");
    }
    result.priority = body.priority;
  }
  if (body.ownerRoleId !== void 0) {
    result.ownerRoleId = body.ownerRoleId === null ? null : asString(body.ownerRoleId, "ownerRoleId");
  }
  if (body.reviewerRoleId !== void 0) {
    result.reviewerRoleId = body.reviewerRoleId === null ? null : asString(body.reviewerRoleId, "reviewerRoleId");
  }
  if (body.acceptance !== void 0) {
    if (!Array.isArray(body.acceptance)) {
      throw new HttpError(400, "invalid_input", "acceptance \u5FC5\u987B\u662F\u6570\u7EC4");
    }
    result.acceptance = body.acceptance;
  }
  if (body.evidence !== void 0) {
    if (!Array.isArray(body.evidence)) {
      throw new HttpError(400, "invalid_input", "evidence \u5FC5\u987B\u662F\u6570\u7EC4");
    }
    result.evidence = body.evidence;
  }
  if (body.branch !== void 0) {
    result.branch = body.branch === null ? null : asOptionalString(body.branch, "branch");
  }
  if (body.verifyCommand !== void 0) {
    result.verifyCommand = body.verifyCommand === null ? null : asOptionalString(body.verifyCommand, "verifyCommand");
  }
  if (body.module !== void 0) {
    result.module = body.module === null ? null : asOptionalString(body.module, "module");
  }
  if (body.contractRef !== void 0) {
    result.contractRef = body.contractRef === null ? null : asOptionalString(body.contractRef, "contractRef");
  }
  if (body.requirementRefs !== void 0) {
    result.requirementRefs = asStringArray(body.requirementRefs, "requirementRefs") ?? [];
  }
  if (body.timeoutSeconds !== void 0) {
    result.timeoutSeconds = asOptionalTimeout(
      body.timeoutSeconds,
      "timeoutSeconds"
    );
  }
  if (body.riskTier !== void 0) {
    result.riskTier = asRiskTier(body.riskTier);
  }
  if (body.kind !== void 0) {
    if (body.kind !== "new" && body.kind !== "fix") {
      throw new HttpError(400, "invalid_input", "kind \u65E0\u6548");
    }
    result.kind = body.kind;
  }
  if (body.diagnosis !== void 0) {
    result.diagnosis = asOptionalString(body.diagnosis, "diagnosis");
  }
  if (body.plan !== void 0) {
    result.plan = asOptionalString(body.plan, "plan");
  }
  if (body.integration !== void 0) {
    if (typeof body.integration !== "boolean") {
      throw new HttpError(400, "invalid_input", "integration \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
    }
    result.integration = body.integration;
  }
  if (body.docsSynced !== void 0) {
    if (typeof body.docsSynced !== "boolean") {
      throw new HttpError(400, "invalid_input", "docsSynced \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
    }
    result.docsSynced = body.docsSynced;
  }
  return result;
}
function asMergeRisk(value) {
  if (value === void 0) return "medium";
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new HttpError(400, "invalid_input", "risk \u5FC5\u987B\u662F low/medium/high");
}
function asCreateMergeProposal(body) {
  return {
    summary: asString(body.summary, "summary"),
    rollback: asString(body.rollback, "rollback"),
    risk: asMergeRisk(body.risk),
    base: asOptionalString(body.base, "base"),
    branch: asOptionalString(body.branch, "branch")
  };
}
function asNote(body) {
  return asOptionalString(body.note, "note");
}
function asTriggerSource(value) {
  if (value === "manual" || value === "github" || value === "ci" || value === "im" || value === "email") {
    return value;
  }
  throw new HttpError(
    400,
    "invalid_input",
    "source \u5FC5\u987B\u662F manual/github/ci/im/email"
  );
}
function asCreateTrigger(body) {
  return {
    source: asTriggerSource(body.source),
    externalId: asOptionalString(body.externalId, "externalId"),
    threadKey: asOptionalString(body.threadKey, "threadKey"),
    title: asString(body.title, "title"),
    body: asOptionalString(body.body, "body"),
    url: asOptionalString(body.url, "url")
  };
}
function asAcceptTrigger(body) {
  const priority = body.priority === "P0" || body.priority === "P1" || body.priority === "P2" ? body.priority : void 0;
  return {
    acceptance: asStringArray(body.acceptance, "acceptance"),
    ownerRoleId: body.ownerRoleId === null ? null : asOptionalString(body.ownerRoleId, "ownerRoleId"),
    reviewerRoleId: body.reviewerRoleId === null ? null : asOptionalString(body.reviewerRoleId, "reviewerRoleId"),
    priority
  };
}
function asCreateWorkshop(body) {
  return {
    title: asString(body.title, "title"),
    topic: asOptionalString(body.topic, "topic"),
    stage: body.stage === void 0 ? void 0 : asProjectStage(body.stage),
    participantRoleIds: asStringArray(
      body.participantRoleIds,
      "participantRoleIds"
    )
  };
}
function asWorkshopNote(body) {
  return {
    roleId: asString(body.roleId, "roleId"),
    summary: asString(body.summary, "summary"),
    objections: asStringArray(body.objections, "objections"),
    risks: asStringArray(body.risks, "risks"),
    recommendation: asOptionalString(body.recommendation, "recommendation")
  };
}
function asProjectStage(value) {
  if (isProjectStage(value)) return value;
  throw new HttpError(
    400,
    "invalid_input",
    "stage \u5FC5\u987B\u662F discovery/architecture/prototype/development"
  );
}
function asStageGateInput(body) {
  const input = {};
  if (body.checklist !== void 0) {
    input.checklist = body.checklist;
  }
  if (body.artifacts !== void 0) {
    input.artifacts = body.artifacts;
  }
  if (body.note !== void 0) {
    input.note = asOptionalString(body.note, "note");
  }
  return input;
}
function asApproveStageGateInput(body) {
  return {
    ...asStageGateInput(body),
    waiverReason: asOptionalString(body.waiverReason, "waiverReason")
  };
}

// src/host/router/auth.ts
import { timingSafeEqual as timingSafeEqual2 } from "node:crypto";
function parseRoute(req) {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://studio.local");
  return { method, pathname: url.pathname, url };
}
function assertAuthorized(req, token) {
  const headerToken = req.headers["x-studio-token"];
  const authorization = req.headers.authorization;
  const bearer = typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const candidate = typeof headerToken === "string" ? headerToken.trim() : bearer;
  const expected = Buffer.from(token);
  const supplied = Buffer.from(candidate);
  if (candidate === "" || supplied.length !== expected.length || !timingSafeEqual2(supplied, expected)) {
    throw new HttpError(401, "unauthorized", "\u7F3A\u5C11\u6216\u65E0\u6548\u7684 Studio \u8BBF\u95EE\u4EE4\u724C");
  }
}
function allowRate(buckets, bucket, req, limit) {
  const key = `${bucket}:${req.socket?.remoteAddress ?? "unknown"}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (current === void 0 || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 6e4 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
function requireMethod(parsed, methods) {
  if (!methods.includes(parsed.method)) {
    throw new HttpError(
      405,
      "method_not_allowed",
      `\u53EA\u652F\u6301 ${methods.join(", ")}`
    );
  }
}

// src/host/router/errors.ts
function handleRouterError(res, error) {
  if (error instanceof StudioStoreError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }
  if (error instanceof HttpError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  sendError(res, 500, "internal_error", message);
}

// src/host/router.ts
var StudioRouter = class {
  store;
  token;
  dshVersion;
  compatibility;
  connection;
  bootNonce;
  rateBuckets = /* @__PURE__ */ new Map();
  getBootPayload;
  dispatchTask;
  verifyTask;
  reviewTask;
  executeMerge;
  rollbackMerge;
  writeAdr;
  exportProjectBundle;
  importProjectBundle;
  readProjectDoc;
  runWorkshop;
  summarizeWorkshop;
  probeProviderProfile;
  constructor(options) {
    this.store = options.store;
    this.token = options.token;
    this.dshVersion = options.dshVersion;
    this.compatibility = options.compatibility;
    this.connection = options.connection;
    this.bootNonce = options.bootNonce;
    this.getBootPayload = options.getBootPayload;
    this.dispatchTask = options.dispatchTask;
    this.verifyTask = options.verifyTask;
    this.reviewTask = options.reviewTask;
    this.executeMerge = options.executeMerge;
    this.rollbackMerge = options.rollbackMerge;
    this.writeAdr = options.writeAdr;
    this.exportProjectBundle = options.exportProjectBundle;
    this.importProjectBundle = options.importProjectBundle;
    this.readProjectDoc = options.readProjectDoc;
    this.runWorkshop = options.runWorkshop;
    this.summarizeWorkshop = options.summarizeWorkshop;
    this.probeProviderProfile = options.probeProviderProfile;
  }
  async handle(req, res) {
    const parsed = parseRoute(req);
    if (parsed.pathname === `${API_PREFIX}/health`) {
      if (parsed.method !== "GET") {
        throw new HttpError(405, "method_not_allowed", "\u53EA\u652F\u6301 GET");
      }
      sendJson(res, 200, {
        ok: true,
        service: "dsh-studio",
        pluginVersion: STUDIO_PLUGIN_VERSION,
        dshVersion: this.dshVersion,
        compatibility: this.compatibility,
        time: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/boot`) {
      requireMethod(parsed, ["GET"]);
      if (!allowRate(this.rateBuckets, "boot", req, 30)) {
        sendError(res, 429, "rate_limited", "\u542F\u52A8\u53C2\u6570\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
        return;
      }
      const origin = req.headers.origin;
      if (origin === "null" || origin?.startsWith("file://")) {
        sendError(
          res,
          401,
          "unauthorized",
          "\u672C\u5730\u6587\u4EF6\u9875\u9762\u4E0D\u80FD\u83B7\u53D6 Studio \u542F\u52A8\u53C2\u6570"
        );
        return;
      }
      const desktopOrigin = typeof origin === "string" && origin.startsWith("dsh-app://");
      if (desktopOrigin) {
        const header = req.headers["x-dsh-studio-nonce"];
        const supplied = Array.isArray(header) ? header[0] : header;
        const expected = this.bootNonce;
        const valid = typeof supplied === "string" && supplied.length === expected.length && timingSafeEqual3(Buffer.from(supplied), Buffer.from(expected));
        if (!valid) {
          sendError(
            res,
            401,
            "boot_nonce_required",
            "\u684C\u9762\u542F\u52A8\u51ED\u636E\u7F3A\u5931\u6216\u65E0\u6548\uFF1B\u8BF7\u5B8C\u5168\u9000\u51FA\u5E76\u91CD\u542F DSH \u540E\u518D\u8BD5"
          );
          return;
        }
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      } else {
        const admission = this.connection.admit(requestOf(req));
        if (admission.rejection !== void 0) {
          sendError(
            res,
            admission.rejection,
            "unauthorized",
            "DSH \u4F1A\u8BDD\u6CA1\u6709\u901A\u8FC7\u8BA4\u8BC1\uFF0C\u65E0\u6CD5\u83B7\u53D6 Studio \u542F\u52A8\u53C2\u6570"
          );
          return;
        }
      }
      sendJson(res, 200, this.getBootPayload());
      return;
    }
    const webhookMatch = /^\/studio-api\/webhooks\/([^/]+)\/([^/]+)$/.exec(parsed.pathname);
    if (webhookMatch !== null) {
      requireMethod(parsed, ["POST"]);
      const projectId = decodeSegment(webhookMatch[1] ?? "");
      const source = webhookMatch[2] ?? "";
      if (source !== "github" && source !== "ci" && source !== "im") {
        throw new HttpError(404, "not_found", "\u4E0D\u652F\u6301\u7684 Webhook \u6765\u6E90");
      }
      const secret = process.env["DSH_STUDIO_WEBHOOK_SECRET"] ?? "";
      if (secret === "") {
        throw new HttpError(
          503,
          "webhook_not_configured",
          "\u672A\u8BBE\u7F6E DSH_STUDIO_WEBHOOK_SECRET\uFF0CWebhook \u5DF2\u62D2\u7EDD"
        );
      }
      const raw = await readRawBody(req);
      const signature = (typeof req.headers["x-hub-signature-256"] === "string" ? req.headers["x-hub-signature-256"] : "") || (typeof req.headers["x-studio-signature"] === "string" ? req.headers["x-studio-signature"] : "");
      if (!verifyWebhookSignature(secret, raw, signature)) {
        throw new HttpError(401, "invalid_signature", "Webhook \u7B7E\u540D\u65E0\u6548");
      }
      let payload;
      try {
        const parsedBody = JSON.parse(raw.toString("utf8") || "{}");
        if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
          throw new Error("not an object");
        }
        payload = parsedBody;
      } catch {
        throw new HttpError(400, "invalid_json", "Webhook \u8BF7\u6C42\u4F53\u4E0D\u662F JSON");
      }
      const result = await this.store.ingestWebhook(projectId, source, payload);
      sendJson(res, 202, { ok: true, ...result });
      return;
    }
    assertAuthorized(req, this.token);
    if (parsed.pathname === `${API_PREFIX}/bootstrap`) {
      requireMethod(parsed, ["GET"]);
      const projectId = parsed.url.searchParams.get("projectId") ?? void 0;
      const data = await this.store.bootstrap(projectId);
      data.app.dshVersion = this.dshVersion;
      data.app.compatibility = this.compatibility;
      data.app.warning = this.store.getWarning();
      sendJson(res, 200, data);
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/export`) {
      requireMethod(parsed, ["GET"]);
      const state = await this.store.exportState();
      sendJson(res, 200, {
        ok: true,
        schemaVersion: state.schemaVersion,
        pluginVersion: STUDIO_PLUGIN_VERSION,
        dshVersion: this.dshVersion,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        state
      });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/settings`) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const state = await this.store.updateCompanyName(
        asString(body.companyName, "companyName")
      );
      sendJson(res, 200, {
        ok: true,
        companyName: state.companyName
      });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/projects/bundle/import`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const imported = await this.importProjectBundle(
        asString(body.archivePath, "archivePath"),
        asString(body.targetPath, "targetPath")
      );
      sendJson(res, 200, { ok: true, ...imported });
      return;
    }
    const projectBundle = /^\/studio-api\/projects\/([^/]+)\/bundle$/.exec(parsed.pathname);
    if (projectBundle !== null) {
      requireMethod(parsed, ["GET"]);
      const bundle = await this.exportProjectBundle(
        decodeSegment(projectBundle[1] ?? "")
      );
      res.statusCode = 200;
      res.setHeader("content-type", "application/gzip");
      res.setHeader(
        "content-disposition",
        `attachment; filename="${bundle.filename}"`
      );
      res.setHeader("content-length", String(bundle.bytes.length));
      res.end(bundle.bytes);
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/import`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const state = await this.store.importState(body.state);
      sendJson(res, 200, {
        ok: true,
        schemaVersion: state.schemaVersion
      });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/projects/from-template`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const project = await this.store.createProjectFromTemplate(
        asCreateProjectFromTemplate(await readJson(req))
      );
      sendJson(res, 201, { ok: true, project });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/projects`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const project = await this.store.createProject(
        asCreateProject(await readJson(req))
      );
      sendJson(res, 201, { ok: true, project });
      return;
    }
    const triggerRulesMatch = /^\/studio-api\/projects\/([^/]+)\/trigger-rules$/.exec(
      parsed.pathname
    );
    if (triggerRulesMatch !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const rules = await this.store.updateTriggerRules(
        decodeSegment(triggerRulesMatch[1] ?? ""),
        asUpdateTriggerRules(await readJson(req))
      );
      sendJson(res, 200, { ok: true, rules });
      return;
    }
    const prototypeDemos = /^\/studio-api\/projects\/([^/]+)\/prototype-demos$/.exec(
      parsed.pathname
    );
    if (prototypeDemos !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const demo = await this.store.createPrototypeDemo(
        asCreatePrototypeDemo(await readJson(req)),
        decodeSegment(prototypeDemos[1] ?? "")
      );
      sendJson(res, 201, { ok: true, demo });
      return;
    }
    const prototypeDemo = /^\/studio-api\/projects\/([^/]+)\/prototype-demos\/([^/]+)$/.exec(
      parsed.pathname
    );
    if (prototypeDemo !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const demo = await this.store.updatePrototypeDemo(
        decodeSegment(prototypeDemo[2] ?? ""),
        asUpdatePrototypeDemo(await readJson(req))
      );
      sendJson(res, 200, { ok: true, demo });
      return;
    }
    const freezeMatch = /^\/studio-api\/projects\/([^/]+)\/freezes$/.exec(parsed.pathname);
    if (freezeMatch !== null) {
      const projectId = decodeSegment(freezeMatch[1] ?? "");
      requireMethod(parsed, ["GET", "POST"]);
      if (parsed.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          freezes: this.store.listFreezes(projectId)
        });
        return;
      }
      assertJsonRequest(req);
      const freeze = await this.store.createFreeze(
        projectId,
        asCreateFreeze(await readJson(req))
      );
      sendJson(res, 201, { ok: true, freeze });
      return;
    }
    const requirementDecisionMatch = /^\/studio-api\/projects\/([^/]+)\/requirement-decisions$/.exec(
      parsed.pathname
    );
    if (requirementDecisionMatch !== null) {
      const projectId = decodeSegment(requirementDecisionMatch[1] ?? "");
      requireMethod(parsed, ["GET", "POST"]);
      if (parsed.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          decisions: this.store.listRequirementDecisions(projectId)
        });
        return;
      }
      assertJsonRequest(req);
      const decision = this.store.createRequirementDecision(
        projectId,
        asRequirementDecision(await readJson(req))
      );
      sendJson(res, 201, { ok: true, decision });
      return;
    }
    const freezeChangeMatch = /^\/studio-api\/projects\/([^/]+)\/freeze-change-requests$/.exec(
      parsed.pathname
    );
    if (freezeChangeMatch !== null) {
      const projectId = decodeSegment(freezeChangeMatch[1] ?? "");
      requireMethod(parsed, ["GET", "POST"]);
      if (parsed.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          requests: this.store.listFreezeChangeRequests(projectId)
        });
        return;
      }
      assertJsonRequest(req);
      const request = this.store.createFreezeChangeRequest(
        projectId,
        asCreateFreezeChangeRequest(await readJson(req))
      );
      sendJson(res, 201, { ok: true, request });
      return;
    }
    const freezeChangeDecideMatch = /^\/studio-api\/projects\/([^/]+)\/freeze-change-requests\/([^/]+)\/decide$/.exec(
      parsed.pathname
    );
    if (freezeChangeDecideMatch !== null) {
      const projectId = decodeSegment(freezeChangeDecideMatch[1] ?? "");
      const requestId = decodeSegment(freezeChangeDecideMatch[2] ?? "");
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      if (body.status !== "accepted" && body.status !== "rejected") {
        throw new HttpError(400, "invalid_input", "status \u65E0\u6548");
      }
      const request = this.store.decideFreezeChangeRequest(
        projectId,
        requestId,
        body.status
      );
      sendJson(res, 200, { ok: true, request });
      return;
    }
    const projectMatch = /^\/studio-api\/projects\/([^/]+)$/.exec(parsed.pathname);
    if (projectMatch !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const project = await this.store.updateProject(
        decodeSegment(projectMatch[1] ?? ""),
        asUpdateProject(await readJson(req))
      );
      sendJson(res, 200, { ok: true, project });
      return;
    }
    const stageGate = /^\/studio-api\/projects\/([^/]+)\/stage-gates\/([^/]+)$/.exec(
      parsed.pathname
    );
    if (stageGate !== null) {
      const projectId = decodeSegment(stageGate[1] ?? "");
      const stage = asProjectStage(decodeSegment(stageGate[2] ?? ""));
      if (parsed.method === "GET") {
        const gate2 = await this.store.getStageGate(projectId, stage);
        sendJson(res, 200, { ok: true, gate: gate2 });
        return;
      }
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const gate = await this.store.updateStageGate(
        projectId,
        stage,
        asStageGateInput(await readJson(req))
      );
      sendJson(res, 200, { ok: true, gate });
      return;
    }
    const stageGateApprove = /^\/studio-api\/projects\/([^/]+)\/stage-gates\/([^/]+)\/approve$/.exec(
      parsed.pathname
    );
    if (stageGateApprove !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const gate = await this.store.approveStageGate(
        decodeSegment(stageGateApprove[1] ?? ""),
        asProjectStage(decodeSegment(stageGateApprove[2] ?? "")),
        asApproveStageGateInput(await readJson(req))
      );
      sendJson(res, 200, { ok: true, gate });
      return;
    }
    const stageGateReject = /^\/studio-api\/projects\/([^/]+)\/stage-gates\/([^/]+)\/reject$/.exec(
      parsed.pathname
    );
    if (stageGateReject !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const gate = await this.store.rejectStageGate(
        decodeSegment(stageGateReject[1] ?? ""),
        asProjectStage(decodeSegment(stageGateReject[2] ?? "")),
        asNote(body) ?? ""
      );
      sendJson(res, 200, { ok: true, gate });
      return;
    }
    const selectProject2 = /^\/studio-api\/projects\/([^/]+)\/select$/.exec(
      parsed.pathname
    );
    if (selectProject2 !== null) {
      requireMethod(parsed, ["POST"]);
      const project = await this.store.selectProject(
        decodeSegment(selectProject2[1] ?? "")
      );
      sendJson(res, 200, { ok: true, project });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/triggers`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const trigger = await this.store.ingestTrigger(
        asCreateTrigger(await readJson(req))
      );
      sendJson(res, 201, { ok: true, trigger });
      return;
    }
    const triggerAccept = /^\/studio-api\/triggers\/([^/]+)\/accept$/.exec(parsed.pathname);
    if (triggerAccept !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const result = await this.store.acceptTrigger(
        decodeSegment(triggerAccept[1] ?? ""),
        asAcceptTrigger(await readJson(req))
      );
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    const triggerIgnore = /^\/studio-api\/triggers\/([^/]+)\/ignore$/.exec(parsed.pathname);
    if (triggerIgnore !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const trigger = await this.store.ignoreTrigger(
        decodeSegment(triggerIgnore[1] ?? ""),
        asNote(body) ?? ""
      );
      sendJson(res, 200, { ok: true, trigger });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/provider-profiles`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const profile = await this.store.createProviderProfile(
        asCreateProviderProfile(await readJson(req))
      );
      sendJson(res, 201, { ok: true, profile });
      return;
    }
    const providerProbe = /^\/studio-api\/provider-profiles\/([^/]+)\/probe$/.exec(
      parsed.pathname
    );
    if (providerProbe !== null) {
      requireMethod(parsed, ["POST"]);
      const result = await this.probeProviderProfile(
        decodeSegment(providerProbe[1] ?? "")
      );
      sendJson(res, 200, { ok: true, probe: result });
      return;
    }
    const providerReassign = /^\/studio-api\/provider-profiles\/([^/]+)\/reassign$/.exec(
      parsed.pathname
    );
    if (providerReassign !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const result = await this.store.reassignProviderProfile(
        decodeSegment(providerReassign[1] ?? ""),
        asString(body.toProfileId, "toProfileId")
      );
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    const providerProfileMatch = /^\/studio-api\/provider-profiles\/([^/]+)$/.exec(parsed.pathname);
    if (providerProfileMatch !== null) {
      const profileId = decodeSegment(providerProfileMatch[1] ?? "");
      if (req.method === "PATCH") {
        assertJsonRequest(req);
        const profile = await this.store.updateProviderProfile(
          profileId,
          asUpdateProviderProfile(await readJson(req))
        );
        sendJson(res, 200, { ok: true, profile });
        return;
      }
      if (req.method === "DELETE") {
        await this.store.deleteProviderProfile(profileId);
        sendJson(res, 200, { ok: true });
        return;
      }
      throw new HttpError(405, "method_not_allowed", "Method not allowed");
    }
    if (parsed.pathname === `${API_PREFIX}/workshops`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const workshop = await this.store.createWorkshop(
        asCreateWorkshop(await readJson(req))
      );
      sendJson(res, 201, { ok: true, workshop });
      return;
    }
    const workshopNote = /^\/studio-api\/workshops\/([^/]+)\/notes$/.exec(parsed.pathname);
    if (workshopNote !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const workshop = await this.store.addWorkshopNote(
        decodeSegment(workshopNote[1] ?? ""),
        asWorkshopNote(await readJson(req))
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }
    const workshopSynthesize = /^\/studio-api\/workshops\/([^/]+)\/synthesize$/.exec(parsed.pathname);
    if (workshopSynthesize !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const workshop = await this.store.synthesizeWorkshop(
        decodeSegment(workshopSynthesize[1] ?? ""),
        asString(body.synthesis, "synthesis")
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }
    const workshopDecide = /^\/studio-api\/workshops\/([^/]+)\/decide$/.exec(parsed.pathname);
    if (workshopDecide !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const workshop = await this.store.decideWorkshop(
        decodeSegment(workshopDecide[1] ?? ""),
        asString(body.decision, "decision")
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }
    const workshopRun = /^\/studio-api\/workshops\/([^/]+)\/run$/.exec(parsed.pathname);
    if (workshopRun !== null) {
      requireMethod(parsed, ["POST"]);
      const workshop = await this.runWorkshop(
        decodeSegment(workshopRun[1] ?? "")
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }
    const workshopSummarize = /^\/studio-api\/workshops\/([^/]+)\/summarize$/.exec(
      parsed.pathname
    );
    if (workshopSummarize !== null) {
      requireMethod(parsed, ["POST"]);
      const workshop = await this.summarizeWorkshop(
        decodeSegment(workshopSummarize[1] ?? "")
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/roles`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const role = await this.store.createRole(
        asCreateRole(await readJson(req))
      );
      sendJson(res, 201, { ok: true, role });
      return;
    }
    const roleMatch = /^\/studio-api\/roles\/([^/]+)$/.exec(parsed.pathname);
    if (roleMatch !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const role = await this.store.updateRole(
        decodeSegment(roleMatch[1] ?? ""),
        {
          name: asOptionalString(body.name, "name"),
          title: asOptionalString(body.title, "title"),
          mission: asOptionalString(body.mission, "mission"),
          responsibilities: asStringArray(
            body.responsibilities,
            "responsibilities"
          ),
          providerProfileId: body.providerProfileId === null ? null : asOptionalString(body.providerProfileId, "providerProfileId"),
          model: asOptionalString(body.model, "model"),
          executor: asAgentExecutor(body.executor),
          tokenBudget: asOptionalBudget(body.tokenBudget, "tokenBudget"),
          dailyTokenBudget: asOptionalBudget(
            body.dailyTokenBudget,
            "dailyTokenBudget"
          )
        }
      );
      sendJson(res, 200, { ok: true, role });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/tasks`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const task = await this.store.createTask(
        asCreateTask(await readJson(req))
      );
      sendJson(res, 201, { ok: true, task });
      return;
    }
    const taskTransition = /^\/studio-api\/tasks\/([^/]+)\/transition$/.exec(parsed.pathname);
    if (taskTransition !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const task = await this.store.transitionTask(
        decodeSegment(taskTransition[1] ?? ""),
        asTaskStatus(body.status)
      );
      sendJson(res, 200, { ok: true, task });
      return;
    }
    const taskDispatch = /^\/studio-api\/tasks\/([^/]+)\/dispatch$/.exec(parsed.pathname);
    if (taskDispatch !== null) {
      requireMethod(parsed, ["POST"]);
      const run = await this.dispatchTask(
        decodeSegment(taskDispatch[1] ?? "")
      );
      sendJson(res, 202, { ok: true, run });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/project-docs`) {
      requireMethod(parsed, ["GET"]);
      const docPath = parsed.url.searchParams.get("path");
      if (docPath === null || docPath.trim() === "") {
        throw new HttpError(400, "invalid_input", "path \u4E0D\u80FD\u4E3A\u7A7A");
      }
      const doc = await this.readProjectDoc(docPath);
      sendJson(res, 200, { ok: true, doc });
      return;
    }
    const taskVerify = /^\/studio-api\/tasks\/([^/]+)\/verify$/.exec(parsed.pathname);
    if (taskVerify !== null) {
      requireMethod(parsed, ["POST"]);
      if (!allowRate(this.rateBuckets, "verify", req, 30)) {
        throw new HttpError(
          429,
          "rate_limited",
          "\u9A8C\u8BC1\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5"
        );
      }
      assertJsonRequest(req);
      const body = await readJson(req);
      if (body.command !== void 0 && body.command !== null) {
        throw new HttpError(
          400,
          "verify_command_override",
          "\u9A8C\u8BC1\u547D\u4EE4\u53EA\u80FD\u5728\u4EFB\u52A1\u91CC\u4FEE\u6539\uFF1B/verify \u4E0D\u518D\u63A5\u53D7\u4E34\u65F6\u547D\u4EE4"
        );
      }
      const verification = await this.verifyTask(
        decodeSegment(taskVerify[1] ?? "")
      );
      sendJson(res, 200, { ok: true, verification });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/modules`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const module = await this.store.createModule(
        asCreateModule(await readJson(req))
      );
      sendJson(res, 201, { ok: true, module });
      return;
    }
    const moduleMatch = /^\/studio-api\/modules\/([^/]+)$/.exec(
      parsed.pathname
    );
    if (moduleMatch !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const module = await this.store.updateModule(
        decodeSegment(moduleMatch[1] ?? ""),
        asUpdateModule(await readJson(req))
      );
      sendJson(res, 200, { ok: true, module });
      return;
    }
    const taskReview = /^\/studio-api\/tasks\/([^/]+)\/review$/.exec(parsed.pathname);
    if (taskReview !== null) {
      requireMethod(parsed, ["POST"]);
      const review = await this.reviewTask(
        decodeSegment(taskReview[1] ?? "")
      );
      sendJson(res, 200, { ok: true, review });
      return;
    }
    const decisionAdr = /^\/studio-api\/decisions\/([^/]+)\/adr$/.exec(
      parsed.pathname
    );
    if (decisionAdr !== null) {
      requireMethod(parsed, ["POST"]);
      const decision = await this.writeAdr(
        decodeSegment(decisionAdr[1] ?? "")
      );
      sendJson(res, 200, { ok: true, decision });
      return;
    }
    if (parsed.pathname === `${API_PREFIX}/decisions`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const decision = await this.store.createDecision(
        asCreateDecision(await readJson(req))
      );
      sendJson(res, 201, { ok: true, decision });
      return;
    }
    const decisionDecide = /^\/studio-api\/decisions\/([^/]+)\/decide$/.exec(parsed.pathname);
    if (decisionDecide !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const decision = await this.store.decideDecision(
        decodeSegment(decisionDecide[1] ?? ""),
        asDecideDecision(await readJson(req))
      );
      sendJson(res, 200, { ok: true, decision });
      return;
    }
    const taskMerge = /^\/studio-api\/tasks\/([^/]+)\/merge-proposal$/.exec(parsed.pathname);
    if (taskMerge !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const proposal = await this.store.createMergeProposal(
        decodeSegment(taskMerge[1] ?? ""),
        asCreateMergeProposal(await readJson(req))
      );
      sendJson(res, 201, { ok: true, proposal });
      return;
    }
    const mergeDecision = /^\/studio-api\/merge-proposals\/([^/]+)\/(approve|reject|merge|execute|rollback)$/.exec(
      parsed.pathname
    );
    if (mergeDecision !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const proposalId = decodeSegment(mergeDecision[1] ?? "");
      const action = mergeDecision[2];
      const proposal = action === "approve" ? await this.store.approveMergeProposal(proposalId, asNote(body)) : action === "reject" ? await this.store.rejectMergeProposal(
        proposalId,
        asNote(body) ?? ""
      ) : action === "execute" ? await this.executeMerge(proposalId) : action === "rollback" ? await this.rollbackMerge(proposalId) : await this.store.completeMergeProposal(
        proposalId,
        asOptionalString(body.mergeCommit, "mergeCommit")
      );
      sendJson(res, 200, { ok: true, proposal });
      return;
    }
    const taskMatch = /^\/studio-api\/tasks\/([^/]+)$/.exec(parsed.pathname);
    if (taskMatch !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const task = await this.store.updateTask(
        decodeSegment(taskMatch[1] ?? ""),
        asUpdateTask(await readJson(req))
      );
      sendJson(res, 200, { ok: true, task });
      return;
    }
    throw new HttpError(404, "not_found", "\u63A5\u53E3\u4E0D\u5B58\u5728");
  }
};
export {
  StudioRouter,
  handleRouterError
};
