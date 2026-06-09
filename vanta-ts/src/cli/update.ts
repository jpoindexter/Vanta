import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolveVantaHome } from "../store/home.js";

// SELF-UPDATE — `vanta update` safe self-updater with rollback.
// Pattern: autostash → snapshot tag → pull → rebuild → skills sync → service restart.
// `vanta update --rollback` restores the last snapshot.

const run = promisify(execFile);
const SNAPSHOT_REF = "vanta-pre-update";

type UpdateResult = {
  ok: boolean;
  lines: string[];
};

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

async function tryGit(args: string[], cwd: string): Promise<string | null> {
  try { return await git(args, cwd); } catch { return null; }
}

async function snapPath(): Promise<string> {
  const dir = join(resolveVantaHome(), "snapshots");
  await mkdir(dir, { recursive: true });
  return join(dir, "pre-update.json");
}

async function saveSnapshot(repoRoot: string): Promise<void> {
  const sha = await git(["rev-parse", "HEAD"], repoRoot);
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  const snap = { sha, branch, savedAt: new Date().toISOString() };
  await writeFile(await snapPath(), JSON.stringify(snap, null, 2), "utf8");
}

async function loadSnapshot(): Promise<{ sha: string; branch: string; savedAt: string } | null> {
  try { return JSON.parse(await readFile(await snapPath(), "utf8")); } catch { return null; }
}

export async function runUpdateCommand(repoRoot: string, args: string[]): Promise<number> {
  const result: UpdateResult = { ok: true, lines: [] };
  const log = (s: string): void => { result.lines.push(s); console.log(s); };

  if (args.includes("--rollback")) {
    const snap = await loadSnapshot();
    if (!snap) { console.error("  no snapshot found — run `vanta update` first"); return 1; }
    log(`  rolling back to ${snap.sha.slice(0, 8)} on ${snap.branch} (snapshot from ${snap.savedAt})`);
    try {
      await git(["checkout", snap.branch], repoRoot);
      await git(["reset", "--hard", snap.sha], repoRoot);
      log("  ✓ rolled back");
    } catch (err) {
      console.error(`  rollback failed: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    return 0;
  }

  // Step 1: check for local changes + autostash
  const dirty = await git(["status", "--short"], repoRoot);
  const stashed = dirty ? await tryGit(["stash", "push", "-m", "vanta-update-autostash"], repoRoot) : null;
  if (stashed) log(`  stashed local changes (restore with: git stash pop)`);

  // Step 2: save rollback snapshot
  await saveSnapshot(repoRoot);
  const before = await git(["rev-parse", "HEAD"], repoRoot);
  log(`  snapshot saved (pre-update: ${before.slice(0, 8)})`);

  // Step 3: pull
  try {
    const pullOut = await git(["pull", "--ff-only"], repoRoot);
    const after = await git(["rev-parse", "HEAD"], repoRoot);
    if (before === after) {
      log("  ✓ already up to date");
      if (stashed) { await tryGit(["stash", "pop"], repoRoot); log("  restored local changes"); }
      return 0;
    }
    log(`  ⬆ pulled: ${pullOut.split("\n")[0] ?? ""}`);
  } catch {
    console.error("  pull failed — no network or not on a tracking branch");
    if (stashed) { await tryGit(["stash", "pop"], repoRoot); }
    return 1;
  }

  // Step 4: rebuild kernel (Rust) + refresh deps (Node)
  log("  rebuilding…");
  await tryGit([], repoRoot); // noop (just ensuring we stay in repo context)
  try {
    await run("cargo", ["build"], { cwd: repoRoot });
    log("  ✓ kernel rebuilt");
  } catch { log("  ⚠ kernel build failed — check cargo"); }
  try {
    await run("npm", ["install", "--silent"], { cwd: join(repoRoot, "vanta-ts") });
    log("  ✓ npm deps refreshed");
  } catch { log("  ⚠ npm install failed"); }

  // Step 5: sync bundled skills
  try {
    const { installSkillLibrary } = await import("../skills/library.js");
    const { installed, skipped } = await installSkillLibrary({ force: false });
    if (installed.length) log(`  ✓ skills updated: ${installed.join(", ")}`);
    if (skipped.length) log(`  · skills kept (user-modified): ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}`);
  } catch { log("  ⚠ skill sync failed"); }

  // Step 6: restore stash
  if (stashed) {
    const ok = await tryGit(["stash", "pop"], repoRoot);
    if (ok) log("  ✓ restored local changes");
    else log("  ⚠ stash pop had conflicts — check `git status`");
  }

  // Step 7: restart service (best-effort)
  await tryRun("vanta", ["service", "uninstall"], repoRoot);
  await tryRun("vanta", ["service", "install"], repoRoot);
  log("  ✓ service restarted (if running)");

  log("  done. run `vanta` to start the updated session.");
  return 0;
}

async function tryRun(cmd: string, args: string[], cwd: string): Promise<void> {
  try { await run(cmd, args, { cwd }); } catch { /* best-effort */ }
}
