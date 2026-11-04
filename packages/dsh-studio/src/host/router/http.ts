import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
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
import type { StudioStore } from "../store.js";

export const MAX_BODY_BYTES = 1024 * 1024;
export const API_PREFIX = "/studio-api";

export interface ConnectionLike {
  admit(request: Request): { peer?: unknown; rejection?: number };
}

export interface StudioRouterOptions {
  store: StudioStore;
  token: string;
  dshVersion: string;
  compatibility: CompatibilityInfo;
  connection: ConnectionLike;
  bootNonce: string;
  getBootPayload: () => unknown;
  dispatchTask: (taskId: string) => Promise<AgentRun>;
  verifyTask: (taskId: string) => Promise<Verification>;
  reviewTask: (taskId: string) => Promise<IndependentReview>;
  executeMerge: (proposalId: string) => Promise<MergeProposal>;
  rollbackMerge: (proposalId: string) => Promise<MergeProposal>;
  writeAdr: (decisionId: string) => Promise<Decision>;
  exportProjectBundle: (
    projectId: string,
  ) => Promise<{ filename: string; bytes: Buffer }>;
  importProjectBundle: (
    archivePath: string,
    targetPath: string,
  ) => Promise<{ projectId: string; repoPath: string }>;
  readProjectDoc: (path: string) => Promise<ProjectDoc>;
  runWorkshop: (workshopId: string) => Promise<Workshop>;
  summarizeWorkshop: (workshopId: string) => Promise<Workshop>;
  probeProviderProfile: (profileId: string) => Promise<ProviderProbeResult>;
}

export interface ParsedRequest {
  method: string;
  pathname: string;
  url: URL;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  setSecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body).toString(),
  });
  res.end(body);
}

export function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiErrorBody = { error: { code, message } };
  sendJson(res, status, body);
}

export function requestOf(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(
      name,
      Array.isArray(value) ? value.join(", ") : String(value),
    );
  }
  const host = req.headers.host ?? "127.0.0.1";
  return new Request(`http://${host}${req.url ?? "/"}`, {
    method: "GET",
    headers,
  });
}

export function assertJsonRequest(req: IncomingMessage): void {
  const contentType = req.headers["content-type"];
  if (
    typeof contentType === "string" &&
    !contentType.toLowerCase().includes("application/json")
  ) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "请求体必须是 application/json",
    );
  }
}

export async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, "payload_too_large", "请求体超过 1 MB 限制");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function verifyWebhookSignature(
  secret: string,
  raw: Buffer,
  signature: string,
): boolean {
  const provided = signature.replace(/^sha256=/u, "").trim();
  if (provided === "") return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, "payload_too_large", "请求体超过 1 MB 限制");
    }
    chunks.push(buffer);
  }
  if (total === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json", "请求体不是合法的 JSON 对象");
  }
}

export function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "invalid_path", "路径参数编码无效");
  }
}

