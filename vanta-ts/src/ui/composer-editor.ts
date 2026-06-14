import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ^G — edit the current composer buffer in $EDITOR. Synchronous on purpose: the
// child editor owns the TTY while it runs (Ink's render is paused since the event
// loop is blocked), and the next setState repaints cleanly on return. Best-effort
// — any failure returns the buffer unchanged.

/** Resolve the editor command + its leading args (e.g. `code -w`). */
function resolveEditor(env: NodeJS.ProcessEnv): string[] {
  const raw = env.VANTA_EDITOR || env.VISUAL || env.EDITOR || "vi";
  return raw.split(/\s+/).filter(Boolean);
}

export function editInEditor(current: string, env: NodeJS.ProcessEnv = process.env): string {
  const [cmd, ...args] = resolveEditor(env);
  if (!cmd) return current;
  const dir = mkdtempSync(join(tmpdir(), "vanta-compose-"));
  const file = join(dir, "message.md");
  try {
    writeFileSync(file, current, "utf8");
    spawnSync(cmd, [...args, file], { stdio: "inherit" });
    return readFileSync(file, "utf8").replace(/\n$/, "");
  } catch {
    return current;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
