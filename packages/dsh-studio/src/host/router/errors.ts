import type { ServerResponse } from "node:http";

import { StudioStoreError } from "../store.js";
import { HttpError, sendError } from "./http.js";

export function handleRouterError(
  res: ServerResponse,
  error: unknown,
): void {
  if (error instanceof StudioStoreError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }
  if (error instanceof HttpError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  sendError(res, 500, "internal_error", message);
}
