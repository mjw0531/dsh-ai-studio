import type { IncomingMessage, ServerResponse } from "node:http";

import { STUDIO_PLUGIN_VERSION } from "../shared/types.js";
import type {
  ApiErrorBody,
  CompatibilityInfo,
  CreateMergeProposalInput,
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  MergeRisk,
  TaskStatus,
  TransitionTaskInput,
  UpdateTaskInput,
} from "../shared/types.js";
import { StudioStore, StudioStoreError } from "./store.js";

const MAX_BODY_BYTES = 1024 * 1024;
const API_PREFIX = "/studio-api";

interface ConnectionLike {
  admit(request: Request): { peer?: unknown; rejection?: number };
}

interface StudioRouterOptions {
  store: StudioStore;
  token: string;
  dshVersion: string;
  compatibility: CompatibilityInfo;
  connection: ConnectionLike;
  getBootPayload: () => unknown;
}

interface ParsedRequest {
  method: string;
  pathname: string;
  url: URL;
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  setSecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body).toString(),
  });
  res.end(body);
}

function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiErrorBody = { error: { code, message } };
  sendJson(res, status, body);
}

function requestOf(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const host = req.headers.host ?? "127.0.0.1";
  return new Request(`http://${host}${req.url ?? "/"}`, {
    method: "GET",
    headers,
  });
}

function assertJsonRequest(req: IncomingMessage): void {
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

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
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

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "invalid_path", "路径参数编码无效");
  }
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "invalid_input", `${field} 必须是非空字符串`);
  }
  return value;
}

function asOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_input", `${field} 必须是字符串`);
  }
  return value;
}

function asStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpError(400, "invalid_input", `${field} 必须是字符串数组`);
  }
  return value;
}

function asTaskStatus(value: unknown): TaskStatus {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_input", "status 必须是字符串");
  }
  return value as TaskStatus;
}

function asCreateProject(body: Record<string, unknown>): CreateProjectInput {
  return {
    name: asString(body.name, "name"),
    description: asOptionalString(body.description, "description"),
  };
}

function asCreateRole(body: Record<string, unknown>): CreateRoleInput {
  return {
    name: asString(body.name, "name"),
    title: asOptionalString(body.title, "title"),
    mission: asOptionalString(body.mission, "mission"),
    responsibilities: asStringArray(body.responsibilities, "responsibilities"),
  };
}

function asCreateTask(body: Record<string, unknown>): CreateTaskInput {
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
  return {
    title: asString(body.title, "title"),
    goal: asOptionalString(body.goal, "goal"),
    priority,
    ownerRoleId: owner,
    reviewerRoleId: reviewer,
    acceptance: asStringArray(body.acceptance, "acceptance"),
    branch: asOptionalString(body.branch, "branch") ?? null,
  };
}

function asUpdateTask(body: Record<string, unknown>): UpdateTaskInput {
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
  return result;
}

function asMergeRisk(value: unknown): MergeRisk {
  if (value === undefined) return "medium";
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new HttpError(400, "invalid_input", "risk 必须是 low/medium/high");
}

