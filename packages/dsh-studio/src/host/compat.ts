import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CompatibilityInfo } from "../shared/types.js";

export const TESTED_DSH_VERSION = "0.2.1-rc.2";
export const SUPPORTED_DSH_RANGE = ">=0.2.1-rc.2";

export interface RuntimeInfo {
  version: string;
  source: "env" | "app-boot" | "install" | "unknown";
}

interface ElectronProcess extends NodeJS.Process {
  resourcesPath?: string;
}

function normalizeVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

/**
 * Read the version from the packaged Electron installation.
 *
 * Node's fs is asar-aware inside Electron, and the dsh runtime package sits at
 * `<resources>/app.asar/dsh/package.json`. This fallback keeps the page useful
 * when `@deepseek-ai/dsh-app-boot` is not resolvable from a third-party plugin.
 */
async function readInstallVersion(): Promise<string | null> {
  const candidates: string[] = [];
  const electron = process as ElectronProcess;
  if (
    typeof electron.resourcesPath === "string" &&
    electron.resourcesPath !== ""
  ) {
    candidates.push(
      path.join(electron.resourcesPath, "app.asar", "dsh", "package.json"),
    );
  }
  const exeDir = path.dirname(process.execPath);
  candidates.push(
    path.join(exeDir, "resources", "app.asar", "dsh", "package.json"),
    path.join(exeDir, "resources", "app", "dsh", "package.json"),
  );
  for (const candidate of candidates) {
    try {
      const manifest: unknown = JSON.parse(await readFile(candidate, "utf8"));
      if (typeof manifest === "object" && manifest !== null) {
        const version = normalizeVersion(
          (manifest as { version?: unknown }).version,
        );
        if (version !== null) return version;
      }
    } catch {
      // Try the next installation layout.
    }
  }
  return null;
}

/**
 * 读取当前 DSH 版本。优先使用 app-boot 的公开 helper，失败时退回安装包
 * 清单和环境变量。
 */
export async function readRuntimeInfo(): Promise<RuntimeInfo> {
  const envVersion =
    normalizeVersion(process.env.DSH_CLIENT_VERSION) ??
    normalizeVersion(process.env.DSH_VERSION);
  try {
    const mod = await import("@deepseek-ai/dsh-app-boot");
    const version = normalizeVersion(mod.getDshRuntimeVersion());
    if (version !== null) {
      return { version, source: "app-boot" };
    }
  } catch {
    // Older/newer DSH may not expose this helper. Fall through.
  }
  const installVersion = await readInstallVersion();
  if (installVersion !== null) {
    return { version: installVersion, source: "install" };
  }
  if (envVersion !== null && envVersion !== undefined) {
    return { version: envVersion, source: "env" };
  }
  return { version: "unknown", source: "unknown" };
}

export function compatibilityOf(version: string): CompatibilityInfo {
  if (version === "unknown") {
    return {
      status: "unknown",
      testedWith: TESTED_DSH_VERSION,
      message: `无法读取 DSH 版本；插件按能力探测运行，已在 ${TESTED_DSH_VERSION} 上验证。`,
    };
  }
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) {
    return {
      status: "unknown",
      testedWith: TESTED_DSH_VERSION,
      message: `DSH 版本格式无法识别（${version}）；按能力探测运行。`,
    };
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const supported = major > 0 || minor >= 2;
  return supported
    ? {
        status: "supported",
        testedWith: TESTED_DSH_VERSION,
        message: `当前 DSH ${version} 满足 ${SUPPORTED_DSH_RANGE}；Studio 仅依赖 Web Server 路由、slots 和 React，遇到缺失能力会降级而不是崩溃。`,
      }
    : {
        status: "untested",
        testedWith: TESTED_DSH_VERSION,
        message: `当前 DSH ${version} 低于已验证基线 ${TESTED_DSH_VERSION}；页面可能无法加载，建议升级 DSH。`,
      };
}

export interface HostCapabilities {
  webServer: boolean;
  logger: boolean;
  effect: boolean;
  version: string;
}

export function hostCapabilities(ctx: unknown, version: string): HostCapabilities {
  const record =
    typeof ctx === "object" && ctx !== null
      ? (ctx as Record<string, unknown>)
      : {};
  return {
    webServer: typeof record.webServer === "object" && record.webServer !== null,
    logger: typeof record.logger === "object" && record.logger !== null,
    effect: typeof record.effect === "function",
    version,
  };
}

/**
 * 读取 Web Server 的 origin；在某些嵌入式/未来宿主中可能不可用。
 * 仅用于诊断展示，不参与鉴权。
 */
export function safeOrigin(ctx: unknown): string | null {
  try {
    const record =
      typeof ctx === "object" && ctx !== null
        ? (ctx as { webServer?: { getOrigin?: () => string } })
        : {};
    const origin = record.webServer?.getOrigin?.();
    return typeof origin === "string" ? origin : null;
  } catch {
    return null;
  }
}
