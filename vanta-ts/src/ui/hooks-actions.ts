import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadShellHooks, shellHooksPath, type ShellHook, type ShellHookEvent, type ShellHooksConfig } from "../hooks/shell-hooks.js";
import type { OverlayView } from "./use-overlay.js";

export type HooksPanelAction =
  | { kind: "add"; event: ShellHookEvent; hook: ShellHook }
  | { kind: "remove"; event: ShellHookEvent; index: number };

export type HooksOverlayState = {
  config: ShellHooksConfig;
  onAction: (action: HooksPanelAction) => void;
};

type Host = {
  publish: (view: OverlayView) => void;
  isOpen: () => boolean;
};

async function saveShellHooks(dataDir: string, config: ShellHooksConfig): Promise<void> {
  const path = shellHooksPath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function applyHookAction(config: ShellHooksConfig, action: HooksPanelAction): ShellHooksConfig {
  const next: ShellHooksConfig = { ...config };
  const current = [...(next[action.event] ?? [])];
  if (action.kind === "add") current.push(action.hook);
  if (action.kind === "remove") current.splice(action.index, 1);
  next[action.event] = current;
  return next;
}

async function buildView(dataDir: string, host: Host): Promise<OverlayView> {
  const config = await loadShellHooks(dataDir);
  const onAction = (action: HooksPanelAction): void => {
    void saveShellHooks(dataDir, applyHookAction(config, action))
      .then(() => host.isOpen() ? buildView(dataDir, host).then(host.publish) : undefined)
      .catch(() => {});
  };
  return { kind: "hooks", config, onAction };
}

export async function buildHooksOverlay(repoRoot: string, host: Host): Promise<OverlayView> {
  return buildView(join(repoRoot, ".vanta"), host);
}
