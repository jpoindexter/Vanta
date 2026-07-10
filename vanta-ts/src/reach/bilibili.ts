import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 30_000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export type BilibiliRunner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
export type BilibiliFetch = typeof fetch;
export type BilibiliDeps = { run?: BilibiliRunner; fetch?: BilibiliFetch };
export type BilibiliResult = { ok: true; output: string; backend: string } | { ok: false; error: string; fix?: string };

const realRun: BilibiliRunner = async (cmd, args) => run(cmd, args, { timeout: TIMEOUT_MS, encoding: "utf8" });

export function bvId(input: string): string {
  return /^(BV[0-9A-Za-z]+)$/.test(input) ? input : /(BV[0-9A-Za-z]+)/.exec(input)?.[1] ?? input;
}

function clean(text: string): string {
  return text.trim() || "(no output)";
}

function missingTool(err: unknown): boolean {
  const e = err as { code?: string | number; message?: string };
  return e.code === "ENOENT" || /not found|ENOENT/i.test(e.message ?? "");
}

export async function searchBilibili(query: string, limit = 5, deps: BilibiliDeps = {}): Promise<BilibiliResult> {
  try {
    const r = await (deps.run ?? realRun)("bili", ["search", query, "--type", "video", "-n", String(limit)]);
    return { ok: true, backend: "bili-cli", output: clean(r.stdout || r.stderr) };
  } catch (err) {
    const api = await searchBilibiliApi(query, limit, deps.fetch);
    if (api.ok) return api;
    const fix = "install bili-cli: pipx install bilibili-cli";
    if (missingTool(err)) return { ok: false, error: `bili-cli missing; API fallback failed: ${api.error}`, fix };
    return { ok: false, error: `bili-cli failed: ${(err as Error).message}; API fallback failed: ${api.error}`, fix };
  }
}

export async function readBilibiliVideo(idOrUrl: string, deps: BilibiliDeps = {}): Promise<BilibiliResult> {
  const id = bvId(idOrUrl);
  try {
    const r = await (deps.run ?? realRun)("bili", ["video", id]);
    return { ok: true, backend: "bili-cli", output: clean(r.stdout || r.stderr) };
  } catch (err) {
    return {
      ok: false,
      error: missingTool(err) ? "bili-cli missing" : `bili-cli failed: ${(err as Error).message}`,
      fix: "install bili-cli: pipx install bilibili-cli",
    };
  }
}

export async function readBilibiliSubtitles(idOrUrl: string, deps: BilibiliDeps = {}): Promise<BilibiliResult> {
  const id = bvId(idOrUrl);
  try {
    const r = await (deps.run ?? realRun)("opencli", ["bilibili", "subtitle", id]);
    return { ok: true, backend: "opencli", output: clean(r.stdout || r.stderr) };
  } catch (err) {
    return {
      ok: false,
      error: missingTool(err) ? "OpenCLI missing" : `OpenCLI failed: ${(err as Error).message}`,
      fix: "install/configure OpenCLI, then retry: opencli bilibili subtitle BVxxx",
    };
  }
}

export async function searchBilibiliApi(query: string, limit = 5, fetcher: BilibiliFetch = fetch): Promise<BilibiliResult> {
  const url = new URL("https://api.bilibili.com/x/web-interface/search/all/v2");
  url.searchParams.set("keyword", query);
  url.searchParams.set("page", "1");
  try {
    const res = await fetcher(url, { headers: { "user-agent": UA, referer: "https://www.bilibili.com/" } });
    if (!res.ok) return { ok: false, error: `Bilibili API HTTP ${res.status}` };
    return { ok: true, backend: "bilibili-search-api", output: formatSearchApi(await res.json(), limit) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function formatSearchApi(json: unknown, limit = 5): string {
  const root = json as { code?: unknown; data?: { result?: Array<{ result_type?: string; data?: unknown[] }> } };
  if (root.code !== 0) return `Bilibili API returned code ${String(root.code ?? "unknown")}`;
  const videos = root.data?.result?.find((r) => r.result_type === "video")?.data ?? [];
  const rows = videos.slice(0, limit).map((item, index) => {
    const d = item as Record<string, unknown>;
    const title = String(d.title ?? "").replace(/<[^>]+>/g, "").trim() || "(untitled)";
    const id = String(d.bvid ?? d.aid ?? "");
    const author = d.author ? ` · ${String(d.author)}` : "";
    const url = d.arcurl ? String(d.arcurl) : id ? `https://www.bilibili.com/video/${id}` : "";
    return `${index + 1}. ${title}${author}${id ? ` · ${id}` : ""}${url ? `\n   ${url}` : ""}`;
  });
  return rows.length ? [`Bilibili search — ${rows.length} video(s)`, ...rows].join("\n") : "Bilibili search: no videos found";
}
