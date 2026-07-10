import { loadCookie } from "./cookie.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const FIX = 'import a logged-in Xueqiu cookie: cookie_import {channel:"xueqiu", browser:"brave"}';

export type XueqiuFetch = typeof fetch;
export type XueqiuDeps = { env?: NodeJS.ProcessEnv; fetch?: XueqiuFetch };
export type XueqiuResult = { ok: true; output: string } | { ok: false; error: string; fix: string };

function headers(cookie: string): Record<string, string> {
  return { "user-agent": UA, referer: "https://xueqiu.com/", cookie };
}

async function jsonGet(url: string, deps: XueqiuDeps = {}): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const cookie = loadCookie("xueqiu", deps.env);
  if (!cookie) return { ok: false, error: "no xueqiu cookie" };
  try {
    const res = await (deps.fetch ?? fetch)(url, { headers: headers(cookie) });
    const text = await res.text();
    const json = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${xueqiuError(json)}` };
    const err = xueqiuError(json);
    return err ? { ok: false, error: err } : { ok: true, json };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function xueqiuError(json: Record<string, unknown>): string {
  const code = json.error_code;
  if (!code) return "";
  const desc = String(json.error_description ?? "Xueqiu API error");
  return `${desc} (${String(code)})`;
}

function fail(error: string): XueqiuResult {
  return { ok: false, error, fix: FIX };
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

export async function xueqiuQuote(symbol: string, deps: XueqiuDeps = {}): Promise<XueqiuResult> {
  const r = await jsonGet(`https://stock.xueqiu.com/v5/stock/batch/quote.json?symbol=${enc(symbol)}`, deps);
  if (!r.ok) return fail(r.error);
  const root = r.json as { data?: { items?: Array<{ quote?: Record<string, unknown> }> } };
  const q = root.data?.items?.[0]?.quote;
  if (!q) return fail("quote response contained no quote item");
  return { ok: true, output: formatQuote(q, symbol) };
}

function formatQuote(q: Record<string, unknown>, symbol: string): string {
  const lines = [
    `${String(q.name ?? "")} ${String(q.symbol ?? symbol)}`,
    `current: ${String(q.current ?? "—")} (${String(q.percent ?? "—")}%)`,
    `open: ${String(q.open ?? "—")} high: ${String(q.high ?? "—")} low: ${String(q.low ?? "—")} prev: ${String(q.last_close ?? "—")}`,
  ];
  return lines.join("\n");
}

export async function xueqiuSearch(query: string, limit = 10, deps: XueqiuDeps = {}): Promise<XueqiuResult> {
  const r = await jsonGet(`https://xueqiu.com/stock/search.json?code=${enc(query)}&size=${limit}`, deps);
  if (!r.ok) return fail(r.error);
  const stocks = ((r.json as { stocks?: unknown[] }).stocks ?? []).slice(0, limit);
  const rows = stocks.map((item, i) => {
    const s = item as Record<string, unknown>;
    return `${i + 1}. ${String(s.name ?? "")} · ${String(s.code ?? "")} · ${String(s.exchange ?? "")}`;
  });
  return { ok: true, output: rows.length ? [`Xueqiu stock search — ${rows.length}`, ...rows].join("\n") : "Xueqiu stock search: no results" };
}

export async function xueqiuHotPosts(limit = 10, deps: XueqiuDeps = {}): Promise<XueqiuResult> {
  const url = `https://xueqiu.com/v4/statuses/public_timeline_by_category.json?since_id=-1&max_id=-1&count=${limit}&category=-1`;
  const r = await jsonGet(url, deps);
  if (!r.ok) return fail(r.error);
  const list = ((r.json as { list?: unknown[] }).list ?? []).slice(0, limit);
  const rows = list.map((item, i) => formatPost(item, i));
  return { ok: true, output: rows.length ? [`Xueqiu hot posts — ${rows.length}`, ...rows].join("\n") : "Xueqiu hot posts: no results" };
}

export async function xueqiuHotStocks(limit = 10, type = 10, deps: XueqiuDeps = {}): Promise<XueqiuResult> {
  const r = await jsonGet(`https://stock.xueqiu.com/v5/stock/hot_stock/list.json?size=${limit}&type=${type}`, deps);
  if (!r.ok) return fail(r.error);
  const items = ((r.json as { data?: { items?: unknown[] } }).data?.items ?? []).slice(0, limit);
  const rows = items.map((item, i) => {
    const s = item as Record<string, unknown>;
    return `${i + 1}. ${String(s.name ?? "")} · ${String(s.code ?? s.symbol ?? "")} · ${String(s.current ?? "—")} (${String(s.percent ?? "—")}%)`;
  });
  return { ok: true, output: rows.length ? [`Xueqiu hot stocks — ${rows.length}`, ...rows].join("\n") : "Xueqiu hot stocks: no results" };
}

function formatPost(item: unknown, index: number): string {
  const data = (item as Record<string, unknown>).data;
  const post = parsePost(data);
  const user = post.user as Record<string, unknown> | undefined;
  const text = String(post.text ?? post.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const target = post.target ? `https://xueqiu.com${String(post.target)}` : "";
  const title = String((post.title ?? text.slice(0, 80)) || "(untitled)");
  return `${index + 1}. ${title}${user?.screen_name ? ` · ${String(user.screen_name)}` : ""}${target ? `\n   ${target}` : ""}`;
}

function parsePost(data: unknown): Record<string, unknown> {
  if (typeof data !== "string") return {};
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {};
  }
}
