import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export type PublicApiErrorCode =
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "SERVICE_UNAVAILABLE";

export function okEnvelope<T>(data: T) {
  return { ok: true as const, data };
}

export function errorEnvelope(code: PublicApiErrorCode, message: string) {
  return {
    ok: false as const,
    error: { code, message },
  };
}

export function parsePublicApiKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

export function getConfiguredApiKeys(): string[] {
  return parsePublicApiKeys(process.env.PUBLIC_API_KEYS);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isValidApiKey(provided: string, allowed: string[]): boolean {
  if (!provided || allowed.length === 0) return false;
  return allowed.some((key) => safeEqual(provided, key));
}

export function readApiKeyHeader(
  headers: FastifyRequest["headers"]
): string | null {
  const value = headers["x-api-key"];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    const trimmed = value[0].trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/**
 * Fastify preHandler for /v1 routes that require an API key.
 * Returns true when the request may continue.
 */
export async function requirePublicApiKey(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const allowed = getConfiguredApiKeys();
  if (allowed.length === 0) {
    await reply.code(503).send(
      errorEnvelope(
        "SERVICE_UNAVAILABLE",
        "Public API keys are not configured. Set PUBLIC_API_KEYS."
      )
    );
    return false;
  }

  const provided = readApiKeyHeader(req.headers);
  if (!provided || !isValidApiKey(provided, allowed)) {
    await reply.code(401).send(
      errorEnvelope(
        "UNAUTHORIZED",
        "A valid X-API-Key header is required."
      )
    );
    return false;
  }

  return true;
}
