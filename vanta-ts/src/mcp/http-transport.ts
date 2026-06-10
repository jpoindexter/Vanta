import type { Transport } from "./client.js";

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
      fetch(url, {
        method: "POST",
        headers: extraHeaders,
        body: line,
      })
        .then(async (res) => {
          if (!res.ok) {
            errorCallback?.(new Error(`HTTP ${res.status}: ${await res.text()}`));
            return;
          }
          // Read the response — could be a single JSON object or newline-delimited.
          const text = await res.text();
          for (const part of text.split("\n").filter(Boolean)) {
            messageCallback?.(part);
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
  if (explicitToken) return explicitToken;
  const envKey = `VANTA_MCP_TOKEN_${serverName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return env[envKey];
}
