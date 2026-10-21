// src/host/compat.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
var TESTED_DSH_VERSION = "0.2.1-rc.2";
var SUPPORTED_DSH_RANGE = ">=0.2.1-rc.2";
function normalizeVersion(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}
async function readInstallVersion() {
  const candidates = [];
  const electron = process;
  if (typeof electron.resourcesPath === "string" && electron.resourcesPath !== "") {
    candidates.push(
      path.join(electron.resourcesPath, "app.asar", "dsh", "package.json")
    );
  }
  const exeDir = path.dirname(process.execPath);
  candidates.push(
    path.join(exeDir, "resources", "app.asar", "dsh", "package.json"),
    path.join(exeDir, "resources", "app", "dsh", "package.json")
  );
  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(await readFile(candidate, "utf8"));
      if (typeof manifest === "object" && manifest !== null) {
        const version = normalizeVersion(
          manifest.version
        );
        if (version !== null) return version;
      }
    } catch {
    }
  }
  return null;
}
async function readRuntimeInfo() {
  const envVersion = normalizeVersion(process.env.DSH_CLIENT_VERSION) ?? normalizeVersion(process.env.DSH_VERSION);
  try {
    const mod = await import("@deepseek-ai/dsh-app-boot");
    const version = normalizeVersion(mod.getDshRuntimeVersion());
    if (version !== null) {
      return { version, source: "app-boot" };
    }
  } catch {
  }
  const installVersion = await readInstallVersion();
  if (installVersion !== null) {
    return { version: installVersion, source: "install" };
  }
  if (envVersion !== null && envVersion !== void 0) {
    return { version: envVersion, source: "env" };
  }
  return { version: "unknown", source: "unknown" };
}
function compatibilityOf(version) {
  if (version === "unknown") {
    return {
      status: "unknown",
      testedWith: TESTED_DSH_VERSION,
      message: `\u65E0\u6CD5\u8BFB\u53D6 DSH \u7248\u672C\uFF1B\u63D2\u4EF6\u6309\u80FD\u529B\u63A2\u6D4B\u8FD0\u884C\uFF0C\u5DF2\u5728 ${TESTED_DSH_VERSION} \u4E0A\u9A8C\u8BC1\u3002`
    };
  }
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) {
    return {
      status: "unknown",
      testedWith: TESTED_DSH_VERSION,
      message: `DSH \u7248\u672C\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B\uFF08${version}\uFF09\uFF1B\u6309\u80FD\u529B\u63A2\u6D4B\u8FD0\u884C\u3002`
    };
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const supported = major > 0 || minor >= 2;
  return supported ? {
    status: "supported",
    testedWith: TESTED_DSH_VERSION,
    message: `\u5F53\u524D DSH ${version} \u6EE1\u8DB3 ${SUPPORTED_DSH_RANGE}\uFF1BStudio \u4EC5\u4F9D\u8D56 Web Server \u8DEF\u7531\u3001slots \u548C React\uFF0C\u9047\u5230\u7F3A\u5931\u80FD\u529B\u4F1A\u964D\u7EA7\u800C\u4E0D\u662F\u5D29\u6E83\u3002`
  } : {
    status: "untested",
    testedWith: TESTED_DSH_VERSION,
    message: `\u5F53\u524D DSH ${version} \u4F4E\u4E8E\u5DF2\u9A8C\u8BC1\u57FA\u7EBF ${TESTED_DSH_VERSION}\uFF1B\u9875\u9762\u53EF\u80FD\u65E0\u6CD5\u52A0\u8F7D\uFF0C\u5EFA\u8BAE\u5347\u7EA7 DSH\u3002`
  };
}
function hostCapabilities(ctx, version) {
  const record = typeof ctx === "object" && ctx !== null ? ctx : {};
  return {
    webServer: typeof record.webServer === "object" && record.webServer !== null,
    logger: typeof record.logger === "object" && record.logger !== null,
    effect: typeof record.effect === "function",
    version
  };
}
function safeOrigin(ctx) {
  try {
    const record = typeof ctx === "object" && ctx !== null ? ctx : {};
    const origin = record.webServer?.getOrigin?.();
    return typeof origin === "string" ? origin : null;
  } catch {
    return null;
  }
}
export {
  SUPPORTED_DSH_RANGE,
  TESTED_DSH_VERSION,
  compatibilityOf,
  hostCapabilities,
  readRuntimeInfo,
  safeOrigin
};
