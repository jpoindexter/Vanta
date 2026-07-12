import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, normalize, relative } from "node:path";
import { desktopHtml } from "./page.js";

export type DesktopAsset =
  | { kind: "file"; contentType: string; body: Buffer }
  | { kind: "fallback"; contentType: string; body: Buffer }
  | { kind: "missing" };

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function desktopDist(repoRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.VANTA_DESKTOP_DIST || join(repoRoot, "vanta-ts", "desktop-app", "dist");
}

function contentType(path: string): string {
  return TYPES[extname(path)] ?? "application/octet-stream";
}

function assetPath(repoRoot: string, pathname: string): string | null {
  const dist = desktopDist(repoRoot);
  const rel = pathname === "/" || pathname === "/companion" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const full = normalize(join(dist, rel));
  return relative(dist, full).startsWith("..") ? null : full;
}

export async function resolveDesktopAsset(repoRoot: string, pathname: string): Promise<DesktopAsset> {
  const path = assetPath(repoRoot, pathname);
  if (!path) return { kind: "missing" };
  try {
    return { kind: "file", contentType: contentType(path), body: await readFile(path) };
  } catch {
    if (pathname === "/" || pathname === "/companion") {
      return { kind: "fallback", contentType: "text/html; charset=utf-8", body: Buffer.from(desktopHtml(), "utf8") };
    }
    return { kind: "missing" };
  }
}

export async function writeDesktopAsset(repoRoot: string, pathname: string, res: ServerResponse): Promise<boolean> {
  if (pathname !== "/" && pathname !== "/companion" && !pathname.startsWith("/assets/")) return false;
  const asset = await resolveDesktopAsset(repoRoot, pathname);
  if (asset.kind === "missing") return false;
  res.writeHead(200, { "content-type": asset.contentType });
  res.end(asset.body);
  return true;
}
