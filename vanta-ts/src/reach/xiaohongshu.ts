import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 30_000;
const FIX =
  "install/configure OpenCLI and reuse a logged-in Xiaohongshu browser session; server fallback: run xiaohongshu-mcp and add mcporter config";

export type XiaohongshuRunner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
export type XiaohongshuDeps = { run?: XiaohongshuRunner };
export type XiaohongshuAction = "search" | "note" | "comments" | "feed";
export type XiaohongshuResult = { ok: true; output: string; backend: string } | { ok: false; error: string; fix?: string };

const realRun: XiaohongshuRunner = async (cmd, args) => run(cmd, args, { timeout: TIMEOUT_MS, encoding: "utf8" });

function clean(text: string): string {
  return text.trim() || "(no output)";
}

function missingTool(err: unknown): boolean {
  const e = err as { code?: string | number; message?: string };
  return e.code === "ENOENT" || /not found|ENOENT/i.test(e.message ?? "");
}

export function xiaohongshuNoteId(input: string): string {
  return /\/explore\/([^/?#]+)/i.exec(input)?.[1] ?? /\/discovery\/item\/([^/?#]+)/i.exec(input)?.[1] ?? input;
}

async function runOpenCli(args: string[], deps: XiaohongshuDeps): Promise<XiaohongshuResult> {
  try {
    const r = await (deps.run ?? realRun)("opencli", ["xiaohongshu", ...args, "-f", "yaml"]);
    return { ok: true, backend: "OpenCLI", output: clean(r.stdout || r.stderr) };
  } catch (err) {
    return {
      ok: false,
      error: missingTool(err) ? "OpenCLI missing" : `OpenCLI failed: ${(err as Error).message}`,
      fix: FIX,
    };
  }
}

export async function searchXiaohongshu(query: string, deps: XiaohongshuDeps = {}): Promise<XiaohongshuResult> {
  return runOpenCli(["search", query], deps);
}

export async function readXiaohongshuNote(urlOrId: string, deps: XiaohongshuDeps = {}): Promise<XiaohongshuResult> {
  return runOpenCli(["note", urlOrId], deps);
}

export async function readXiaohongshuComments(noteUrlOrId: string, deps: XiaohongshuDeps = {}): Promise<XiaohongshuResult> {
  return runOpenCli(["comments", xiaohongshuNoteId(noteUrlOrId)], deps);
}

export async function readXiaohongshuFeed(deps: XiaohongshuDeps = {}): Promise<XiaohongshuResult> {
  return runOpenCli(["feed"], deps);
}
