import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Argv for the desktop runtime child. The precompiled bundle starts in plain
 * node; tsx (transpile on every launch) is the fallback when the bundle is
 * missing or VANTA_DESKTOP_RUNTIME=tsx asks for the TypeScript sources.
 */
export function serverLaunchArgs({ paths, port, companion = false, env = process.env, exists = existsSync }) {
  const tail = ["desktop", String(port), "--no-open", ...(companion ? ["--companion"] : [])];
  const forcedSource = env.VANTA_DESKTOP_RUNTIME === "tsx";
  if (!forcedSource && exists(paths.bundle)) return { runtime: "bundle", args: [paths.bundle, ...tail] };
  const reason = forcedSource ? "VANTA_DESKTOP_RUNTIME=tsx" : `runtime bundle missing at ${paths.bundle}`;
  return { runtime: "tsx", reason, args: ["--import", pathToFileURL(paths.loader).href, paths.cli, ...tail] };
}
