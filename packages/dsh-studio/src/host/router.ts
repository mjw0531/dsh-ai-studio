import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  STUDIO_PLUGIN_VERSION,
  isProjectStage,
} from "../shared/types.js";
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
} from "../shared/types.js";
import { StudioStore, StudioStoreError } from "./store.js";

import {
  API_PREFIX,
  HttpError,
  assertJsonRequest,
  decodeSegment,
  readJson,
  readRawBody,
  requestOf,
  sendError,
  sendJson,
  setSecurityHeaders,
  verifyWebhookSignature,
} from "./router/http.js";
import type {
  ConnectionLike,
  ParsedRequest,
  StudioRouterOptions,
} from "./router/http.js";
import * as inputs from "./router/inputs.js";
import {
  allowRate,
  assertAuthorized,
  parseRoute,
  requireMethod,
} from "./router/auth.js";
export class StudioRouter {
  private readonly store: StudioStore;
  private readonly token: string;
  private readonly dshVersion: string;
  private readonly compatibility: CompatibilityInfo;
  private readonly connection: ConnectionLike;
  private readonly bootNonce: string;
  private readonly rateBuckets = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private readonly getBootPayload: () => unknown;
  private readonly dispatchTask: (taskId: string) => Promise<AgentRun>;
  private readonly verifyTask: (taskId: string) => Promise<Verification>;
  private readonly reviewTask: (
    taskId: string,
  ) => Promise<IndependentReview>;
  private readonly executeMerge: (
    proposalId: string,
  ) => Promise<MergeProposal>;
  private readonly rollbackMerge: (
    proposalId: string,
  ) => Promise<MergeProposal>;
  private readonly writeAdr: (decisionId: string) => Promise<Decision>;
  private readonly exportProjectBundle: (
    projectId: string,
  ) => Promise<{ filename: string; bytes: Buffer }>;
  private readonly importProjectBundle: (
    archivePath: string,
    targetPath: string,
  ) => Promise<{ projectId: string; repoPath: string }>;
  private readonly readProjectDoc: (path: string) => Promise<ProjectDoc>;
  private readonly runWorkshop: (workshopId: string) => Promise<Workshop>;
  private readonly summarizeWorkshop: (
    workshopId: string,
  ) => Promise<Workshop>;
  private readonly sayWorkshop: (
    workshopId: string,
    roleId: string,
    content: string,
  ) => Promise<Workshop>;
  private readonly sideSayWorkshop: (
    workshopId: string,
    roleId: string,
    content: string,
  ) => Promise<Workshop>;
  private readonly summarizeMeetingWorkshop: (
    workshopId: string,
  ) => Promise<Workshop>;
  private readonly probeProviderProfile: (
    profileId: string,
  ) => Promise<ProviderProbeResult>;

  constructor(options: StudioRouterOptions) {
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
    this.sayWorkshop = options.sayWorkshop;
    this.sideSayWorkshop = options.sideSayWorkshop;
    this.summarizeMeetingWorkshop = options.summarizeMeetingWorkshop;
    this.probeProviderProfile = options.probeProviderProfile;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = parseRoute(req);
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
      requireMethod(parsed, ["GET"]);
      if (!allowRate(this.rateBuckets, "boot", req, 30)) {
        sendError(res, 429, "rate_limited", "启动参数请求过于频繁，请稍后再试");
        return;
      }
      const origin = req.headers.origin;
      if (origin === "null" || origin?.startsWith("file://")) {
        sendError(
          res,
          401,
          "unauthorized",
          "本地文件页面不能获取 Studio 启动参数",
        );
        return;
      }
      const desktopOrigin =
        typeof origin === "string" && origin.startsWith("dsh-app://");
      if (desktopOrigin) {
        const header = req.headers["x-dsh-studio-nonce"];
        const supplied = Array.isArray(header) ? header[0] : header;
        const expected = this.bootNonce;
        const valid =
          typeof supplied === "string" &&
          supplied.length === expected.length &&
          timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
        if (!valid) {
          sendError(
            res,
            401,
            "boot_nonce_required",
            "桌面启动凭据缺失或无效；请完全退出并重启 DSH 后再试",
          );
          return;
        }
        // 桌面自定义 scheme 没有 DSH cookie；nonce 是一次性启动凭据。
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      } else {
        const admission = this.connection.admit(requestOf(req));
        if (admission.rejection !== undefined) {
          sendError(
            res,
            admission.rejection,
            "unauthorized",
            "DSH 会话没有通过认证，无法获取 Studio 启动参数",
          );
          return;
        }
      }
      sendJson(res, 200, this.getBootPayload());
      return;
    }

