import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { STUDIO_PLUGIN_VERSION } from "../shared/types.js";
import {
  compatibilityOf,
  hostCapabilities,
  readRuntimeInfo,
  safeOrigin,
} from "./compat.js";
import { AdrService } from "./adr.js";
import { ProjectBundleService } from "./bundle.js";
import { AgentDispatcher } from "./dispatcher.js";
import type { DispatcherContext } from "./dispatcher.js";
import { DocsService } from "./docs.js";
import { GitMergeService } from "./merge.js";
import { handleRouterError, StudioRouter } from "./router.js";
import { StudioStore } from "./store.js";
import { VerificationService } from "./verify.js";

/** Cordis plugin name shown in Loader logs. */
export const name = "dsh-studio";

/** Web/Desktop HTTP surface plus the DSH Agent runtime used by dispatch. */
export const inject = [
  "webServer",
  "connection",
  "agents",
  "agentPresets",
  "agentDefaultModel",
  "llm",
  "tokenMeter",
];

interface WebServerLike {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
  getOrigin?(): string;
}

interface ConnectionLike {
  admit(request: Request): { peer?: unknown; rejection?: number };
}

interface LoggerLike {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface StudioHostContext {
  webServer: WebServerLike;
  connection: ConnectionLike;
  agents: unknown;
  agentPresets: unknown;
  agentDefaultModel: unknown;
  llm: unknown;
  tokenMeter: unknown;
  logger?: LoggerLike;
  on?(
    event: "webserver/index-inject",
    listener: (rows: unknown[]) => void,
  ): () => void;
  effect?(
    execute: () => (() => void) | Promise<() => void>,
    label?: string,
  ): void;
}

interface BootPayload {
  token: string;
  basePath: string;
  pluginVersion: string;
  dshVersion: string;
  startedAt: string;
  dataDir: string;
}

/**
 * Mount the Studio HTTP API and the boot payload consumed by the browser half.
 *
 * The boot payload is a structured `global` index-injection row rather than a
 * raw `tapIndex` transform. The Web SPA and the Desktop shell both collect the
 * structured table; the Desktop shell does not run raw index taps because it
 * does not serve the index through `dsh-host-webserver`'s fallback.
 */
export async function apply(ctx: StudioHostContext): Promise<void> {
  const runtime = await readRuntimeInfo();
  const compatibility = compatibilityOf(runtime.version);
  const capabilities = hostCapabilities(ctx, runtime.version);
  if (
    !capabilities.webServer ||
    typeof ctx.webServer.register !== "function" ||
    typeof ctx.on !== "function" ||
    typeof ctx.connection?.admit !== "function"
  ) {
    ctx.logger?.error(
      "dsh-studio: this DSH build does not expose webServer.register + connection.admit; the Studio page stays unmounted.",
    );
    return;
  }

  const store = new StudioStore();
  await store.init();
  const dispatcher = new AgentDispatcher(
    ctx as unknown as DispatcherContext,
    store,
  );
  const verifier = new VerificationService(store);
  const docs = new DocsService(store);
  const merger = new GitMergeService(store);
  const adr = new AdrService(store);
  const bundles = new ProjectBundleService(store);

  const token = randomBytes(24).toString("hex");
  const startedAt = new Date().toISOString();
  const bootPayload: BootPayload = {
    token,
    basePath: "/studio-api",
    pluginVersion: STUDIO_PLUGIN_VERSION,
    dshVersion: runtime.version,
    startedAt,
    dataDir: store.dataDir,
  };
  const router = new StudioRouter({
    store,
    token,
    dshVersion: runtime.version,
    compatibility,
    connection: ctx.connection,
    getBootPayload: () => bootPayload,
    dispatchTask: (taskId) => dispatcher.dispatch(taskId),
    verifyTask: (taskId, command) => verifier.verify(taskId, command),
    reviewTask: (taskId) => dispatcher.review(taskId),
    executeMerge: (proposalId) => merger.execute(proposalId),
    rollbackMerge: (proposalId) => merger.rollback(proposalId),
    writeAdr: (decisionId) => adr.write(decisionId),
    exportProjectBundle: (projectId) =>
      bundles.exportProject(projectId, runtime.version),
    readProjectDoc: (path) => docs.read(path),
  });

  const install = (): (() => void) => {
    const disposeRoute = ctx.webServer.register({
      kind: "prefix",
      path: "/studio-api",
      handler: async (req, res) => {
        try {
          await router.handle(req, res);
        } catch (error) {
          if (res.headersSent) {
            res.destroy();
            return;
          }
          handleRouterError(res, error);
        }
      },
    });
    const disposeInjection = ctx.on?.("webserver/index-inject", (rows) => {
      rows.push({
        kind: "global",
        name: "__DSH_STUDIO__",
        value: bootPayload,
      });
    });
    return () => {
      disposeRoute();
      disposeInjection?.();
    };
  };

  if (typeof ctx.effect === "function") {
    ctx.effect(install, "dsh-studio: route + boot payload");
  } else {
    install();
  }

  ctx.logger?.info(
    `dsh-studio ${STUDIO_PLUGIN_VERSION} ready (DSH ${runtime.version}, origin ${safeOrigin(ctx) ?? "unknown"}, data ${store.dataDir})`,
  );
  if (compatibility.status !== "supported") {
    ctx.logger?.warn(`dsh-studio compatibility: ${compatibility.message}`);
  }
}
