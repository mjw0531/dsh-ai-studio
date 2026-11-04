import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { HttpError } from "./http.js";
import type { ParsedRequest } from "./http.js";

export function parseRoute(req: IncomingMessage): ParsedRequest {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://studio.local");
  return { method, pathname: url.pathname, url };
}

export function assertAuthorized(req: IncomingMessage, token: string): void {
  const headerToken = req.headers["x-studio-token"];
  const authorization = req.headers.authorization;
  const bearer =
    typeof authorization === "string" &&
    authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : "";
  const candidate =
    typeof headerToken === "string" ? headerToken.trim() : bearer;
  const expected = Buffer.from(token);
  const supplied = Buffer.from(candidate);
  if (
    candidate === "" ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new HttpError(401, "unauthorized", "缺少或无效的 Studio 访问令牌");
  }
}

export function allowRate(
  buckets: Map<string, { count: number; resetAt: number }>,
  bucket: string,
  req: IncomingMessage,
  limit: number,
): boolean {
  const key = `${bucket}:${req.socket?.remoteAddress ?? "unknown"}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (current === undefined || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function requireMethod(
  parsed: ParsedRequest,
  methods: string[],
): void {
  if (!methods.includes(parsed.method)) {
    throw new HttpError(
      405,
      "method_not_allowed",
      `只支持 ${methods.join(", ")}`,
    );
  }
}
