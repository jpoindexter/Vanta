import type http from "node:http";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { extname, isAbsolute, resolve, sep } from "node:path";
import { isSafeProjectFile } from "./file-context.js";
import { sendJson } from "./handler-http.js";

const LIMIT = 256 * 1024;
const TEXT = new Set([".md", ".mdx", ".txt", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".csv", ".yml", ".yaml", ".toml", ".rs", ".py"]);

function permittedPreviewPath(path: string): boolean {
  return Boolean(path) && !isAbsolute(path) && !path.split(/[\\/]/).includes("..")
    && isSafeProjectFile(path) && TEXT.has(extname(path).toLowerCase());
}

/** Read-only, bounded preview; HTML, binaries, private paths and symlinks stay closed. */
export async function readProjectPreview(root: string, path: string) {
  if (!permittedPreviewPath(path)) {
    throw new Error("This file is not available for inline preview.");
  }
  const base = await realpath(root);
  const target = resolve(base, path);
  if (!target.startsWith(`${base}${sep}`) || await realpath(target) !== target) throw new Error("Preview must stay inside this project without symlinks.");
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > LIMIT) throw new Error("Preview supports text files up to 256 KiB.");
    const bytes = Buffer.alloc(LIMIT + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > LIMIT) throw new Error("File grew beyond the preview limit.");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead));
    if (content.includes("\0")) throw new Error("Binary files cannot be previewed as text.");
    return { path, content, markdown: /\.mdx?$/i.test(path) };
  } finally { await file.close(); }
}

export async function handleFilePreview(root: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const path = new URL(req.url ?? "/", "http://localhost").searchParams.get("path") ?? "";
  try { sendJson(res, 200, await readProjectPreview(root, path)); }
  catch { sendJson(res, 422, { error: "Preview unavailable. Choose a UTF-8 project file under 256 KiB. Private files, symlinks and executable HTML are excluded." }); }
}
