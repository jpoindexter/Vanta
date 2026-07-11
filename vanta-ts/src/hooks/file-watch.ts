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
): Promise<() => Promise<void>> {
  const dataDir = opts.dataDir ?? join(repoRoot, ".vanta");
  if (!await hasFileChangedHooks(dataDir)) return async () => {};
  const watchFn = opts.watch ?? watch;
  const pending = new Set<Promise<void>>();
  const dispatch = (eventType: string, filename: string | Buffer | null): void => {
    if (!filename) return;
    const task = fireFileChanged({ repoRoot, dataDir, filename: normalize(String(filename)), eventType, opts });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };
  let watcher: FSWatcher;
  try {
    watcher = watchFn(repoRoot, { recursive: true }, dispatch);
  } catch {
    watcher = watchFn(repoRoot, dispatch);
  }
  watcher.unref?.();
  return async () => { watcher.close(); await Promise.allSettled([...pending]); };
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
