import { watch, type FSWatcher } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { fireHooks, loadShellHooks, matchingHooks } from "./shell-hooks.js";
import type { HookRunDeps } from "./shell-hook-run.js";

const IGNORED = /(^|[/\\])(\.git|\.vanta|node_modules)([/\\]|$)/;
const DEBOUNCE_MS = 50;

function shouldIgnore(rel: string): boolean {
  return !rel || IGNORED.test(rel);
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

export async function hasFileChangedHooks(dataDir: string): Promise<boolean> {
  const config = await loadShellHooks(dataDir);
  return (config.FileChanged ?? []).length > 0;
}

export async function startHookFileWatcher(
  repoRoot: string,
  opts: HookRunDeps & { dataDir?: string; watch?: typeof watch } = {},
): Promise<() => void> {
  const dataDir = opts.dataDir ?? join(repoRoot, ".vanta");
  if (!await hasFileChangedHooks(dataDir)) return () => {};
  const watchFn = opts.watch ?? watch;
  let watcher: FSWatcher;
  try {
    watcher = watchFn(repoRoot, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      void fireFileChanged({ repoRoot, dataDir, filename: normalize(String(filename)), eventType, opts });
    });
  } catch {
    watcher = watchFn(repoRoot, (eventType, filename) => {
      if (!filename) return;
      void fireFileChanged({ repoRoot, dataDir, filename: normalize(String(filename)), eventType, opts });
    });
  }
  watcher.unref?.();
  return () => watcher.close();
}

async function fireFileChanged(o: {
  repoRoot: string;
  dataDir: string;
  filename: string;
  eventType: string;
  opts: HookRunDeps;
}): Promise<void> {
  const { repoRoot, dataDir, filename, eventType, opts } = o;
  const abs = isAbsolute(filename) ? filename : join(repoRoot, filename);
  const rel = normalize(relative(repoRoot, abs));
  if (shouldIgnore(rel)) return;
  await new Promise((resolve) => {
    const t = setTimeout(resolve, DEBOUNCE_MS);
    t.unref?.();
  });
  const config = await loadShellHooks(dataDir);
  if (!matchingHooks(config, "FileChanged", { matcherValue: rel }).length) return;
  await fireHooks(dataDir, "FileChanged", { filePath: rel, eventType }, { cwd: repoRoot, matcherValue: rel, ...opts });
}
