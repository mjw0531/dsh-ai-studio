import type { StudioState } from "../../shared/types.js";

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
}
