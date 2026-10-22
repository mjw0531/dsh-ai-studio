import type {
  AgentRun,
  ApiErrorBody,
  BootstrapResponse,
  CreateDecisionInput,
  DecideDecisionInput,
  Decision,
  CreateMergeProposalInput,
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  CreateModuleInput,
  IndependentReview,
  MergeProposal,
  Module,
  Project,
  ProjectDoc,
  UpdateModuleInput,
  Role,
  Task,
  TaskStatus,
  UpdateProjectInput,
  UpdateTaskInput,
  Verification,
} from "../shared/types.js";

export interface StudioBoot {
  token: string;
  basePath: string;
  pluginVersion: string;
  dshVersion: string;
  startedAt: string;
  dataDir: string;
}

declare global {
  interface Window {
    __DSH_STUDIO__?: StudioBoot;
  }
}

export class StudioClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = "StudioClientError";
    this.code = code;
    this.status = status;
  }
}

function isStudioBoot(value: unknown): value is StudioBoot {
  if (typeof value !== "object" || value === null) return false;
  const boot = value as Partial<StudioBoot>;
  return (
    typeof boot.token === "string" &&
    boot.token !== "" &&
    typeof boot.basePath === "string" &&
    boot.basePath !== "" &&
    typeof boot.pluginVersion === "string" &&
    typeof boot.dshVersion === "string" &&
    typeof boot.startedAt === "string" &&
    typeof boot.dataDir === "string"
  );
}

export function readStudioBoot(): StudioBoot | null {
  const boot = window.__DSH_STUDIO__;
  return isStudioBoot(boot) ? boot : null;
}

/**
 * Resolve boot data from the page injection first, then from the DSH-authenticated
 * `/studio-api/boot` route. The fallback is what makes a hot-installed desktop
 * plugin work without restarting the Electron host: the desktop shell injects
 * its startup table once, so a plugin loaded later is absent from that table,
 * but the browser still carries the DSH session cookie.
 */
export interface BootResolution {
  boot: StudioBoot | null;
  error: string | null;
}