function asCreateMergeProposal(
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

function asNote(body: Record<string, unknown>): string | undefined {
  return asOptionalString(body.note, "note");
}

export class StudioRouter {
  private readonly store: StudioStore;
  private readonly token: string;
  private readonly dshVersion: string;
  private readonly compatibility: CompatibilityInfo;
  private readonly connection: ConnectionLike;
  private readonly getBootPayload: () => unknown;

  constructor(options: StudioRouterOptions) {
    this.store = options.store;
    this.token = options.token;
    this.dshVersion = options.dshVersion;
    this.compatibility = options.compatibility;
    this.connection = options.connection;
    this.getBootPayload = options.getBootPayload;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = this.parse(req);
    if (parsed.pathname === `${API_PREFIX}/health`) {
      if (parsed.method !== "GET") {
        throw new HttpError(405, "method_not_allowed", "只支持 GET");
      }
      sendJson(res, 200, {
        ok: true,
        service: "dsh-studio",
        pluginVersion: STUDIO_PLUGIN_VERSION,
        dshVersion: this.dshVersion,
        compatibility: this.compatibility,
        time: new Date().toISOString(),
      });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/boot`) {
      this.requireMethod(parsed, ["GET"]);
      const origin = req.headers.origin;
      const desktopOrigin =
        typeof origin === "string" &&
        (origin.startsWith("dsh-app://") ||
          origin.startsWith("file://") ||
          origin === "null");
      if (desktopOrigin) {
        // The desktop renderer runs on a custom scheme, so its fetch to the
        // loopback Host is cross-origin and carries no DSH cookie. The boot
        // response is only a process-random token for this local app; the
        // token still protects every data endpoint.
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      }
      const admission = this.connection.admit(requestOf(req));
      if (admission.rejection !== undefined && !desktopOrigin) {
        sendError(
          res,
          admission.rejection,
          "unauthorized",
          "DSH 会话没有通过认证，无法获取 Studio 启动参数",
        );
        return;
      }
      sendJson(res, 200, this.getBootPayload());
      return;
    }

    this.assertAuthorized(req);

    if (parsed.pathname === `${API_PREFIX}/bootstrap`) {
      this.requireMethod(parsed, ["GET"]);
      const projectId = parsed.url.searchParams.get("projectId") ?? undefined;
      const data = await this.store.bootstrap(projectId);
      data.app.dshVersion = this.dshVersion;
      data.app.compatibility = this.compatibility;
      data.app.warning = this.store.getWarning();
      sendJson(res, 200, data);
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/projects`) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const project = await this.store.createProject(
        asCreateProject(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, project });
      return;
    }

    const selectProject = /^\/studio-api\/projects\/([^/]+)\/select$/.exec(
      parsed.pathname,
    );
    if (selectProject !== null) {
      this.requireMethod(parsed, ["POST"]);
      const project = await this.store.selectProject(
        decodeSegment(selectProject[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, project });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/roles`) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const role = await this.store.createRole(
        asCreateRole(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, role });
      return;
    }

    const roleMatch = /^\/studio-api\/roles\/([^/]+)$/.exec(parsed.pathname);
    if (roleMatch !== null) {
      this.requireMethod(parsed, ["PATCH"]);
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
            "responsibilities",
          ),
        },
      );
      sendJson(res, 200, { ok: true, role });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/tasks`) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const task = await this.store.createTask(
        asCreateTask(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, task });
      return;
    }

    const taskTransition =
      /^\/studio-api\/tasks\/([^/]+)\/transition$/.exec(parsed.pathname);
    if (taskTransition !== null) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = (await readJson(req)) as Partial<TransitionTaskInput>;
      const task = await this.store.transitionTask(
        decodeSegment(taskTransition[1] ?? ""),
        asTaskStatus(body.status),
      );
      sendJson(res, 200, { ok: true, task });
      return;
    }

    const taskMerge =
      /^\/studio-api\/tasks\/([^/]+)\/merge-proposal$/.exec(parsed.pathname);
    if (taskMerge !== null) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const proposal = await this.store.createMergeProposal(
        decodeSegment(taskMerge[1] ?? ""),
        asCreateMergeProposal(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, proposal });
      return;
    }

    const mergeDecision =
      /^\/studio-api\/merge-proposals\/([^/]+)\/(approve|reject|merge)$/.exec(
        parsed.pathname,
      );
    if (mergeDecision !== null) {
      this.requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const proposalId = decodeSegment(mergeDecision[1] ?? "");
      const action = mergeDecision[2];
      const proposal =
        action === "approve"
          ? await this.store.approveMergeProposal(proposalId, asNote(body))
          : action === "reject"
            ? await this.store.rejectMergeProposal(
                proposalId,
                asNote(body) ?? "",
              )
            : await this.store.completeMergeProposal(
                proposalId,
                asOptionalString(body.mergeCommit, "mergeCommit"),
              );
      sendJson(res, 200, { ok: true, proposal });
      return;
    }

    const taskMatch = /^\/studio-api\/tasks\/([^/]+)$/.exec(parsed.pathname);
    if (taskMatch !== null) {
      this.requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const task = await this.store.updateTask(
        decodeSegment(taskMatch[1] ?? ""),
        asUpdateTask(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, task });
      return;
    }

    throw new HttpError(404, "not_found", "接口不存在");
  }

  private parse(req: IncomingMessage): ParsedRequest {
    const method = (req.method ?? "GET").toUpperCase();
    const url = new URL(req.url ?? "/", "http://studio.local");
    return {
      method,
      pathname: url.pathname,
      url,
    };
  }

  private assertAuthorized(req: IncomingMessage): void {
    const headerToken = req.headers["x-studio-token"];
    const authorization = req.headers.authorization;
    const bearer =
      typeof authorization === "string" &&
      authorization.toLowerCase().startsWith("bearer ")
        ? authorization.slice(7).trim()
        : "";
    const candidate =
      typeof headerToken === "string" ? headerToken.trim() : bearer;
    if (candidate === "" || candidate !== this.token) {
      throw new HttpError(401, "unauthorized", "缺少或无效的 Studio 访问令牌");
    }
  }

  private requireMethod(parsed: ParsedRequest, methods: string[]): void {
    if (!methods.includes(parsed.method)) {
      throw new HttpError(
        405,
        "method_not_allowed",
        `只支持 ${methods.join(", ")}`,
      );
    }
  }
}

export function handleRouterError(res: ServerResponse, error: unknown): void {
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
