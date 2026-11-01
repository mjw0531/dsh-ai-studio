import test from "node:test";
import assert from "node:assert/strict";

import { ProviderProbeService } from "../lib/probe.js";

function context({ providers, models, fallback }) {
  return {
    agentDefaultModel: {
      currentSelection: () => fallback,
    },
    llm: {
      listProviders: () => providers.map((id) => ({ id })),
      listModels: async (id) => (models[id] ?? []).map((model) => ({ id: model })),
    },
  };
}

function storeFor(profile) {
  return {
    getProviderProfile: async () => profile,
  };
}

test("probes a DSH provider and model", async () => {
  const service = new ProviderProbeService(
    storeFor({
      id: "provider-1",
      executor: "dsh",
      provider: "deepseek-account",
      model: "deepseek-flash",
    }),
    context({
      providers: ["deepseek-account"],
      models: { "deepseek-account": ["deepseek-flash", "deepseek-pro"] },
      fallback: { provider: "deepseek-account", model: "deepseek-flash" },
    }),
  );
  const result = await service.check("provider-1");
  assert.equal(result.ok, true);
  assert.equal(result.provider, "deepseek-account");
  assert.equal(result.model, "deepseek-flash");
  assert.deepEqual(result.availableModels, ["deepseek-flash", "deepseek-pro"]);
});

test("reports a missing model with available options", async () => {
  const service = new ProviderProbeService(
    storeFor({
      id: "provider-2",
      executor: "dsh",
      provider: "deepseek-account",
      model: "missing-model",
    }),
    context({
      providers: ["deepseek-account"],
      models: { "deepseek-account": ["deepseek-flash"] },
      fallback: { provider: "deepseek-account", model: "deepseek-flash" },
    }),
  );
  const result = await service.check("provider-2");
  assert.equal(result.ok, false);
  assert.match(result.message, /missing-model/);
  assert.deepEqual(result.availableModels, ["deepseek-flash"]);
});

test("finds a provider when only the model is configured", async () => {
  const service = new ProviderProbeService(
    storeFor({
      id: "provider-3",
      executor: "dsh",
      provider: "",
      model: "deepseek-pro",
    }),
    context({
      providers: ["other", "deepseek-account"],
      models: {
        other: ["other-model"],
        "deepseek-account": ["deepseek-pro"],
      },
      fallback: { provider: "other", model: "other-model" },
    }),
  );
  const result = await service.check("provider-3");
  assert.equal(result.ok, true);
  assert.equal(result.provider, "deepseek-account");
});