    const webhookMatch =
      /^\/studio-api\/webhooks\/([^/]+)\/([^/]+)$/.exec(parsed.pathname);
    if (webhookMatch !== null) {
      requireMethod(parsed, ["POST"]);
      const projectId = decodeSegment(webhookMatch[1] ?? "");
      const source = webhookMatch[2] ?? "";
      if (source !== "github" && source !== "ci" && source !== "im") {
        throw new HttpError(404, "not_found", "不支持的 Webhook 来源");
      }
      const secret = process.env["DSH_STUDIO_WEBHOOK_SECRET"] ?? "";
      if (secret === "") {
        throw new HttpError(
          503,
          "webhook_not_configured",
          "未设置 DSH_STUDIO_WEBHOOK_SECRET，Webhook 已拒绝",
        );
      }
      const raw = await readRawBody(req);
      const signature =
        (typeof req.headers["x-hub-signature-256"] === "string"
          ? req.headers["x-hub-signature-256"]
          : "") ||
        (typeof req.headers["x-studio-signature"] === "string"
          ? req.headers["x-studio-signature"]
          : "");
      if (!verifyWebhookSignature(secret, raw, signature)) {
        throw new HttpError(401, "invalid_signature", "Webhook 签名无效");
      }
      let payload: Record<string, unknown>;
      try {
        const parsedBody: unknown = JSON.parse(raw.toString("utf8") || "{}");
        if (
          typeof parsedBody !== "object" ||
          parsedBody === null ||
          Array.isArray(parsedBody)
        ) {
          throw new Error("not an object");
        }
        payload = parsedBody as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "invalid_json", "Webhook 请求体不是 JSON");
      }
      const result = await this.store.ingestWebhook(projectId, source, payload);
      sendJson(res, 202, { ok: true, ...result });
      return;
    }

    assertAuthorized(req, this.token);

    if (parsed.pathname === `${API_PREFIX}/bootstrap`) {
      requireMethod(parsed, ["GET"]);
      const projectId = parsed.url.searchParams.get("projectId") ?? undefined;
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
        exportedAt: new Date().toISOString(),
        state,
      });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/settings`) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const state = await this.store.updateCompanyName(
        inputs.asString(body.companyName, "companyName"),
      );
      sendJson(res, 200, {
        ok: true,
        companyName: state.companyName,
      });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/projects/bundle/import`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const imported = await this.importProjectBundle(
        inputs.asString(body.archivePath, "archivePath"),
        inputs.asString(body.targetPath, "targetPath"),
      );
      sendJson(res, 200, { ok: true, ...imported });
      return;
    }

    const projectBundle =
      /^\/studio-api\/projects\/([^/]+)\/bundle$/.exec(parsed.pathname);
    if (projectBundle !== null) {
      requireMethod(parsed, ["GET"]);
      const bundle = await this.exportProjectBundle(
        decodeSegment(projectBundle[1] ?? ""),
      );
      res.statusCode = 200;
      res.setHeader("content-type", "application/gzip");
      res.setHeader(
        "content-disposition",
        `attachment; filename="${bundle.filename}"`,
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
        schemaVersion: state.schemaVersion,
      });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/projects/from-template`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const project = await this.store.createProjectFromTemplate(
        inputs.asCreateProjectFromTemplate(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, project });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/projects`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const project = await this.store.createProject(
        inputs.asCreateProject(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, project });
      return;
    }

    const triggerRulesMatch =
      /^\/studio-api\/projects\/([^/]+)\/trigger-rules$/.exec(
        parsed.pathname,
      );
    if (triggerRulesMatch !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const rules = await this.store.updateTriggerRules(
        decodeSegment(triggerRulesMatch[1] ?? ""),
        inputs.asUpdateTriggerRules(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, rules });
      return;
    }

    const prototypeDemos =
      /^\/studio-api\/projects\/([^/]+)\/prototype-demos$/.exec(
        parsed.pathname,
      );
    if (prototypeDemos !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const demo = await this.store.createPrototypeDemo(
        inputs.asCreatePrototypeDemo(await readJson(req)),
        decodeSegment(prototypeDemos[1] ?? ""),
      );
      sendJson(res, 201, { ok: true, demo });
      return;
    }

    const prototypeDemo =
      /^\/studio-api\/projects\/([^/]+)\/prototype-demos\/([^/]+)$/.exec(
        parsed.pathname,
      );
    if (prototypeDemo !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const demo = await this.store.updatePrototypeDemo(
        decodeSegment(prototypeDemo[2] ?? ""),
        inputs.asUpdatePrototypeDemo(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, demo });
      return;
    }

    const freezeMatch =
      /^\/studio-api\/projects\/([^/]+)\/freezes$/.exec(parsed.pathname);
    if (freezeMatch !== null) {
      const projectId = decodeSegment(freezeMatch[1] ?? "");
      requireMethod(parsed, ["GET", "POST"]);
      if (parsed.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          freezes: this.store.listFreezes(projectId),
        });
        return;
      }
      assertJsonRequest(req);
      const freeze = await this.store.createFreeze(
        projectId,
        inputs.asCreateFreeze(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, freeze });
      return;
    }

    const requirementDecisionMatch =
      /^\/studio-api\/projects\/([^/]+)\/requirement-decisions$/.exec(
        parsed.pathname,
      );
    if (requirementDecisionMatch !== null) {
      const projectId = decodeSegment(requirementDecisionMatch[1] ?? "");
      requireMethod(parsed, ["GET", "POST"]);
      if (parsed.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          decisions: this.store.listRequirementDecisions(projectId),
        });
        return;
      }
      assertJsonRequest(req);
      const decision = await this.store.createRequirementDecision(
        projectId,
        inputs.asRequirementDecision(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, decision });
      return;
    }

    const freezeChangeMatch =
      /^\/studio-api\/projects\/([^/]+)\/freeze-change-requests$/.exec(
        parsed.pathname,
      );
    if (freezeChangeMatch !== null) {
      const projectId = decodeSegment(freezeChangeMatch[1] ?? "");
      requireMethod(parsed, ["GET", "POST"]);
      if (parsed.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          requests: this.store.listFreezeChangeRequests(projectId),
        });
        return;
      }
      assertJsonRequest(req);
      const request = await this.store.createFreezeChangeRequest(
        projectId,
        inputs.asCreateFreezeChangeRequest(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, request });
      return;
    }

    const freezeChangeDecideMatch =
      /^\/studio-api\/projects\/([^/]+)\/freeze-change-requests\/([^/]+)\/decide$/.exec(
        parsed.pathname,
      );
    if (freezeChangeDecideMatch !== null) {
      const projectId = decodeSegment(freezeChangeDecideMatch[1] ?? "");
      const requestId = decodeSegment(freezeChangeDecideMatch[2] ?? "");
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      if (body.status !== "accepted" && body.status !== "rejected") {
        throw new HttpError(400, "invalid_input", "status 无效");
      }
      const request = await this.store.decideFreezeChangeRequest(
        projectId,
        requestId,
        body.status,
      );
      sendJson(res, 200, { ok: true, request });
      return;
    }

    const projectMatch =
      /^\/studio-api\/projects\/([^/]+)$/.exec(parsed.pathname);
    if (projectMatch !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const project = await this.store.updateProject(
        decodeSegment(projectMatch[1] ?? ""),
        inputs.asUpdateProject(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, project });
      return;
    }

    const stageGate = /^\/studio-api\/projects\/([^/]+)\/stage-gates\/([^/]+)$/.exec(
      parsed.pathname,
    );
    if (stageGate !== null) {
      const projectId = decodeSegment(stageGate[1] ?? "");
      const stage = inputs.asProjectStage(decodeSegment(stageGate[2] ?? ""));
      if (parsed.method === "GET") {
        const gate = await this.store.getStageGate(projectId, stage);
        sendJson(res, 200, { ok: true, gate });
        return;
      }
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const gate = await this.store.updateStageGate(
        projectId,
        stage,
        inputs.asStageGateInput(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, gate });
      return;
    }

    const stageGateApprove =
      /^\/studio-api\/projects\/([^/]+)\/stage-gates\/([^/]+)\/approve$/.exec(
        parsed.pathname,
      );
    if (stageGateApprove !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const gate = await this.store.approveStageGate(
        decodeSegment(stageGateApprove[1] ?? ""),
        inputs.asProjectStage(decodeSegment(stageGateApprove[2] ?? "")),
        inputs.asApproveStageGateInput(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, gate });
      return;
    }

    const stageGateReject =
      /^\/studio-api\/projects\/([^/]+)\/stage-gates\/([^/]+)\/reject$/.exec(
        parsed.pathname,
      );
    if (stageGateReject !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const gate = await this.store.rejectStageGate(
        decodeSegment(stageGateReject[1] ?? ""),
        inputs.asProjectStage(decodeSegment(stageGateReject[2] ?? "")),
        inputs.asNote(body) ?? "",
      );
      sendJson(res, 200, { ok: true, gate });
      return;
    }

    const selectProject = /^\/studio-api\/projects\/([^/]+)\/select$/.exec(
      parsed.pathname,
    );
    if (selectProject !== null) {
      requireMethod(parsed, ["POST"]);
      const project = await this.store.selectProject(
        decodeSegment(selectProject[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, project });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/triggers`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const trigger = await this.store.ingestTrigger(
        inputs.asCreateTrigger(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, trigger });
      return;
    }

    const triggerAccept =
      /^\/studio-api\/triggers\/([^/]+)\/accept$/.exec(parsed.pathname);
    if (triggerAccept !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const result = await this.store.acceptTrigger(
        decodeSegment(triggerAccept[1] ?? ""),
        inputs.asAcceptTrigger(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    const triggerIgnore =
      /^\/studio-api\/triggers\/([^/]+)\/ignore$/.exec(parsed.pathname);
    if (triggerIgnore !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const trigger = await this.store.ignoreTrigger(
        decodeSegment(triggerIgnore[1] ?? ""),
        inputs.asNote(body) ?? "",
      );
      sendJson(res, 200, { ok: true, trigger });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/provider-profiles`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const profile: ProviderProfile =
        await this.store.createProviderProfile(
          inputs.asCreateProviderProfile(await readJson(req)),
        );
      sendJson(res, 201, { ok: true, profile });
      return;
    }

    const providerProbe =
      /^\/studio-api\/provider-profiles\/([^/]+)\/probe$/.exec(
        parsed.pathname,
      );
    if (providerProbe !== null) {
      requireMethod(parsed, ["POST"]);
      const result = await this.probeProviderProfile(
        decodeSegment(providerProbe[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, probe: result });
      return;
    }

    const providerReassign =
      /^\/studio-api\/provider-profiles\/([^/]+)\/reassign$/.exec(
        parsed.pathname,
      );
    if (providerReassign !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const result = await this.store.reassignProviderProfile(
        decodeSegment(providerReassign[1] ?? ""),
        inputs.asString(body.toProfileId, "toProfileId"),
      );
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    const providerProfileMatch =
      /^\/studio-api\/provider-profiles\/([^/]+)$/.exec(parsed.pathname);
    if (providerProfileMatch !== null) {
      const profileId = decodeSegment(providerProfileMatch[1] ?? "");
      if (req.method === "PATCH") {
        assertJsonRequest(req);
        const profile = await this.store.updateProviderProfile(
          profileId,
          inputs.asUpdateProviderProfile(await readJson(req)),
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
        inputs.asCreateWorkshop(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, workshop });
      return;
    }

    const workshopNote =
      /^\/studio-api\/workshops\/([^/]+)\/notes$/.exec(parsed.pathname);
    if (workshopNote !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const workshop = await this.store.addWorkshopNote(
        decodeSegment(workshopNote[1] ?? ""),
        inputs.asWorkshopNote(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopSynthesize =
      /^\/studio-api\/workshops\/([^/]+)\/synthesize$/.exec(parsed.pathname);
    if (workshopSynthesize !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const workshop = await this.store.synthesizeWorkshop(
        decodeSegment(workshopSynthesize[1] ?? ""),
        inputs.asString(body.synthesis, "synthesis"),
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopDecide =
      /^\/studio-api\/workshops\/([^/]+)\/decide$/.exec(parsed.pathname);
    if (workshopDecide !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const workshop = await this.store.decideWorkshop(
        decodeSegment(workshopDecide[1] ?? ""),
        inputs.asString(body.decision, "decision"),
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopRun =
      /^\/studio-api\/workshops\/([^/]+)\/run$/.exec(parsed.pathname);
    if (workshopRun !== null) {
      requireMethod(parsed, ["POST"]);
      const workshop = await this.runWorkshop(
        decodeSegment(workshopRun[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopSummarize =
      /^\/studio-api\/workshops\/([^/]+)\/summarize$/.exec(
        parsed.pathname,
      );
    if (workshopSummarize !== null) {
      requireMethod(parsed, ["POST"]);
      const workshop = await this.summarizeWorkshop(
        decodeSegment(workshopSummarize[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }


    const workshopSpeak =
      /^\/studio-api\/workshops\/([^/]+)\/messages$/.exec(parsed.pathname);
    if (workshopSpeak !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const workshopId = decodeSegment(workshopSpeak[1] ?? "");
      const body = await readJson(req);
      const content = inputs.asString(body.content, "content");
      const targetRoleId =
        body.targetRoleId === null || body.targetRoleId === undefined
          ? null
          : inputs.asString(body.targetRoleId, "targetRoleId");
      await this.store.addWorkshopMessage(workshopId, {
        roleId: null,
        roleName: "Owner",
        content,
      });
      const workshop =
        targetRoleId === null
          ? (await this.store.getWorkshopContext(workshopId)).workshop
          : await this.sayWorkshop(workshopId, targetRoleId, content);
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopSideSpeak =
      /^\/studio-api\/workshops\/([^/]+)\/side-chats\/([^/]+)\/messages$/.exec(
        parsed.pathname,
      );
    if (workshopSideSpeak !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const workshopId = decodeSegment(workshopSideSpeak[1] ?? "");
      const roleId = decodeSegment(workshopSideSpeak[2] ?? "");
      const body = await readJson(req);
      const content = inputs.asString(body.content, "content");
      await this.store.addWorkshopSideOwnerMessage(workshopId, roleId, content);
      const workshop = await this.sideSayWorkshop(workshopId, roleId, content);
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopMessageEdit =
      /^\/studio-api\/workshops\/([^/]+)\/messages\/([^/]+)$/.exec(
        parsed.pathname,
      );
    if (workshopMessageEdit !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const workshop = await this.store.updateWorkshopMessage(
        decodeSegment(workshopMessageEdit[1] ?? ""),
        decodeSegment(workshopMessageEdit[2] ?? ""),
        { content: inputs.asString(body.content, "content") },
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }


    const workshopAgenda =
      /^\/studio-api\/workshops\/([^/]+)\/agenda$/.exec(parsed.pathname);
    if (workshopAgenda !== null) {
      requireMethod(parsed, ["PUT"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      if (!Array.isArray(body.items)) {
        throw new HttpError(400, "invalid_input", "items 必须是数组");
      }
      const items = body.items.map((item) => {
        if (
          typeof item !== "object" ||
          item === null ||
          typeof (item as { id?: unknown }).id !== "string" ||
          ((item as { status?: unknown }).status !== "open" &&
            (item as { status?: unknown }).status !== "closed" &&
            (item as { status?: unknown }).status !== "deferred")
        ) {
          throw new HttpError(400, "invalid_input", "议程项无效");
        }
        return {
          id: (item as { id: string }).id,
          status: (item as { status: "open" | "closed" | "deferred" }).status,
        };
      });
      const workshop = await this.store.setWorkshopAgenda(
        decodeSegment(workshopAgenda[1] ?? ""),
        items,
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopSettle =
      /^\/studio-api\/workshops\/([^/]+)\/settle$/.exec(parsed.pathname);
    if (workshopSettle !== null) {
      requireMethod(parsed, ["POST"]);
      const workshop = await this.store.settleWorkshop(
        decodeSegment(workshopSettle[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopMinutes =
      /^\/studio-api\/workshops\/([^/]+)\/minutes$/.exec(parsed.pathname);
    if (workshopMinutes !== null) {
      requireMethod(parsed, ["PUT"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const workshop = await this.store.saveWorkshopMinutes(
        decodeSegment(workshopMinutes[1] ?? ""),
        {
          consensus: inputs.asStringArray(body.consensus, "consensus") ?? [],
          disagreements:
            inputs.asStringArray(body.disagreements, "disagreements") ?? [],
          openQuestions:
            inputs.asStringArray(body.openQuestions, "openQuestions") ?? [],
          decisionDraft:
            inputs.asOptionalString(body.decisionDraft, "decisionDraft") ?? "",
          noDisagreementReason:
            inputs.asOptionalString(
              body.noDisagreementReason,
              "noDisagreementReason",
            ) ?? null,
        },
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopMinutesAi =
      /^\/studio-api\/workshops\/([^/]+)\/summarize-minutes$/.exec(
        parsed.pathname,
      );
    if (workshopMinutesAi !== null) {
      requireMethod(parsed, ["POST"]);
      const workshop = await this.summarizeMeetingWorkshop(
        decodeSegment(workshopMinutesAi[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    const workshopDecision =
      /^\/studio-api\/workshops\/([^/]+)\/decision$/.exec(parsed.pathname);
    if (workshopDecision !== null) {
      requireMethod(parsed, ["POST"]);
      const workshop = await this.store.createWorkshopDecision(
        decodeSegment(workshopDecision[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, workshop });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/roles`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const role = await this.store.createRole(
        inputs.asCreateRole(await readJson(req)),
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
          name: inputs.asOptionalString(body.name, "name"),
          title: inputs.asOptionalString(body.title, "title"),
          mission: inputs.asOptionalString(body.mission, "mission"),
          responsibilities: inputs.asStringArray(
            body.responsibilities,
            "responsibilities",
          ),
          providerProfileId:
            body.providerProfileId === null
              ? null
              : inputs.asOptionalString(body.providerProfileId, "providerProfileId"),
          model: inputs.asOptionalString(body.model, "model"),
          executor: inputs.asAgentExecutor(body.executor),
          tokenBudget: inputs.asOptionalBudget(body.tokenBudget, "tokenBudget"),
          dailyTokenBudget: inputs.asOptionalBudget(
            body.dailyTokenBudget,
            "dailyTokenBudget",
          ),
        },
      );
      sendJson(res, 200, { ok: true, role });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/tasks`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const task = await this.store.createTask(
        inputs.asCreateTask(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, task });
      return;
    }

    const taskTransition =
      /^\/studio-api\/tasks\/([^/]+)\/transition$/.exec(parsed.pathname);
    if (taskTransition !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = (await readJson(req)) as Partial<TransitionTaskInput>;
      const task = await this.store.transitionTask(
        decodeSegment(taskTransition[1] ?? ""),
        inputs.asTaskStatus(body.status),
      );
      sendJson(res, 200, { ok: true, task });
      return;
    }

    const taskDispatch =
      /^\/studio-api\/tasks\/([^/]+)\/dispatch$/.exec(parsed.pathname);
    if (taskDispatch !== null) {
      requireMethod(parsed, ["POST"]);
      const run = await this.dispatchTask(
        decodeSegment(taskDispatch[1] ?? ""),
      );
      sendJson(res, 202, { ok: true, run });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/project-docs`) {
      requireMethod(parsed, ["GET"]);
      const docPath = parsed.url.searchParams.get("path");
      if (docPath === null || docPath.trim() === "") {
        throw new HttpError(400, "invalid_input", "path 不能为空");
      }
      const doc = await this.readProjectDoc(docPath);
      sendJson(res, 200, { ok: true, doc });
      return;
    }

    const taskVerify =
      /^\/studio-api\/tasks\/([^/]+)\/verify$/.exec(parsed.pathname);
    if (taskVerify !== null) {
      requireMethod(parsed, ["POST"]);
      if (!allowRate(this.rateBuckets, "verify", req, 30)) {
        throw new HttpError(
          429,
          "rate_limited",
          "验证请求过于频繁，请稍后再试",
        );
      }
      assertJsonRequest(req);
      const body = (await readJson(req)) as { command?: unknown };
      if (body.command !== undefined && body.command !== null) {
        throw new HttpError(
          400,
          "verify_command_override",
          "验证命令只能在任务里修改；/verify 不再接受临时命令",
        );
      }
      const verification = await this.verifyTask(
        decodeSegment(taskVerify[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, verification });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/modules`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const module = await this.store.createModule(
        inputs.asCreateModule(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, module });
      return;
    }

    const moduleMatch = /^\/studio-api\/modules\/([^/]+)$/.exec(
      parsed.pathname,
    );
    if (moduleMatch !== null) {
      requireMethod(parsed, ["PATCH"]);
      assertJsonRequest(req);
      const module = await this.store.updateModule(
        decodeSegment(moduleMatch[1] ?? ""),
        inputs.asUpdateModule(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, module });
      return;
    }

    const taskReview =
      /^\/studio-api\/tasks\/([^/]+)\/review$/.exec(parsed.pathname);
    if (taskReview !== null) {
      requireMethod(parsed, ["POST"]);
      const review = await this.reviewTask(
        decodeSegment(taskReview[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, review });
      return;
    }

    const decisionAdr = /^\/studio-api\/decisions\/([^/]+)\/adr$/.exec(
      parsed.pathname,
    );
    if (decisionAdr !== null) {
      requireMethod(parsed, ["POST"]);
      const decision = await this.writeAdr(
        decodeSegment(decisionAdr[1] ?? ""),
      );
      sendJson(res, 200, { ok: true, decision });
      return;
    }

    if (parsed.pathname === `${API_PREFIX}/decisions`) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const decision = await this.store.createDecision(
        inputs.asCreateDecision(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, decision });
      return;
    }

    const decisionDecide =
      /^\/studio-api\/decisions\/([^/]+)\/decide$/.exec(parsed.pathname);
    if (decisionDecide !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const decision = await this.store.decideDecision(
        decodeSegment(decisionDecide[1] ?? ""),
        inputs.asDecideDecision(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, decision });
      return;
    }

    const taskMerge =
      /^\/studio-api\/tasks\/([^/]+)\/merge-proposal$/.exec(parsed.pathname);
    if (taskMerge !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const proposal = await this.store.createMergeProposal(
        decodeSegment(taskMerge[1] ?? ""),
        inputs.asCreateMergeProposal(await readJson(req)),
      );
      sendJson(res, 201, { ok: true, proposal });
      return;
    }

    const mergeDecision =
      /^\/studio-api\/merge-proposals\/([^/]+)\/(approve|reject|merge|execute|rollback)$/.exec(
        parsed.pathname,
      );
    if (mergeDecision !== null) {
      requireMethod(parsed, ["POST"]);
      assertJsonRequest(req);
      const body = await readJson(req);
      const proposalId = decodeSegment(mergeDecision[1] ?? "");
      const action = mergeDecision[2];
      const proposal =
        action === "approve"
          ? await this.store.approveMergeProposal(proposalId, inputs.asNote(body))
          : action === "reject"
            ? await this.store.rejectMergeProposal(
                proposalId,
                inputs.asNote(body) ?? "",
              )
            : action === "execute"
              ? await this.executeMerge(proposalId)
              : action === "rollback"
                ? await this.rollbackMerge(proposalId)
                : await this.store.completeMergeProposal(
                    proposalId,
                    inputs.asOptionalString(body.mergeCommit, "mergeCommit"),
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
        inputs.asUpdateTask(await readJson(req)),
      );
      sendJson(res, 200, { ok: true, task });
      return;
    }

    throw new HttpError(404, "not_found", "接口不存在");
  }
}


export { handleRouterError } from "./router/errors.js";
