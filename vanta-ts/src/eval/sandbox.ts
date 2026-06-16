import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

// An isolated per-task working dir, created UNDER the repo's .vanta (so it stays
// inside the kernel's scope — no re-scoping needed), seeded with the task's files.
// Trusted eval tasks only; the verifier checks files here after the agent runs.

export type Sandbox = { root: string; cleanup: () => void };

export function makeSandbox(baseDir: string, seed?: Record<string, string>): Sandbox {
  mkdirSync(baseDir, { recursive: true });
  const root = mkdtempSync(join(baseDir, "task-"));
  for (const [rel, content] of Object.entries(seed ?? {})) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return {
    root,
    cleanup: () => { try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } },
  };
}
