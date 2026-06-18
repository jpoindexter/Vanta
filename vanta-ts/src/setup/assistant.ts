import { z } from "zod";
import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";
import { hasGoogleAuth, runGoogleAuth } from "../google/auth.js";
import { readMcpConfig, mountMcpServers, type McpConfig, type MountResult } from "../mcp/mount.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { ToolRegistry } from "../tools/registry.js";
import { select } from "../term/select.js";

export type ProbeResult = { ok: boolean; detail: string };

type ProviderProbeDeps = {
  resolve?: (env: NodeJS.ProcessEnv) => LLMProvider;
  timeoutMs?: number;
};

function redactSecrets(text: string, env: NodeJS.ProcessEnv): string {
  let out = text;
  for (const raw of Object.values(env)) {
    const value = raw?.trim();
    if (value && value.length >= 8) out = out.split(value).join("[redacted]");
  }
  return out;
}

function errorDetail(err: unknown, env: NodeJS.ProcessEnv): string {
  const text = err instanceof Error ? err.message : String(err);
  return redactSecrets(text, env);
}

export async function probeProvider(
  env: NodeJS.ProcessEnv,
  deps: ProviderProbeDeps = {},
): Promise<ProbeResult> {
  try {
    const provider = (deps.resolve ?? resolveProvider)(env);
    const signal = AbortSignal.timeout(deps.timeoutMs ?? 15_000);
    await provider.complete(
      [{ role: "user", content: "Vanta setup check. Reply with OK." }],
      [],
      { signal },
    );
    return { ok: true, detail: `${provider.modelId()} responded` };
  } catch (err) {
    return { ok: false, detail: errorDetail(err, env) };
  }
}

export async function probeGoogleAuth(
  env: NodeJS.ProcessEnv,
  check: (env: NodeJS.ProcessEnv) => Promise<boolean> = hasGoogleAuth,
): Promise<ProbeResult> {
  return (await check(env))
    ? { ok: true, detail: "authorized" }
    : { ok: false, detail: "not authorized" };
}

type GoogleStepOpts = {
  env: NodeJS.ProcessEnv;
  select?: typeof select;
  runAuth?: typeof runGoogleAuth;
  hasAuth?: typeof hasGoogleAuth;
  log?: (line: string) => void;
};

export async function runGoogleStep(opts: GoogleStepOpts): Promise<ProbeResult> {
  const log = opts.log ?? console.log;
  const before = await probeGoogleAuth(opts.env, opts.hasAuth);
  if (before.ok) return before;
  if (!opts.env.VANTA_GOOGLE_CLIENT_ID || !opts.env.VANTA_GOOGLE_CLIENT_SECRET) return before;
  const pick = await (opts.select ?? select)(
    "Authorize Gmail/Calendar/Drive?",
    ["Authorize Google", "Skip for now"],
  );
  if (pick !== 0) return before;
  try {
    await (opts.runAuth ?? runGoogleAuth)(opts.env);
    const after = await probeGoogleAuth(opts.env, opts.hasAuth);
    log(`  ${after.ok ? "✓" : "✗"} Google ${after.detail}`);
    return after;
  } catch (err) {
    return { ok: false, detail: errorDetail(err, opts.env) };
  }
}

type McpProbeOpts = {
  env: NodeJS.ProcessEnv;
  cwd: string;
  readConfig?: (env: NodeJS.ProcessEnv, cwd: string) => Promise<McpConfig>;
  mount?: (registry: ToolRegistry, env: NodeJS.ProcessEnv, log: (msg: string) => void) => Promise<MountResult>;
};

export async function probeMcp(opts: McpProbeOpts): Promise<ProbeResult> {
  const cfg = await (opts.readConfig ?? readMcpConfig)(opts.env, opts.cwd);
  const names = Object.keys(cfg.servers);
  if (!names.length) return { ok: false, detail: "no MCP servers configured" };
  try {
    const mounted = await (opts.mount ?? mountMcpServers)(new InMemoryToolRegistry(), opts.env, () => {});
    mounted.dispose();
    return {
      ok: mounted.servers.length > 0,
      detail: `mounted ${mounted.servers.length} server(s), ${mounted.toolCount} tool(s)`,
    };
  } catch (err) {
    return { ok: false, detail: errorDetail(err, opts.env) };
  }
}

const TelegramGetMeSchema = z.object({
  ok: z.boolean(),
  result: z.object({ username: z.string().optional() }).optional(),
});

type FetchLike = (url: string, init?: RequestInit) => Promise<{ json: () => Promise<unknown> }>;

export async function probeMessaging(
  env: NodeJS.ProcessEnv,
  fetchFn: FetchLike = fetch,
): Promise<ProbeResult> {
  const token = env.VANTA_TELEGRAM_TOKEN?.trim();
  if (!token) return { ok: false, detail: "no messaging platform configured" };
  try {
    const raw = await (await fetchFn(`https://api.telegram.org/bot${token}/getMe`)).json();
    const parsed = TelegramGetMeSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.ok) return { ok: false, detail: "Telegram token rejected" };
    const name = parsed.data.result?.username ?? "bot";
    return { ok: true, detail: `Telegram bot ${name} responded` };
  } catch (err) {
    return { ok: false, detail: errorDetail(err, env) };
  }
}
