import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

// The shared auth store for login-walled reach channels (reddit, twitter, …).
// A browser-exported cookie is normalized to a `k=v; k2=v2` header and stored
// 0600 at ~/.vanta/cookies/<channel>.cookie — local only, never uploaded or
// logged. Agent-Reach's recommended flow: Cookie-Editor → Export JSON → paste.

const SAFE_CHANNEL = /^[a-z][a-z0-9_-]*$/;

/** Channel names are file names — reject anything that could traverse. Pure. */
export function isSafeChannel(name: string): boolean {
  return SAFE_CHANNEL.test(name);
}

/**
 * Normalize a pasted cookie to a request `Cookie:` header value. Accepts either
 * any browser/OS export — a Cookie-Editor JSON export (`[{name,value,…}]`), a
 * Netscape `cookies.txt` (the de-facto standard used by "Get cookies.txt" /
 * yt-dlp), or an already-formed `k=v; k2=v2` header. Universal by design: the
 * browser extension does the local decryption; we only normalize the export.
 * Returns null when it can't make sense of the input. Pure.
 */
export function parseCookieInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("[")) return parseJsonExport(t);
  if (looksNetscape(t)) return parseNetscape(t);
  return /[^\s=]+=/.test(t) ? t.replace(/\s*\n\s*/g, " ").trim() : null;
}

/** Cookie-Editor (and most extensions) export a JSON array of cookie objects. */
function parseJsonExport(t: string): string | null {
  try {
    const arr: unknown = JSON.parse(t);
    if (!Array.isArray(arr)) return null;
    const pairs = arr
      .filter((c): c is { name: string; value: string } =>
        Boolean(c) && typeof (c as { name?: unknown }).name === "string" && typeof (c as { value?: unknown }).value === "string")
      .map((c) => `${c.name}=${c.value}`);
    return pairs.length ? pairs.join("; ") : null;
  } catch {
    return null;
  }
}

function looksNetscape(t: string): boolean {
  return t.includes("Netscape HTTP Cookie File") || t.split("\n").some((l) => l.split("\t").length >= 7);
}

/** Netscape cookies.txt: tab-separated domain,flag,path,secure,expiry,NAME,VALUE. */
function parseNetscape(t: string): string | null {
  const pairs: string[] = [];
  for (const line of t.split("\n")) {
    const l = line.trim();
    // skip blank + comment lines, but keep "#HttpOnly_" rows (real cookies)
    if (!l || (l.startsWith("#") && !l.startsWith("#HttpOnly_"))) continue;
    const f = line.split("\t");
    if (f.length >= 7 && f[5]) pairs.push(`${f[5]}=${f[6] ?? ""}`);
  }
  return pairs.length ? pairs.join("; ") : null;
}

function cookieDir(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "cookies");
}

function cookiePath(channel: string, env: NodeJS.ProcessEnv): string {
  return join(cookieDir(env), `${channel}.cookie`);
}

/** Store a pasted cookie for a channel (0600). Returns an error value on bad input. */
export function saveCookie(
  channel: string,
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; error?: string } {
  if (!isSafeChannel(channel)) return { ok: false, error: `invalid channel name "${channel}"` };
  const cookie = parseCookieInput(raw);
  if (!cookie) {
    return { ok: false, error: "could not parse cookie — paste a Cookie-Editor JSON export or a 'k=v; k2=v2' header" };
  }
  mkdirSync(cookieDir(env), { recursive: true, mode: 0o700 });
  writeFileSync(cookiePath(channel, env), cookie, { mode: 0o600 });
  return { ok: true };
}

/** Load a channel's stored cookie header, or null when none is configured. */
export function loadCookie(channel: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isSafeChannel(channel)) return null;
  const p = cookiePath(channel, env);
  return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
}

export function hasCookie(channel: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return loadCookie(channel, env) !== null;
}

/** The channels that currently have a stored cookie. Never reads the values. */
export function configuredChannels(env: NodeJS.ProcessEnv = process.env): string[] {
  try {
    return readdirSync(cookieDir(env))
      .filter((f) => f.endsWith(".cookie"))
      .map((f) => f.replace(/\.cookie$/, ""))
      .sort();
  } catch {
    return [];
  }
}
