import { execFile } from "node:child_process";
import { promisify } from "node:util";

// X/Twitter has no open API like Reddit's .json — its web GraphQL needs a bearer
// token, a CSRF token, and rotating query IDs. We delegate to twitter-cli (which
// tracks that churn) and pass auth from the stored cookie as env vars (headless),
// falling back to twitter-cli's own browser auto-extraction.

const run = promisify(execFile);
const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 4_000_000;

export type TwitterPost = { text: string; handle: string; url: string; likes: number };

/** Pull auth_token + ct0 from a stored cookie header, for twitter-cli env auth. Pure. */
export function extractAuth(cookieHeader: string): { authToken: string; ct0: string } | null {
  const find = (k: string) => new RegExp(`(?:^|;\\s*)${k}=([^;]+)`).exec(cookieHeader)?.[1];
  const authToken = find("auth_token");
  const ct0 = find("ct0");
  return authToken && ct0 ? { authToken, ct0 } : null;
}

function authEnv(cookie: string | null, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  const auth = cookie ? extractAuth(cookie) : null;
  if (auth) {
    env.TWITTER_AUTH_TOKEN = auth.authToken;
    env.TWITTER_CT0 = auth.ct0;
  }
  return env;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(o: Record<string, unknown>, k: string): string {
  return typeof o[k] === "string" ? (o[k] as string) : "";
}
function num(o: Record<string, unknown>, k: string): number {
  return typeof o[k] === "number" ? (o[k] as number) : 0;
}
/** First non-empty string across `[object, key]` candidates. Keeps mapTweet flat. */
function firstStr(sources: Array<[Record<string, unknown>, string]>): string {
  for (const [o, k] of sources) {
    const v = str(o, k);
    if (v) return v;
  }
  return "";
}
function firstNum(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = num(o, k);
    if (v) return v;
  }
  return 0;
}

/** Map one twitter-cli tweet object to a normalized post. Tolerant of field names. */
export function mapTweet(raw: unknown): TwitterPost {
  const t = rec(raw);
  const user = rec(t.user);
  const author = rec(t.author);
  const handle = firstStr([[t, "handle"], [t, "screen_name"], [user, "screen_name"], [author, "handle"]]);
  const id = firstStr([[t, "id"], [t, "id_str"]]);
  const constructed = handle && id ? `https://x.com/${handle}/status/${id}` : "";
  return {
    text: firstStr([[t, "text"], [t, "full_text"]]),
    handle,
    url: firstStr([[t, "url"], [t, "permalink"]]) || constructed,
    likes: firstNum(t, ["likes", "favorite_count", "like_count", "favoriteCount"]),
  };
}

/** Parse twitter-cli's --json envelope ({ok, data:[…]}) into posts. Tolerant. */
export function parseTwitterJson(stdout: string): { ok: true; posts: TwitterPost[] } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(stdout);
  } catch {
    return { ok: false, error: "could not parse twitter-cli output" };
  }
  const env = rec(obj);
  if (env.ok === false) return { ok: false, error: str(rec(env.error), "message") || str(rec(env.error), "code") || "twitter-cli error" };
  const data = Array.isArray(obj) ? obj : env.data;
  const list = Array.isArray(data) ? data : [];
  return { ok: true, posts: list.map(mapTweet).filter((p) => p.text) };
}

export async function searchTwitter(
  opts: { query: string; max?: number; latest?: boolean },
  cookie: string | null,
  base: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: true; posts: TwitterPost[] } | { ok: false; error: string }> {
  const args = ["search", opts.query, "--json", "--max", String(opts.max ?? 20)];
  if (opts.latest) args.push("-t", "Latest");
  try {
    const { stdout } = await run("twitter", args, { timeout: TIMEOUT_MS, env: authEnv(cookie, base), maxBuffer: MAX_BUFFER });
    return parseTwitterJson(stdout);
  } catch (err) {
    const e = err as { code?: string | number; stdout?: string; message: string };
    if (e.code === "ENOENT") return { ok: false, error: "twitter-cli not installed" };
    if (e.stdout) return parseTwitterJson(e.stdout); // non-zero exit but a JSON error envelope
    return { ok: false, error: e.message };
  }
}
