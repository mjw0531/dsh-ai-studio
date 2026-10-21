import type {
  ApiErrorBody,
  BootstrapResponse,
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  Project,
  Role,
  Task,
  TaskStatus,
  UpdateTaskInput,
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

export function readStudioBoot(): StudioBoot | null {
  const boot = window.__DSH_STUDIO__;
  if (boot === undefined) return null;
  if (
    typeof boot.token !== "string" ||
    boot.token === "" ||
    typeof boot.basePath !== "string" ||
    boot.basePath === ""
  ) {
    return null;
  }
  return boot;
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

  async createProject(input: CreateProjectInput): Promise<Project> {
    const data = await this.request<{ project: Project }>("/projects", {
      method: "POST",
      body: input,
    });
    return data.project;
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
