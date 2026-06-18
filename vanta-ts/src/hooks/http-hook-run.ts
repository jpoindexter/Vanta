import type { ShellHook } from "./shell-hooks.js";
import type { ShellHookResult } from "./shell-hook-run.js";

export async function runHttpHook(
  hook: ShellHook,
  contextJson: string,
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<ShellHookResult> {
  if (!hook.url) return { code: 1, stdout: "", stderr: "http hook requires url" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? hook.timeoutMs ?? 10_000);
  try {
    return await postHook(hook, contextJson, opts.env ?? process.env, controller.signal);
  } catch (err) {
    return { code: 1, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function postHook(
  hook: ShellHook,
  contextJson: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<ShellHookResult> {
  const res = await fetch(hook.url as string, {
    method: "POST",
    headers: hookHeaders(hook, env),
    body: hookBody(hook, contextJson, env),
    signal,
  });
  const text = await res.text();
  return { code: res.ok ? 0 : 1, stdout: text, stderr: res.ok ? "" : `HTTP ${res.status}` };
}

function hookHeaders(hook: ShellHook, env: NodeJS.ProcessEnv): Record<string, string> {
  return { "content-type": "application/json", ...expandHeaders(hook.headers ?? {}, env, hook.allowedEnvVars ?? []) };
}

function hookBody(hook: ShellHook, contextJson: string, env: NodeJS.ProcessEnv): string {
  return JSON.stringify({ ...parseContext(contextJson), env: pickEnv(env, hook.allowedEnvVars ?? []) });
}

export function pickEnv(env: NodeJS.ProcessEnv, names: string[]): Record<string, string> {
  return Object.fromEntries(names.filter((name) => env[name] !== undefined).map((name) => [name, env[name] as string]));
}

export function expandHeaders(headers: Record<string, string>, env: NodeJS.ProcessEnv, allowed: string[]): Record<string, string> {
  const allowedSet = new Set(allowed);
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, expandHeader(value, env, allowedSet)]));
}

function expandHeader(value: string, env: NodeJS.ProcessEnv, allowed: Set<string>): string {
  return value.replace(/\$(?:\{([A-Z0-9_]+)\}|([A-Z0-9_]+))/gi, (_match, braced: string | undefined, bare: string | undefined) => {
    const name = braced ?? bare ?? "";
    return allowed.has(name) ? env[name] ?? "" : "";
  });
}

function parseContext(contextJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(contextJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { raw: parsed };
  } catch {
    return { raw: contextJson };
  }
}
