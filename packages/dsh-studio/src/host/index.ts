import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { STUDIO_PLUGIN_VERSION } from "../shared/types.js";
import {
  compatibilityOf,
  hostCapabilities,
  readRuntimeInfo,
  safeOrigin,
} from "./compat.js";
import { handleRouterError, StudioRouter } from "./router.js";
import { StudioStore } from "./store.js";

/** Cordis plugin name shown in Loader logs. */
export const name = "dsh-studio";

/** The Web-only v0.1 surface needs the HTTP route registry. */
export const inject = ["webServer"];

interface WebServerLike {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
  tapIndex(transform: (html: string) => string): () => void;
  getOrigin?(): string;
}

interface LoggerLike {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface StudioHostContext {
  webServer: WebServerLike;
  logger?: LoggerLike;
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

function injectBoot(html: string, payload: BootPayload): string {
  const json = JSON.stringify(payload).replaceAll("<", "\\u003c");
  const script = `<script>globalThis.__DSH_STUDIO__=${json}</script>`;
  const at = html.indexOf("</head>");
  if (at === -1) return `${script}${html}`;
  return `${html.slice(0, at)}${script}${html.slice(at)}`;
}

/**
 * Mount the Studio HTTP API and the boot payload consumed by the browser half.
 *
 * The host half deliberately owns no model-facing tool yet: v0.1 is the
 * independent workbench page and its durable project/task state.
 */
export async function apply(ctx: StudioHostContext): Promise<void> {
  const runtime = await readRuntimeInfo();
  const compatibility = compatibilityOf(runtime.version);
  const capabilities = hostCapabilities(ctx, runtime.version);
  if (
    !capabilities.webServer ||
    typeof ctx.webServer.register !== "function" ||
    typeof ctx.webServer.tapIndex !== "function"
  ) {
    ctx.logger?.error(
      "dsh-studio: this DSH build does not expose ctx.webServer.register/tapIndex; the Studio page stays unmounted.",
    );
    return;
  }

  const store = new StudioStore();
  await store.init();

  const token = randomBytes(24).toString("hex");
  const startedAt = new Date().toISOString();
  const router = new StudioRouter({
    store,
    token,
    dshVersion: runtime.version,
    compatibility,
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
    const disposeIndex = ctx.webServer.tapIndex((html) =>
      injectBoot(html, {
        token,
        basePath: "/studio-api",
        pluginVersion: STUDIO_PLUGIN_VERSION,
        dshVersion: runtime.version,
        startedAt,
        dataDir: store.dataDir,
      }),
    );
    return () => {
      disposeRoute();
      disposeIndex();
    };
  };

  if (typeof ctx.effect === "function") {
    ctx.effect(install, "dsh-studio: http + boot payload");
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
