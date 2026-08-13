import { request as httpsRequest, type RequestOptions } from "node:https";
import { request as httpRequest } from "node:http";

type FetchBody = RequestInit["body"];

/**
 * Node's built-in fetch can select an unreachable IPv6 route before falling
 * back on macOS networks that advertise dual-stack DNS. Telegram's Bot API is
 * IPv4 reachable in those environments. Keep the transport dependency-free
 * and force family 4 for Telegram's HTTP calls.
 */
export type TelegramFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type TelegramTransportOptions = {
  /** Last-resort IPv4 addresses for api.telegram.org, kept outside the URL. */
  fallbackIps?: readonly string[];
  timeoutMs?: number;
};

const TELEGRAM_SEED_IPS = ["149.154.166.110", "149.154.167.220"] as const;

/**
 * Build the Telegram Bot API transport. The first attempt uses the system's
 * IPv4 resolution. If that route is unavailable, retries a bounded list of
 * IPv4 addresses while preserving Telegram's Host header and TLS SNI. This is
 * the same bounded failure boundary used by mature bot transports, without
 * importing another runtime stack.
 */
export function createTelegramFetch(options: TelegramTransportOptions = {}): TelegramFetch {
  const fallbackIps = [...(options.fallbackIps ?? TELEGRAM_SEED_IPS)].filter(isIpv4);
  return (url, init) => requestWithFallback(url, init ?? {}, fallbackIps, options.timeoutMs ?? 15_000);
}

/** Parse an optional comma-separated IPv4 fallback list without accepting hosts. */
export function parseTelegramFallbackIps(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const ips = raw.split(",").map((value) => value.trim()).filter(isIpv4);
  return ips.length > 0 ? [...new Set(ips)] : [];
}

/** Default dependency-free transport used by setup probes and direct callers. */
export const ipv4Fetch: TelegramFetch = createTelegramFetch();

async function requestWithFallback(
  url: string,
  init: RequestInit,
  fallbackIps: readonly string[],
  timeoutMs: number,
): Promise<Response> {
  const target = new URL(url);
  const body = await encodeBody(init.body);
  const headers = headerRecord(init.headers);
  if (body) {
    headers["content-length"] = String(body.data.byteLength);
    for (const [key, value] of Object.entries(body.headers)) headers[key] ??= value;
  }

  const candidates = [target.hostname, ...(target.hostname === "api.telegram.org" ? fallbackIps : [])]
    .filter((candidate, index, all) => all.indexOf(candidate) === index);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await requestOnce(target, candidate, init, headers, body, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Telegram request failed");
}

function requestOnce(
  target: URL,
  candidate: string,
  init: RequestInit,
  headers: Record<string, string>,
  body: EncodedBody | undefined,
  timeoutMs: number,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const usingFallbackIp = candidate !== target.hostname;
    const requestHeaders = { ...headers };
    if (usingFallbackIp) requestHeaders.host ??= target.host;
    const options: RequestOptions = {
      protocol: target.protocol,
      hostname: candidate,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: init.method ?? "GET",
      headers: requestHeaders,
      family: 4,
      timeout: timeoutMs,
      ...(usingFallbackIp && target.protocol === "https:" ? { servername: target.hostname } : {}),
    };
    const request = (target.protocol === "http:" ? httpRequest : httpsRequest)(options, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode ?? 0,
        headers: responseHeaders(response.headers),
      })));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Telegram request timed out")));
    request.on("error", reject);
    if (body) request.write(body.data);
    request.end();
  });
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

function headerRecord(input: RequestInit["headers"]): Record<string, string> {
  if (!input) return {};
  if (input instanceof Headers) return Object.fromEntries(input.entries());
  if (Array.isArray(input)) return Object.fromEntries(input);
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)]));
}

function responseHeaders(input: Record<string, string | string[] | undefined>): Headers {
  const output = new Headers();
  for (const [key, value] of Object.entries(input)) if (value !== undefined) output.set(key, Array.isArray(value) ? value.join(", ") : value);
  return output;
}

type EncodedBody = { data: Buffer; headers: Record<string, string> };

async function encodeBody(body: FetchBody): Promise<EncodedBody | undefined> {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return { data: Buffer.from(body), headers: {} };
  if (body instanceof Uint8Array) return { data: Buffer.from(body), headers: {} };
  if (body instanceof ArrayBuffer) return { data: Buffer.from(body), headers: {} };
  if (body instanceof URLSearchParams) {
    return { data: Buffer.from(body.toString()), headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" } };
  }
  if (body instanceof FormData) return encodeFormData(body);
  throw new Error("Unsupported Telegram request body");
}

async function encodeFormData(form: FormData): Promise<EncodedBody> {
  const boundary = `----VantaTelegram${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [name, value] of form.entries()) {
    const filename = typeof value === "string" ? undefined : value.name;
    const content = typeof value === "string" ? Buffer.from(value) : Buffer.from(await value.arrayBuffer());
    const disposition = `Content-Disposition: form-data; name="${escapeMultipart(name)}"${filename ? `; filename="${escapeMultipart(filename)}"` : ""}`;
    const type = typeof value === "string" ? "" : `\r\nContent-Type: ${value.type || "application/octet-stream"}`;
    parts.push(Buffer.from(`--${boundary}\r\n${disposition}${type}\r\n\r\n`), content, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { data: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

function escapeMultipart(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}
