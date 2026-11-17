import type { Transport } from "./client.js";
import { assertPublicUrl } from "../net/ssrf-guard.js";

// MCP remote: HTTP transport for remote MCP servers.
// Allows mounting hosted MCP servers (e.g. Zapier, GitHub, Stripe) over HTTP
// instead of stdio. Supports Bearer token and OAuth-style headers.
// Usage in mcp.json:
//   { "servers": { "zapier": { "url": "https://mcp.zapier.com/...", "token": "..." } } }

/**
 * Create an HTTP MCP transport that communicates via POST requests.
 * Each JSON-RPC message is sent as a POST body; the response is read as a newline-
 * delimited stream or a single JSON object.
 */
export function httpTransport(
  url: string,
  opts: { token?: string; headers?: Record<string, string> } = {},
): Transport {
  const extraHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...opts.headers,
  };
  if (opts.token) extraHeaders["authorization"] = `Bearer ${opts.token}`;

  let messageCallback: ((line: string) => void) | null = null;
  let errorCallback: ((err: Error) => void) | null = null;

  return {
    send(line: string): void {
      assertPublicUrl(url)
        .then((guard) => {
          if (!guard.ok) throw new Error(guard.error);
          return fetch(url, { method: "POST", headers: extraHeaders, body: line });
        })
        .then(async (res) => {
          if (!res.ok) {
            errorCallback?.(new Error(`HTTP ${res.status}: ${await res.text()}`));
            return;
          }
          // Read the response — could be a single JSON object or newline-delimited.
          // The McpClient frames messages on newlines, so re-terminate each part:
          // an HTTP body (single JSON, or a stream missing its final newline)
          // would otherwise sit unparsed in the client's line buffer forever.
          const text = await res.text();
          for (const part of text.split("\n").filter(Boolean)) {
            messageCallback?.(`${part}\n`);
          }
        })
        .catch((err: Error) => errorCallback?.(err));
    },
    onMessage(cb: (line: string) => void): void {
      messageCallback = cb;
    },
    onError(cb: (err: Error) => void): void {
      errorCallback = cb;
    },
    close(): void {
      messageCallback = null;
      errorCallback = null;
    },
  };
}

/**
 * Resolve a Bearer token for an HTTP MCP server.
 * Checks: explicit token arg → VANTA_MCP_TOKEN_<SERVER> env var → null.
 */
export function resolveToken(
  serverName: string,
  explicitToken?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (explicitToken) return resolveTemplate(explicitToken, env);
  const envKey = `VANTA_MCP_TOKEN_${serverName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return env[envKey];
}

/** Resolve `${VARNAME}` placeholders without copying absent values into requests. */
export function resolveTemplate(value: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  let missing = false;
  const resolved = value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, key: string) => {
    const found = env[key];
    if (!found) missing = true;
    return found ?? "";
  });
  return missing ? undefined : resolved;
}
