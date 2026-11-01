import { randomUUID } from "node:crypto";

import { StudioStoreError } from "./core.js";
import { isStageArtifactKind } from "./validation.js";

import type {
  AcceptanceItem,
  EvidenceItem,
  ProjectStage,
  StageArtifact,
  StageArtifactKind,
  StageCheckItem,
  TriggerRules,
  TriggerSource,
  WebhookIngestResult,
} from "../../shared/types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function requiredText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
  }
  const text = value.trim();
  if (text === "") {
    throw new StudioStoreError("invalid_input", `${field} 不能为空`);
  }
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} 不能超过 ${String(max)} 个字符`,
    );
  }
  return text;
}

export function optionalText(value: unknown, field: string, max = 4000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new StudioStoreError("invalid_input", `${field} 必须是字符串`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} 不能超过 ${String(max)} 个字符`,
    );
  }
  return text;
}

export function optionalTokenBudget(
  value: unknown,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new StudioStoreError(
      "invalid_input",
      `${field} 必须是非负整数 token 数`,
    );
  }
  return value === 0 ? null : value;
}

export function textList(value: unknown, field: string, maxItems = 20): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", `${field} 必须是数组`);
  }
  return value
    .slice(0, maxItems)
    .map((item, index) => requiredText(item, `${field}[${String(index)}]`, 400));
}

export function defaultTriggerRules(): TriggerRules {
  return {
    enabled: false,
    sources: ["github", "ci", "im"],
    repos: [],
    labels: [],
    authors: [],
    mention: "",
  };
}

function webhookText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWebhookPayload(
  source: TriggerSource,
  payload: Record<string, unknown>,
): {
  title: string;
  body: string;
  url: string;
  externalId: string;
  threadKey: string;
  repo: string;
  labels: string[];
  author: string;
} {
  const repository = isRecord(payload.repository) ? payload.repository : {};
  const issue = isRecord(payload.issue)
    ? payload.issue
    : isRecord(payload.pull_request)
      ? payload.pull_request
      : {};
  const comment = isRecord(payload.comment) ? payload.comment : {};
  const sender = isRecord(payload.sender) ? payload.sender : {};
  const owner = isRecord(issue.user) ? issue.user : {};
  const repo =
    webhookText(payload.repo) ||
    webhookText(repository.full_name) ||
    webhookText(repository.name);
  const labels = Array.isArray(issue.labels)
    ? issue.labels
        .map((label) =>
          typeof label === "string"
            ? label
            : isRecord(label)
              ? webhookText(label.name)
              : "",
        )
        .filter(Boolean)
    : [];
  const number =
    typeof issue.number === "number" ? String(issue.number) : "";
  const title =
    webhookText(issue.title) ||
    webhookText(payload.title) ||
    webhookText(payload.summary) ||
    `${source} 事件`;
  const body =
    webhookText(issue.body) ||
    webhookText(comment.body) ||
    webhookText(payload.body) ||
    webhookText(payload.message);
  const externalId =
    webhookText(payload.id) ||
    webhookText(payload.event_id) ||
    (number !== ""
      ? `${source}:${repo}#${number}`
      : `${source}:${String(payload.action ?? "event")}:${title}`);
  return {
    title: title.slice(0, 240),
    body: body.slice(0, 8000),
    url:
      webhookText(issue.html_url) ||
      webhookText(payload.url) ||
      webhookText(payload.html_url),
    externalId,
    threadKey:
      webhookText(payload.threadKey) ||
      webhookText(payload.thread_key) ||
      (number !== "" ? `${source}:${repo}#${number}` : externalId),
    repo,
    labels,
    author:
      webhookText(sender.login) ||
      webhookText(owner.login) ||
      webhookText(payload.author),
  };
}

export function defaultStageChecklist(stage: ProjectStage): StageCheckItem[] {
  const texts: Record<Exclude<ProjectStage, "discovery">, string[]> = {
    architecture: [
      "PRD 已评审，范围与当前版本一致",
      "目标与非目标已写明",
      "验收标准可观察、可验证",
      "风险与未决问题已记录",
    ],
    prototype: [
      "架构文档已完成并经 Owner 确认",
      "模块边界与契约已建立",
      "测试策略与验证命令已确定",
      "高风险决策已有 ADR 或 Decision",
    ],
    development: [
      "Demo 脚本已通过",
      "Demo 证据已记录",
      "已知限制和改进项已列出",
      "已决定 evolve 或 rewrite",
    ],
  };
  return (texts[stage as Exclude<ProjectStage, "discovery">] ?? []).map(
    (text) => ({ id: newId("check"), text, done: false }),
  );
}

export function normalizeStageChecklist(value: unknown): StageCheckItem[] {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "checklist 必须是数组");
  }
  return value.slice(0, 30).map((raw, index) => {
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `checklist[${String(index)}] 必须是对象`,
      );
    }
    return {
      id:
        typeof raw.id === "string" && raw.id !== ""
          ? raw.id
          : newId("check"),
      text: requiredText(raw.text, `checklist[${String(index)}].text`, 500),
      done: raw.done === true,
    };
  });
}

export function normalizeStageArtifacts(value: unknown): StageArtifact[] {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "artifacts 必须是数组");
  }
  return value.slice(0, 20).map((raw, index) => {
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `artifacts[${String(index)}] 必须是对象`,
      );
    }
    const kind: StageArtifactKind = isStageArtifactKind(raw.kind)
      ? raw.kind
      : "other";
    return {
      id:
        typeof raw.id === "string" && raw.id !== ""
          ? raw.id
          : newId("artifact"),
      kind,
      label: requiredText(
        raw.label,
        `artifacts[${String(index)}].label`,
        160,
      ),
      path: requiredText(
        raw.path,
        `artifacts[${String(index)}].path`,
        500,
      ),
    };
  });
}

export function normalizeAcceptance(
  value: unknown,
  existing: AcceptanceItem[] = [],
): AcceptanceItem[] {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "acceptance 必须是数组");
  }
  if (value.length === 0) {
    throw new StudioStoreError(
      "acceptance_required",
      "至少需要一条可验证的验收标准",
    );
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 20).map((raw, index) => {
    if (typeof raw === "string") {
      const text = requiredText(raw, `acceptance[${String(index)}]`, 400);
      return { id: newId("acc"), text, done: false };
    }
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `acceptance[${String(index)}] 必须是字符串或对象`,
      );
    }
    const text = requiredText(
      raw.text,
      `acceptance[${String(index)}].text`,
      400,
    );
    const id =
      typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("acc");
    const previous = byId.get(id);
    return {
      id,
      text,
      done: typeof raw.done === "boolean" ? raw.done : (previous?.done ?? false),
    };
  });
}

export function normalizeEvidence(
  value: unknown,
  existing: EvidenceItem[],
  at: string,
): EvidenceItem[] {
  if (!Array.isArray(value)) {
    throw new StudioStoreError("invalid_input", "evidence 必须是数组");
  }
  const byId = new Map(existing.map((item) => [item.id, item]));
  return value.slice(0, 50).map((raw, index) => {
    if (!isRecord(raw)) {
      throw new StudioStoreError(
        "invalid_input",
        `evidence[${String(index)}] 必须是对象`,
      );
    }
    const text = requiredText(raw.text, `evidence[${String(index)}].text`, 800);
    const id =
      typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("ev");
    const previous = byId.get(id);
    return {
      id,
      text,
      createdAt:
        previous?.createdAt ??
        (typeof raw.createdAt === "string" ? raw.createdAt : at),
    };
  });
}

