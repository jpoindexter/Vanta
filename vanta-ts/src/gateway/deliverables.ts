import { basename, extname } from "node:path";
import type { WorkProduct } from "../cofounder/work-products.js";
import { fsStatMtime, validateMediaSend, type StatMtime } from "./media-send-guard.js";

const SUPPORTED: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".pdf": "application/pdf", ".csv": "text/csv", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".html": "text/html",
  ".txt": "text/plain", ".md": "text/markdown",
};
const SOURCE_EXTENSIONS = new Set([".js", ".ts", ".tsx", ".jsx", ".py", ".rs", ".sh", ".log", ".json", ".yaml", ".yml"]);
const PATH_RE = /(?:^|[\s`(])((?:\.\.\/|\.\/|\/)[^\s`)'"<>]+\.[a-zA-Z0-9]{1,8})(?=$|[\s`)\]}>.,;:!?])/gm;

export type DeliverableFile = { path: string; name: string; mime: string; source: "reply" | "work-product" };
export type DeliverablePlan = { visibleText: string; files: DeliverableFile[]; skipped: string[] };

export async function planDeliverables(opts: {
  reply: string; root: string; env: NodeJS.ProcessEnv; now: number; workProducts: WorkProduct[];
  stat?: StatMtime; maxAgeMs?: number;
}): Promise<DeliverablePlan> {
  const replyPaths = extractPaths(opts.reply);
  const approved = opts.workProducts.filter((item) => item.approved).map((item) => item.artifact);
  const candidates = uniqueCandidates(replyPaths, approved);
  const files: DeliverableFile[] = [], skipped: string[] = [];
  for (const candidate of candidates) {
    const ext = extname(candidate.path).toLowerCase(), mime = SUPPORTED[ext];
    if (!mime) { skipped.push(`${candidate.path}: ${SOURCE_EXTENSIONS.has(ext) ? "unsupported extension" : "unsupported file type"} ${ext || "(none)"}`); continue; }
    const verdict = await validateMediaSend(candidate.path, {
      root: opts.root, env: opts.env, now: opts.now, stat: opts.stat ?? fsStatMtime, maxAgeMs: opts.maxAgeMs,
    });
    if (!verdict.ok) { skipped.push(verdict.error); continue; }
    files.push({ path: verdict.abs, name: basename(verdict.abs), mime, source: candidate.source });
  }
  return { visibleText: cleanVisibleText(opts.reply, replyPaths), files, skipped };
}

function extractPaths(text: string): string[] {
  const paths: string[] = [];
  for (const match of text.matchAll(PATH_RE)) if (match[1]) paths.push(match[1]);
  return [...new Set(paths)];
}

function uniqueCandidates(reply: string[], approved: string[]): Array<{ path: string; source: "reply" | "work-product" }> {
  const byPath = new Map<string, { path: string; source: "reply" | "work-product" }>();
  for (const path of reply) byPath.set(path, { path, source: "reply" });
  for (const path of approved) if (!byPath.has(path)) byPath.set(path, { path, source: "work-product" });
  return [...byPath.values()];
}

function cleanVisibleText(text: string, paths: string[]): string {
  let visible = text;
  for (const path of paths) visible = visible.replaceAll(path, "");
  return visible.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim() || "Deliverable ready.";
}
