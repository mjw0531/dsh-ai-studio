import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ProviderProbeResult } from "../shared/types.js";
import type { DispatcherContext } from "./dispatcher.js";
import type { StudioStore } from "./store.js";

const execFileAsync = promisify(execFile);

export class ProviderProbeService {
  private readonly store: StudioStore;
  private readonly ctx: Pick<
    DispatcherContext,
    "llm" | "agentDefaultModel"
  >;

  constructor(
    store: StudioStore,
    ctx: Pick<DispatcherContext, "llm" | "agentDefaultModel">,
  ) {
    this.store = store;
    this.ctx = ctx;
  }

  async check(profileId: string): Promise<ProviderProbeResult> {
    const profile = await this.store.getProviderProfile(profileId);
    const checkedAt = new Date().toISOString();
    if (profile.executor !== "dsh") {
      return this.checkExternal(profile, checkedAt);
    }
    return this.checkDsh(profile, checkedAt);
  }

  private async checkDsh(
    profile: Awaited<ReturnType<StudioStore["getProviderProfile"]>>,
    checkedAt: string,
  ): Promise<ProviderProbeResult> {
    const providers = this.ctx.llm.listProviders();
    const fallback = this.ctx.agentDefaultModel.currentSelection();
    let providerId = profile.provider || "";
    let modelId = profile.model || fallback.model;

    if (providerId === "" && modelId !== "") {
      for (const provider of providers) {
        const models = await this.ctx.llm.listModels(provider.id);
        if (models.some((model) => model.id === modelId)) {
          providerId = provider.id;
          break;
        }
      }
    }
    if (providerId === "") {
      providerId = fallback.provider;
    }
    const provider = providers.find((item) => item.id === providerId);
    if (provider === undefined) {
      return {
        profileId: profile.id,
        executor: profile.executor,
        provider: providerId,
        model: modelId,
        ok: false,
        checkedAt,
        message: `找不到 DSH provider：${providerId || "(空)"}。可用：${
          providers.map((item) => item.id).join(", ") || "无"
        }`,
        availableModels: [],
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
        message: `provider ${providerId} 没有模型 ${modelId}`,
        availableModels: models.slice(0, 50).map((model) => model.id),
      };
    }
    return {
      profileId: profile.id,
      executor: profile.executor,
      provider: providerId,
      model: modelId,
      ok: true,
      checkedAt,
      message: `provider / model 路由存在：${providerId} / ${modelId}`,
      availableModels: models.slice(0, 50).map((model) => model.id),
    };
  }

  private async checkExternal(
    profile: Awaited<ReturnType<StudioStore["getProviderProfile"]>>,
    checkedAt: string,
  ): Promise<ProviderProbeResult> {
    const binary = profile.executor === "claude-code" ? "claude" : "codex";
    const locator = process.platform === "win32" ? "where" : "which";
    try {
      await execFileAsync(locator, [binary], {
        timeout: 5_000,
        windowsHide: true,
      });
      return {
        profileId: profile.id,
        executor: profile.executor,
        provider: "external",
        model: profile.model || profile.executor,
        ok: true,
        checkedAt,
        message: `找到 ${binary} 可执行文件；登录状态未验证，仍以实际任务执行为准。`,
        availableModels: [],
      };
    } catch (error) {
      return {
        profileId: profile.id,
        executor: profile.executor,
        provider: "external",
        model: profile.model || profile.executor,
        ok: false,
        checkedAt,
        message: `找不到 ${binary} 可执行文件：${
          error instanceof Error ? error.message : String(error)
        }`,
        availableModels: [],
      };
    }
  }
}
