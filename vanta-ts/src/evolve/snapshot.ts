import { cpSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Rollback floor for the evolve loop: copy the harness component dir to a temp
// backup before an edit; restore() reverts it on no-lift, discard() drops the
// backup on keep. If the dir didn't exist, restore() removes whatever the edit
// created (back to nothing).

export type Snapshot = { restore: () => void; discard: () => void };

export function snapshotDir(dir: string): Snapshot {
  if (!existsSync(dir)) {
    return {
      restore: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } },
      discard: () => { /* nothing backed up */ },
    };
  }
  const backupRoot = mkdtempSync(join(tmpdir(), "vanta-evolve-"));
  const backup = join(backupRoot, "snap");
  cpSync(dir, backup, { recursive: true });
  return {
    restore: () => {
      rmSync(dir, { recursive: true, force: true });
      cpSync(backup, dir, { recursive: true });
      try { rmSync(backupRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    },
    discard: () => { try { rmSync(backupRoot, { recursive: true, force: true }); } catch { /* best-effort */ } },
  };
}
