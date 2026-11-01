import { randomUUID } from "node:crypto";

import { isTaskPriority } from "../../shared/types.js";
import { isTriggerSource } from "./validation.js";
import type {
  AcceptTriggerInput,
  CreateTriggerInput,
  Task,
  Trigger,
  TriggerRules,
  TriggerSource,
  UpdateTriggerRulesInput,
  WebhookIngestResult,
} from "../../shared/types.js";
import { StudioStoreError } from "./errors.js";
import {
  normalizeAcceptance,
  normalizeWebhookPayload,
  optionalText,
  requiredText,
  textList,
} from "./inputs.js";
import { newId } from "./ids.js";
import { findProject, findTask, findTrigger, pickProject } from "./lookups.js";
import type { StoreContext } from "./context.js";

export async function ingestTrigger(
  ctx: StoreContext,input: CreateTriggerInput): Promise<Trigger> {
    return ctx.runExclusive(async () => {
      if (
        !isTriggerSource(input.source) ||
        typeof input.title !== "string" ||
        input.title.trim() === ""
      ) {
        throw new StudioStoreError(
          "invalid_input",
          "触发事件必须有受支持的 source 和 title",
        );
      }
      const state = ctx.requireState();
      const project = pickProject(state, undefined);
      if (project === null) {
        throw new StudioStoreError("project_required", "请先创建一个项目");
      }
      const externalId = optionalText(input.externalId, "externalId", 240);
      if (externalId !== "") {
        const duplicate = state.triggers.find(
          (trigger) =>
            trigger.projectId === project.id &&
            trigger.source === input.source &&
            trigger.externalId === externalId,
        );
        if (duplicate !== undefined) return structuredClone(duplicate);
      }
      const threadKey =
        optionalText(input.threadKey, "threadKey", 240) ||
        externalId ||
        `thread-${randomUUID().slice(0, 8)}`;
      const title = requiredText(input.title, "title", 240);
      const at = ctx.now();
      let thread = state.threads.find(
        (item) => item.projectId === project.id && item.key === threadKey,
      );
      if (thread === undefined) {
        thread = {
          id: newId("thread"),
          projectId: project.id,
          key: threadKey,
          source: input.source,
          title,
          taskId: null,
          triggerIds: [],
          createdAt: at,
          updatedAt: at,
        };
        state.threads.push(thread);
      }
      const trigger: Trigger = {
        id: newId("trigger"),
        projectId: project.id,
        source: input.source,
        externalId,
        threadKey,
        title,
        body: optionalText(input.body, "body", 8000),
        url: optionalText(input.url, "url", 1000),
        status: thread.taskId === null ? "pending" : "accepted",
        taskId: thread.taskId,
        threadId: thread.id,
        note: "",
        createdAt: at,
        updatedAt: at,
      };
      state.triggers.push(trigger);
      thread.triggerIds.push(trigger.id);
      thread.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "trigger.received",
        at,
        projectId: project.id,
        taskId: thread.taskId,
        payload: {
          source: trigger.source,
          threadKey,
          routedToExistingTask: thread.taskId !== null,
        },
      });
      await ctx.save();
      return structuredClone(trigger);
    });
  }

export async function getTriggerRules(
  ctx: StoreContext,projectId: string): Promise<TriggerRules> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      return structuredClone(findProject(state, projectId).triggerRules);
    });
  }

export async function updateTriggerRules(
  ctx: StoreContext,
    projectId: string,
    input: UpdateTriggerRulesInput,
  ): Promise<TriggerRules> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const project = findProject(state, projectId);
      if (input.enabled !== undefined) {
        project.triggerRules.enabled = input.enabled;
      }
      if (input.sources !== undefined) {
        project.triggerRules.sources = input.sources.filter(isTriggerSource);
      }
      if (input.repos !== undefined) {
        project.triggerRules.repos = textList(input.repos, "repos", 20);
      }
      if (input.labels !== undefined) {
        project.triggerRules.labels = textList(input.labels, "labels", 20);
      }
      if (input.authors !== undefined) {
        project.triggerRules.authors = textList(
          input.authors,
          "authors",
          20,
        );
      }
      if (input.mention !== undefined) {
        project.triggerRules.mention = optionalText(
          input.mention,
          "mention",
          120,
        );
      }
      project.updatedAt = ctx.now();
      state.updatedAt = project.updatedAt;
      ctx.recordEvent(state, {
        type: "trigger.rules_updated",
        at: project.updatedAt,
        projectId: project.id,
        payload: { enabled: project.triggerRules.enabled },
      });
      await ctx.save();
      return structuredClone(project.triggerRules);
    });
  }

export async function ingestWebhook(
  ctx: StoreContext,
    projectId: string,
    source: TriggerSource,
    payload: Record<string, unknown>,
  ): Promise<WebhookIngestResult> {
    const rules = await getTriggerRules(ctx, projectId);
    if (!rules.enabled) {
      return rejectWebhook(ctx, projectId, source, "Webhook 未启用");
    }
    if (!rules.sources.includes(source)) {
      return rejectWebhook(ctx, projectId, source, "source 不在允许列表");
    }
    const normalized = normalizeWebhookPayload(source, payload);
    if (
      rules.repos.length > 0 &&
      !rules.repos.some(
        (repo) => repo.toLowerCase() === normalized.repo.toLowerCase(),
      )
    ) {
      return rejectWebhook(ctx, projectId, source, "repo 不匹配");
    }
    if (
      rules.labels.length > 0 &&
      !rules.labels.some((label) =>
        normalized.labels.some(
          (current) => current.toLowerCase() === label.toLowerCase(),
        ),
      )
    ) {
      return rejectWebhook(ctx, projectId, source, "label 不匹配");
    }
    if (
      rules.authors.length > 0 &&
      !rules.authors.some(
        (author) =>
          author.toLowerCase() === normalized.author.toLowerCase(),
      )
    ) {
      return rejectWebhook(ctx, projectId, source, "author 不匹配");
    }
    if (
      rules.mention !== "" &&
      !`${normalized.title}\n${normalized.body}`.includes(rules.mention)
    ) {
      return rejectWebhook(ctx, projectId, source, "mention 不匹配");
    }
    const trigger = await ingestTrigger(ctx, {
      source,
      externalId: normalized.externalId,
      threadKey: normalized.threadKey,
      title: normalized.title,
      body: normalized.body,
      url: normalized.url,
    });
    return {
      accepted: true,
      reason: "accepted",
      trigger,
    };
  }

