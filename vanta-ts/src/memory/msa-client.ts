import type { z } from "zod";
import {
  MSA_PATHS,
  MsaGenerateRequestSchema,
  MsaGenerateResponseSchema,
  MsaHealthSchema,
  MsaIndexReceiptSchema,
  MsaIndexRequestSchema,
  MsaQueryRequestSchema,
  MsaQueryResponseSchema,
  type MsaGenerateRequest,
  type MsaGenerateResponse,
  type MsaHealth,
  type MsaIndexReceipt,
  type MsaIndexRequest,
  type MsaOutcome,
  type MsaQueryRequest,
  type MsaQueryResponse,
} from "./msa-protocol.js";

export type MsaConfig = {
  baseUrl: string;
  token?: string;
  timeoutMs: number;
};

export type MsaTransport = (
  method: "GET" | "POST",
  path: string,
  body?: unknown,
) => Promise<unknown>;

export type MsaClient = {
  health(): Promise<MsaOutcome<MsaHealth>>;
  index(input: MsaIndexRequest): Promise<MsaOutcome<MsaIndexReceipt>>;
  query(input: MsaQueryRequest): Promise<MsaOutcome<MsaQueryResponse>>;
  generate(input: MsaGenerateRequest): Promise<MsaOutcome<MsaGenerateResponse>>;
};

function loopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
}

export function resolveMsaConfig(
  env: NodeJS.ProcessEnv = process.env,
): MsaOutcome<MsaConfig> {
  const raw = env.VANTA_MSA_URL?.trim();
  if (!raw) {
    return { ok: false, kind: "unavailable", error: "VANTA_MSA_URL is not configured" };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, kind: "unavailable", error: "VANTA_MSA_URL is not a valid URL" };
  }
  if (url.username || url.password) {
    return { ok: false, kind: "unavailable", error: "VANTA_MSA_URL must not contain credentials" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, kind: "unavailable", error: "VANTA_MSA_URL must use HTTP or HTTPS" };
  }
  const secure = url.protocol === "https:";
  const localHttp = url.protocol === "http:" && loopback(url.hostname);
  if (!secure && !localHttp && env.VANTA_MSA_ALLOW_INSECURE_REMOTE !== "1") {
    return {
      ok: false,
      kind: "unavailable",
      error: "remote MSA runtimes require HTTPS (or VANTA_MSA_ALLOW_INSECURE_REMOTE=1)",
    };
  }
  const configuredTimeout = Number(env.VANTA_MSA_TIMEOUT_MS ?? 30_000);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(1_000, Math.min(120_000, Math.floor(configuredTimeout)))
    : 30_000;
  const token = env.VANTA_MSA_TOKEN?.trim();
  return {
    ok: true,
    value: {
      baseUrl: url.toString().replace(/\/$/, ""),
      ...(token ? { token } : {}),
      timeoutMs,
    },
  };
}

export function createMsaHttpTransport(
  config: MsaConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): MsaTransport {
  return async (method, path, body) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(`${config.baseUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  };
}

async function call<Schema extends z.ZodTypeAny>(
  transport: MsaTransport,
  method: "GET" | "POST",
  path: string,
  responseSchema: Schema,
  body?: unknown,
): Promise<MsaOutcome<z.output<Schema>>> {
  try {
    const raw = await transport(method, path, body);
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, kind: "invalid_response", error: `invalid MSA response for ${path}` };
    }
    return { ok: true, value: parsed.data };
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "request timed out"
      : error instanceof Error ? error.message : "request failed";
    return { ok: false, kind: "request_failed", error: `MSA ${path}: ${detail}` };
  }
}

export function createMsaClient(transport: MsaTransport): MsaClient {
  return {
    health: () => call(transport, "GET", MSA_PATHS.health, MsaHealthSchema),
    index: (input) => {
      const body = MsaIndexRequestSchema.parse(input);
      return call(transport, "POST", MSA_PATHS.index, MsaIndexReceiptSchema, body);
    },
    query: (input) => {
      const body = MsaQueryRequestSchema.parse(input);
      return call(transport, "POST", MSA_PATHS.query, MsaQueryResponseSchema, body);
    },
    generate: (input) => {
      const body = MsaGenerateRequestSchema.parse(input);
      return call(transport, "POST", MSA_PATHS.generate, MsaGenerateResponseSchema, body);
    },
  };
}

export function resolveMsaClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = globalThis.fetch,
): MsaClient | null {
  const config = resolveMsaConfig(env);
  return config.ok ? createMsaClient(createMsaHttpTransport(config.value, fetchImpl)) : null;
}
