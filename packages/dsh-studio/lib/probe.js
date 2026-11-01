// src/host/probe.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var ProviderProbeService = class {
  store;
  ctx;
  constructor(store, ctx) {
    this.store = store;
    this.ctx = ctx;
  }
  async check(profileId) {
    const profile = await this.store.getProviderProfile(profileId);
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (profile.executor !== "dsh") {
      return this.checkExternal(profile, checkedAt);
    }
    return this.checkDsh(profile, checkedAt);
  }
  async checkDsh(profile, checkedAt) {
    const providers = this.ctx.llm.listProviders();
    const fallback = this.ctx.agentDefaultModel.currentSelection();
    let providerId = profile.provider || "";
    let modelId = profile.model || fallback.model;
    if (providerId === "" && modelId !== "") {
      for (const provider2 of providers) {
        const models2 = await this.ctx.llm.listModels(provider2.id);
        if (models2.some((model) => model.id === modelId)) {
          providerId = provider2.id;
          break;
        }
      }
    }
    if (providerId === "") {
      providerId = fallback.provider;
    }
    const provider = providers.find((item) => item.id === providerId);
    if (provider === void 0) {
      return {
        profileId: profile.id,
        executor: profile.executor,
        provider: providerId,
        model: modelId,
        ok: false,
        checkedAt,
        message: `\u627E\u4E0D\u5230 DSH provider\uFF1A${providerId || "(\u7A7A)"}\u3002\u53EF\u7528\uFF1A${providers.map((item) => item.id).join(", ") || "\u65E0"}`,
        availableModels: []
      };
    }
    const models = await this.ctx.llm.listModels(provider.id);
    if (modelId === "") {
      modelId = fallback.model;
    }
    const matched = models.some((model) => model.id === modelId);
    if (!matched) {
      return {
        profileId: profile.id,
        executor: profile.executor,
        provider: providerId,
        model: modelId,
        ok: false,
        checkedAt,
        message: `provider ${providerId} \u6CA1\u6709\u6A21\u578B ${modelId}`,
        availableModels: models.slice(0, 50).map((model) => model.id)
      };
    }
    return {
      profileId: profile.id,
      executor: profile.executor,
      provider: providerId,
      model: modelId,
      ok: true,
      checkedAt,
      message: `provider / model \u8DEF\u7531\u5B58\u5728\uFF1A${providerId} / ${modelId}`,
      availableModels: models.slice(0, 50).map((model) => model.id)
    };
  }
  async checkExternal(profile, checkedAt) {
    const binary = profile.executor === "claude-code" ? "claude" : "codex";
    const locator = process.platform === "win32" ? "where" : "which";
    try {
      await execFileAsync(locator, [binary], {
        timeout: 5e3,
        windowsHide: true
      });
      return {
        profileId: profile.id,
        executor: profile.executor,
        provider: "external",
        model: profile.model || profile.executor,
        ok: true,
        checkedAt,
        message: `\u627E\u5230 ${binary} \u53EF\u6267\u884C\u6587\u4EF6\uFF1B\u767B\u5F55\u72B6\u6001\u672A\u9A8C\u8BC1\uFF0C\u4ECD\u4EE5\u5B9E\u9645\u4EFB\u52A1\u6267\u884C\u4E3A\u51C6\u3002`,
        availableModels: []
      };
    } catch (error) {
      return {
        profileId: profile.id,
        executor: profile.executor,
        provider: "external",
        model: profile.model || profile.executor,
        ok: false,
        checkedAt,
        message: `\u627E\u4E0D\u5230 ${binary} \u53EF\u6267\u884C\u6587\u4EF6\uFF1A${error instanceof Error ? error.message : String(error)}`,
        availableModels: []
      };
    }
  }
};
export {
  ProviderProbeService
};