export async function rejectWebhook(
  ctx: StoreContext,
    projectId: string,
    source: TriggerSource,
    reason: string,
  ): Promise<WebhookIngestResult> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const at = ctx.now();
      ctx.recordEvent(state, {
        type: "trigger.webhook_filtered",
        at,
        projectId,
        payload: { source, reason },
      });
      await ctx.save();
      return { accepted: false, reason, trigger: null };
    });
  }

export async function acceptTrigger(
  ctx: StoreContext,
    triggerId: string,
    input: AcceptTriggerInput = {},
  ): Promise<{ trigger: Trigger; task: Task }> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const trigger = findTrigger(state, triggerId);
      if (trigger.status === "ignored") {
        throw new StudioStoreError(
          "trigger_ignored",
          "已忽略的触发事件不能转为任务",
          409,
        );
      }
      const project = findProject(state, trigger.projectId);
      if (trigger.status === "accepted" && trigger.taskId !== null) {
        return {
          trigger: structuredClone(trigger),
          task: structuredClone(findTask(state, trigger.taskId)),
        };
      }

      const thread =
        trigger.threadId === null
          ? undefined
          : state.threads.find((item) => item.id === trigger.threadId);
      if (thread?.taskId !== null && thread?.taskId !== undefined) {
        const at = ctx.now();
        const task = findTask(state, thread.taskId);
        trigger.status = "accepted";
        trigger.taskId = task.id;
        trigger.updatedAt = at;
        task.evidence.push({
          id: newId("ev"),
          text: `触发事件：${trigger.title}`,
          createdAt: at,
        });
        task.updatedAt = at;
        state.updatedAt = at;
        ctx.recordEvent(state, {
          type: "trigger.routed",
          at,
          projectId: project.id,
          taskId: task.id,
          payload: { triggerId: trigger.id, source: trigger.source },
        });
        await ctx.save();
        return {
          trigger: structuredClone(trigger),
          task: structuredClone(task),
        };
      }

      const roles = state.roles.filter((role) => role.projectId === project.id);
      const lead =
        roles.find((role) => role.name.toLowerCase() === "lead") ?? roles[0];
      const reviewer =
        roles.find((role) => role.name.toLowerCase() === "verifier") ??
        roles.find((role) => role.name.toLowerCase() === "architect") ??
        lead;
      const at = ctx.now();
      const acceptance = normalizeAcceptance(
        input.acceptance !== undefined && input.acceptance.length > 0
          ? input.acceptance
          : ["人工确认触发内容与验收标准"],
        [],
      );
      const task: Task = {
        id: newId("task"),
        projectId: project.id,
        title: trigger.title,
        goal: trigger.body || trigger.title,
        status: "backlog",
        priority: isTaskPriority(input.priority) ? input.priority : "P1",
        ownerRoleId: input.ownerRoleId ?? lead?.id ?? null,
        reviewerRoleId: input.reviewerRoleId ?? reviewer?.id ?? null,
        acceptance,
        evidence: [],
        branch: null,
        verifyCommand: null,
        module: null,
        contractRef: null,
        requirementRefs: [`trigger:${trigger.id}`],
        kind: "new",
        diagnosis: "",
        plan: "",
        integration: false,
        originTaskId: null,
        docsSynced: false,
        createdAt: at,
        updatedAt: at,
      };
      state.tasks.push(task);
      trigger.status = "accepted";
      trigger.taskId = task.id;
      trigger.updatedAt = at;
      if (thread !== undefined) {
        thread.taskId = task.id;
        thread.updatedAt = at;
      }
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "trigger.accepted",
        at,
        projectId: project.id,
        taskId: task.id,
        payload: { triggerId: trigger.id, source: trigger.source },
      });
      await ctx.save();
      return {
        trigger: structuredClone(trigger),
        task: structuredClone(task),
      };
    });
  }

export async function ignoreTrigger(
  ctx: StoreContext,triggerId: string, note = ""): Promise<Trigger> {
    return ctx.runExclusive(async () => {
      const state = ctx.requireState();
      const trigger = findTrigger(state, triggerId);
      if (trigger.status === "accepted") {
        throw new StudioStoreError(
          "trigger_accepted",
          "已转为任务的触发事件不能忽略",
          409,
        );
      }
      const at = ctx.now();
      trigger.status = "ignored";
      trigger.note = optionalText(note, "note", 2000);
      trigger.updatedAt = at;
      state.updatedAt = at;
      ctx.recordEvent(state, {
        type: "trigger.ignored",
        at,
        projectId: trigger.projectId,
        taskId: null,
        payload: { triggerId: trigger.id },
      });
      await ctx.save();
      return structuredClone(trigger);
    });
  }

