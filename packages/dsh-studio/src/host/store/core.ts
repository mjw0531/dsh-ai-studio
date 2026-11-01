import { randomUUID } from "node:crypto";

import type {
  CreateProjectInput,
  CreateRoleInput,
  CreateTaskInput,
  Project,
  Role,
  StudioState,
  Task,
} from "../../shared/types.js";

export class StudioStoreError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "StudioStoreError";
    this.code = code;
    this.status = status;
  }
}

export interface StoreEventInput {
  type: string;
  at: string;
  projectId: string | null;
  taskId?: string | null;
  payload?: Record<string, unknown>;
}

export interface StoreContext {
  runExclusive<T>(work: () => Promise<T>): Promise<T>;
  requireState(): StudioState;
  save(): Promise<void>;
  recordEvent(state: StudioState, input: StoreEventInput): void;
  now(): string;
  createProject(input: CreateProjectInput): Promise<Project>;
  createRole(input: CreateRoleInput): Promise<Role>;
  createTask(input: CreateTaskInput): Promise<Task>;
}

export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