export async function resolveStudioBoot(): Promise<BootResolution> {
  const injected = readStudioBoot();
  if (injected !== null) return { boot: injected, error: null };

  const failures: string[] = [];
  const transport = (
    window as Window & {
      __DSH_TRANSPORT__?: {
        streamBaseUrl?: string;
        fetch?: (
          input: string | Request,
          init?: RequestInit,
        ) => Promise<Response>;
      };
    }
  ).__DSH_TRANSPORT__;

  if (typeof transport?.fetch === "function") {
    try {
      const response = await transport.fetch("/studio-api/boot", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const data: unknown = await response.json();
        if (isStudioBoot(data)) return { boot: data, error: null };
        failures.push("transport fetch: invalid boot payload");
      } else {
        failures.push(`transport fetch: HTTP ${String(response.status)}`);
      }
    } catch (error) {
      failures.push(
        `transport fetch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const streamBase = transport?.streamBaseUrl?.replace(/\/$/u, "");
  const candidates = [
    "/studio-api/boot",
    ...(streamBase === undefined || streamBase === ""
      ? []
      : [`${streamBase}/studio-api/boot`]),
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: url.startsWith("http") ? "include" : "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        failures.push(`${url}: HTTP ${String(response.status)}`);
        continue;
      }
      const data: unknown = await response.json();
      if (isStudioBoot(data)) return { boot: data, error: null };
      failures.push(`${url}: invalid boot payload`);
    } catch (error) {
      failures.push(
        `${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    boot: null,
    error: failures.join(" · ") || "无法获取 Studio 启动参数",
  };
}

export class StudioClient {
  private readonly boot: StudioBoot;

  constructor(boot: StudioBoot) {
    this.boot = boot;
  }

  get bootPayload(): StudioBoot {
    return this.boot;
  }

  async bootstrap(projectId?: string): Promise<BootstrapResponse> {
    const query =
      projectId === undefined || projectId === ""
        ? ""
        : `?projectId=${encodeURIComponent(projectId)}`;
    return this.request<BootstrapResponse>(`/bootstrap${query}`);
  }

  async exportState(): Promise<{
    schemaVersion: number;
    pluginVersion: string;
    dshVersion: string;
    exportedAt: string;
    state: unknown;
  }> {
    return this.request("/export");
  }

  async updateCompanyName(companyName: string): Promise<string> {
    const data = await this.request<{ companyName: string }>("/settings", {
      method: "PATCH",
      body: { companyName },
    });
    return data.companyName;
  }

  async importState(state: unknown): Promise<void> {
    await this.request("/import", {
      method: "POST",
      body: { state },
    });
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const data = await this.request<{ project: Project }>("/projects", {
      method: "POST",
      body: input,
    });
    return data.project;
  }

  async updateProject(
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const data = await this.request<{ project: Project }>(
      `/projects/${encodeURIComponent(projectId)}`,
      { method: "PATCH", body: input },
    );
    return data.project;
  }

  async createModule(input: CreateModuleInput): Promise<Module> {
    const data = await this.request<{ module: Module }>("/modules", {
      method: "POST",
      body: input,
    });
    return data.module;
  }

  async updateModule(
    moduleId: string,
    input: UpdateModuleInput,
  ): Promise<Module> {
    const data = await this.request<{ module: Module }>(
      `/modules/${encodeURIComponent(moduleId)}`,
      { method: "PATCH", body: input },
    );
    return data.module;
  }

  async readProjectDoc(docPath: string): Promise<ProjectDoc> {
    const data = await this.request<{ doc: ProjectDoc }>(
      `/project-docs?path=${encodeURIComponent(docPath)}`,
    );
    return data.doc;
  }

  async selectProject(projectId: string): Promise<Project> {
    const data = await this.request<{ project: Project }>(
      `/projects/${encodeURIComponent(projectId)}/select`,
      { method: "POST", body: {} },
    );
    return data.project;
  }

  async createRole(input: CreateRoleInput): Promise<Role> {
    const data = await this.request<{ role: Role }>("/roles", {
      method: "POST",
      body: input,
    });
    return data.role;
  }

  async updateRole(
    roleId: string,
    input: Partial<CreateRoleInput>,
  ): Promise<Role> {
    const data = await this.request<{ role: Role }>(
      `/roles/${encodeURIComponent(roleId)}`,
      { method: "PATCH", body: input },
    );
    return data.role;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const data = await this.request<{ task: Task }>("/tasks", {
      method: "POST",
      body: input,
    });
    return data.task;
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    const data = await this.request<{ task: Task }>(
      `/tasks/${encodeURIComponent(taskId)}`,
      { method: "PATCH", body: input },
    );
    return data.task;
  }

  async transitionTask(taskId: string, status: TaskStatus): Promise<Task> {
    const data = await this.request<{ task: Task }>(
      `/tasks/${encodeURIComponent(taskId)}/transition`,
      { method: "POST", body: { status } },
    );
    return data.task;
  }

  async dispatchTask(taskId: string): Promise<AgentRun> {
    const data = await this.request<{ run: AgentRun }>(
      `/tasks/${encodeURIComponent(taskId)}/dispatch`,
      { method: "POST", body: {} },
    );
    return data.run;
  }

  async verifyTask(taskId: string, command?: string): Promise<Verification> {
    const data = await this.request<{ verification: Verification }>(
      `/tasks/${encodeURIComponent(taskId)}/verify`,
      { method: "POST", body: command === undefined ? {} : { command } },
    );
    return data.verification;
  }

  async reviewTask(taskId: string): Promise<IndependentReview> {
    const data = await this.request<{ review: IndependentReview }>(
      `/tasks/${encodeURIComponent(taskId)}/review`,
      { method: "POST" },
    );
    return data.review;
  }

  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    const data = await this.request<{ decision: Decision }>("/decisions", {
      method: "POST",
      body: input,
    });
    return data.decision;
  }

  async decideDecision(
    decisionId: string,
    input: DecideDecisionInput,
  ): Promise<Decision> {
    const data = await this.request<{ decision: Decision }>(
      `/decisions/${encodeURIComponent(decisionId)}/decide`,
      { method: "POST", body: input },
    );
    return data.decision;
  }

  async createMergeProposal(
    taskId: string,
    input: CreateMergeProposalInput,
  ): Promise<MergeProposal> {
    const data = await this.request<{ proposal: MergeProposal }>(
      `/tasks/${encodeURIComponent(taskId)}/merge-proposal`,
      { method: "POST", body: input },
    );
    return data.proposal;
  }

  async approveMergeProposal(
    proposalId: string,
    note?: string,
  ): Promise<MergeProposal> {
    const data = await this.request<{ proposal: MergeProposal }>(
      `/merge-proposals/${encodeURIComponent(proposalId)}/approve`,
      { method: "POST", body: note === undefined ? {} : { note } },
    );
    return data.proposal;
  }

  async rejectMergeProposal(
    proposalId: string,
    note: string,
  ): Promise<MergeProposal> {
    const data = await this.request<{ proposal: MergeProposal }>(
      `/merge-proposals/${encodeURIComponent(proposalId)}/reject`,
      { method: "POST", body: { note } },
    );
    return data.proposal;
  }

  async executeMerge(proposalId: string): Promise<MergeProposal> {
    const data = await this.request<{ proposal: MergeProposal }>(
      `/merge-proposals/${encodeURIComponent(proposalId)}/execute`,
      { method: "POST", body: {} },
    );
    return data.proposal;
  }

  async rollbackMerge(proposalId: string): Promise<MergeProposal> {
    const data = await this.request<{ proposal: MergeProposal }>(
      `/merge-proposals/${encodeURIComponent(proposalId)}/rollback`,
      { method: "POST", body: {} },
    );
    return data.proposal;
  }

  async writeAdr(decisionId: string): Promise<Decision> {
    const data = await this.request<{ decision: Decision }>(
      `/decisions/${encodeURIComponent(decisionId)}/adr`,
      { method: "POST", body: {} },
    );
    return data.decision;
  }

  async completeMergeProposal(
    proposalId: string,
    mergeCommit?: string,
  ): Promise<MergeProposal> {
    const data = await this.request<{ proposal: MergeProposal }>(
      `/merge-proposals/${encodeURIComponent(proposalId)}/merge`,
      {
        method: "POST",
        body: mergeCommit === undefined ? {} : { mergeCommit },
      },
    );
    return data.proposal;
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "x-studio-token": this.boot.token,
      Accept: "application/json",
    };
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      credentials: "same-origin",
      cache: "no-store",
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    let response: Response;
    try {
      response = await fetch(`${this.boot.basePath}${path}`, init);
    } catch (error) {
      throw new StudioClientError(
        "network_error",
        `无法连接 Studio Host：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const text = await response.text();
    let parsed: unknown = null;
    if (text.trim() !== "") {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new StudioClientError(
          "invalid_response",
          `Studio Host 返回了非 JSON 响应（HTTP ${String(response.status)}）`,
          response.status,
        );
      }
    }
    if (!response.ok) {
      const body = parsed as Partial<ApiErrorBody> | null;
      throw new StudioClientError(
        body?.error?.code ?? "http_error",
        body?.error?.message ?? `请求失败（HTTP ${String(response.status)}）`,
        response.status,
      );
    }
    return parsed as T;
  }
}
