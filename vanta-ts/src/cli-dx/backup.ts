import { dirname, basename, join, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";

// CLI-DX-PACK — `vanta backup [out.tgz]` / `vanta import <in.tgz>`: zip + restore
// the global store (~/.vanta) with the system `tar` (no new dep). The store is
// git-init'd for versioning, but a single portable archive is what you grab
// before a machine move. Pure command-building; tar is the only side effect.

/** Resolve the ~/.vanta store dir (VANTA_HOME override), ~-expanded. */
export function storeDir(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.VANTA_HOME?.trim();
  if (!raw) return join(homedir(), ".vanta");
  return raw.startsWith("~") ? join(homedir(), raw.slice(1)) : resolve(raw);
}

/** tar argv to archive the store into `out`. Pure. */
export function backupArgs(store: string, out: string): string[] {
  // -C parent so the archive holds "<basename>/…" not absolute paths.
  return ["-czf", out, "-C", dirname(store), basename(store)];
}

/** tar argv to extract `archive` into the store's parent. Pure. */
export function importArgs(store: string, archive: string): string[] {
  return ["-xzf", archive, "-C", dirname(store)];
}

function abs(p: string): string {
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

async function tar(args: string[]): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("tar", args);
}

export async function runBackup(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const store = storeDir(env);
  const out = abs(argv[0] ?? `vanta-backup-${basename(store)}.tgz`);
  try {
    await tar(backupArgs(store, out));
    console.log(`  ✓ backed up ${store} → ${out}`);
    return 0;
  } catch (e) {
    console.log(`  backup failed: ${(e as Error).message.split("\n")[0]}`);
    return 1;
  }
}

export async function runImport(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const archive = argv[0];
  if (!archive) { console.log("  usage: vanta import <archive.tgz>"); return 1; }
  const store = storeDir(env);
  try {
    await tar(importArgs(store, abs(archive)));
    console.log(`  ✓ restored ${archive} → ${dirname(store)}`);
    return 0;
  } catch (e) {
    console.log(`  import failed: ${(e as Error).message.split("\n")[0]}`);
    return 1;
  }
}
