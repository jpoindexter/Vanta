/**
 * VANTA-API-PRECONNECT — pre-warm a TCP+TLS connection to the active provider's
 * API host during startup so the FIRST real request skips the handshake
 * (~100-200ms saved on a cold session). Best-effort and opt-in: off unless
 * VANTA_PRECONNECT is set, a no-op when the host is unknown or local, and a
 * failed connect is swallowed so it can never block or affect startup.
 *
 * Host resolution and orchestration are PURE/injectable — the network connect is
 * the only side effect, and it is injected so the whole flow is unit-testable
 * without touching a real socket.
 */

/** host:port for the active provider's API endpoint (null = unknown/local → no preconnect). */
export type ApiHost = { host: string; port: number };

/**
 * Default OpenAI API base — the OpenAI SDK uses this when no baseURL is passed,
 * so the `openai` provider (and Azure, which builds from its own endpoint) must
 * resolve to it here too. Kept in sync with providers/index.ts intentionally:
 * this module reads env, never the (non-pure) provider classes.
 */
const OPENAI_DEFAULT_URL = "https://api.openai.com/v1";
const ANTHROPIC_DEFAULT_URL = "https://api.anthropic.com";

/**
 * Per-provider base URLs, mirroring providers/index.ts + catalog.ts. Only the
 * provider id → host mapping is needed (the path is irrelevant to a preconnect),
 * so this is the URL each factory hands the SDK, by env-selected provider id.
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: OPENAI_DEFAULT_URL,
  anthropic: ANTHROPIC_DEFAULT_URL,
  "claude-code": ANTHROPIC_DEFAULT_URL,
  "claude-cli": ANTHROPIC_DEFAULT_URL,
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  nim: "https://integrate.api.nvidia.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  together: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  cerebras: "https://api.cerebras.ai/v1",
  moonshot: "https://api.moonshot.ai/v1",
  minimax: "https://api.minimax.io/v1",
  zai: "https://api.z.ai/api/paas/v4",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  novita: "https://api.novita.ai/v3/openai",
  perplexity: "https://api.perplexity.ai",
  huggingface: "https://router.huggingface.co/v1",
  stepfun: "https://api.stepfun.com/v1",
};

/** Hosts we never preconnect to — local backends gain nothing from a pre-warm. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const DEFAULT_HTTPS_PORT = 443;
const DEFAULT_HTTP_PORT = 80;

function isPreconnectEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env.VANTA_PRECONNECT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Resolve the env-selected provider's base URL, honoring the same overrides the factories use. */
function resolveBaseUrl(env: NodeJS.ProcessEnv, id: string): string | null {
  if (id === "custom") return env.VANTA_OPENAI_BASE_URL ?? null;
  if (id === "lmstudio") return "http://localhost:1234/v1";
  if (id === "ollama") return env.VANTA_OLLAMA_URL ?? "http://localhost:11434/v1";
  if (id === "azure") {
    const endpoint = env.AZURE_OPENAI_ENDPOINT?.trim();
    return endpoint ? endpoint.replace(/\/$/, "") : null;
  }
  return PROVIDER_BASE_URLS[id] ?? null;
}

/** Parse a base URL into a host:port, or null when it can't host a TLS preconnect. */
function hostFromUrl(url: string): ApiHost | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  if (!host || LOCAL_HOSTS.has(host)) return null;
  const defaultPort = parsed.protocol === "http:" ? DEFAULT_HTTP_PORT : DEFAULT_HTTPS_PORT;
  const port = parsed.port ? Number(parsed.port) : defaultPort;
  if (!Number.isInteger(port) || port <= 0) return null;
  return { host, port };
}

/**
 * The host:port to pre-warm for the active provider, or null when it's unknown,
 * local, or unparseable. Pure: depends only on env. Mirrors resolveProvider's
 * id selection (default `openai`); never throws.
 */
export function providerApiHost(env: NodeJS.ProcessEnv): ApiHost | null {
  const id = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  // codex talks to OpenAI's Responses API host; treat as the OpenAI host.
  if (id === "codex" || id === "openai-codex") return hostFromUrl(OPENAI_DEFAULT_URL);
  const baseUrl = resolveBaseUrl(env, id);
  if (!baseUrl) return null;
  return hostFromUrl(baseUrl);
}

/** Best-effort connector: opens (and immediately closes) a TCP+TLS connection to warm the path. */
export type Connect = (host: ApiHost) => Promise<void>;

const TLS_TIMEOUT_MS = 4000;

/**
 * Real TCP+TLS connector — opens a TLS socket to host:port, then closes it the
 * moment the handshake completes (or on error/timeout). The OS keeps the warmed
 * path so the first real request reuses it. Resolves on connect, rejects on
 * error/timeout; `preconnect` swallows the rejection, so this never escapes.
 */
export const tlsConnect: Connect = (host) =>
  new Promise<void>((resolve, reject) => {
    void import("node:tls").then(({ connect }) => {
      const socket = connect({ host: host.host, port: host.port, servername: host.host });
      const done = (err?: Error): void => {
        socket.destroy();
        err ? reject(err) : resolve();
      };
      socket.setTimeout(TLS_TIMEOUT_MS, () => done(new Error(`preconnect timed out after ${TLS_TIMEOUT_MS}ms`)));
      socket.once("secureConnect", () => done());
      socket.once("error", (err) => done(err));
    }, reject);
  });

/**
 * Fire-and-forget preconnect for startup. Resolves the connector internally
 * (defaulting to {@link tlsConnect}) and never awaits a meaningful result at the
 * call site — a disabled/unknown/failed warm-up is absorbed here, so startup is
 * never blocked or affected. Returns the (already-swallowed) result for callers
 * that want to observe it; startup ignores it.
 */
export function preconnectStartup(env: NodeJS.ProcessEnv, connect: Connect = tlsConnect): Promise<PreconnectResult> {
  return preconnect({ env, connect });
}

export type PreconnectDeps = {
  env: NodeJS.ProcessEnv;
  /** Resolves the host to warm; defaults to {@link providerApiHost}. Injected for tests. */
  host?: ApiHost | null;
  connect: Connect;
};

/** Outcome of a preconnect attempt — errors-as-values; this never throws. */
export type PreconnectResult =
  | { ok: true; warmed: true; host: ApiHost }
  | { ok: true; warmed: false; reason: "disabled" | "no-host" }
  | { ok: false; warmed: false; reason: "connect-failed"; error: string };

/**
 * Fire a best-effort preconnect to the active provider's API host. Opt-in via
 * VANTA_PRECONNECT; a no-op when disabled or the host is unknown/local; a thrown
 * connect is swallowed and returned as a value. NEVER throws — safe to
 * fire-and-forget from startup without affecting it.
 */
export async function preconnect(deps: PreconnectDeps): Promise<PreconnectResult> {
  if (!isPreconnectEnabled(deps.env)) return { ok: true, warmed: false, reason: "disabled" };
  const host = deps.host !== undefined ? deps.host : providerApiHost(deps.env);
  if (!host) return { ok: true, warmed: false, reason: "no-host" };
  try {
    await deps.connect(host);
    return { ok: true, warmed: true, host };
  } catch (err) {
    return { ok: false, warmed: false, reason: "connect-failed", error: err instanceof Error ? err.message : String(err) };
  }
}
