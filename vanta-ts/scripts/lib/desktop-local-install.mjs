import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export function hasRunningDesktop(processes, target) {
  return processes.split("\n").some((line) => line.trim() === `${target}/Contents/MacOS/Vanta`
    || line.trim().startsWith(`${target}/Contents/Frameworks/`));
}

export async function appDigest(app) {
  return createHash("sha256").update(await readFile(join(app, "Contents/Resources/app.asar"))).digest("hex");
}

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function validatePaths({ candidate, target, backupRoot, verify, assertStopped }) {
  for (const path of [candidate, target]) {
    if (!isAbsolute(path) || basename(path) !== "Vanta.app") throw new Error("Expected an absolute Vanta.app bundle path.");
    if (await exists(path) && (await lstat(path)).isSymbolicLink()) throw new Error("Refusing a symlink bundle.");
  }
  if (resolve(candidate) === resolve(target)) throw new Error("Candidate and installed app must be different.");
  if (!isAbsolute(backupRoot) || [candidate, target].some((path) => resolve(backupRoot).startsWith(`${path}/`))) {
    throw new Error("Rollback directory must be outside both bundles.");
  }
  if (typeof verify !== "function" || typeof assertStopped !== "function") throw new Error("Signature and running-app checks are required.");
}

async function copyBundle(source, destination) {
  if (process.platform === "darwin") execFileSync("ditto", [source, destination]);
  else await cp(source, destination, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
}

async function replaceBundle({ staged, target, backup, verify }) {
  const hadPrevious = await exists(target);
  if (hadPrevious) await rename(target, backup);
  try {
    await rename(staged, target);
    await verify(target);
  } catch (error) {
    if (await exists(target)) await rename(target, join(dirname(backup), "Rejected-Vanta.app"));
    if (hadPrevious) await rename(backup, target);
    throw error;
  }
  return hadPrevious;
}

/** Never quits Vanta, touches its profile, removes a rollback, or installs an unverified candidate. */
export async function installLocalDesktop(options) {
  await validatePaths(options);
  const { candidate, target, backupRoot, verify, assertStopped } = options;
  await assertStopped();
  await verify(candidate);
  const expected = await appDigest(candidate);
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  const recordRoot = await mkdtemp(join(backupRoot, "update-"));
  const stageRoot = await mkdtemp(join(dirname(target), ".vanta-update-"));
  const staged = join(stageRoot, "Vanta.app");
  await copyBundle(candidate, staged);
  await verify(staged);
  if (await appDigest(staged) !== expected) throw new Error("Staged app does not match the tested candidate.");
  await assertStopped();
  const previous = await exists(target) ? await appDigest(target) : null;
  const backup = join(recordRoot, "Vanta.app");
  const checkInstalled = async (path) => {
    await verify(path);
    if (await appDigest(path) !== expected) throw new Error("Installed app does not match the tested candidate.");
  };
  const hadPrevious = await replaceBundle({ staged, target, backup, verify: checkInstalled });
  const receipt = { target, backup: hadPrevious ? backup : null, installedSha256: expected, previousSha256: previous,
    installedAt: new Date().toISOString(), receiptPath: join(recordRoot, "receipt.json") };
  await writeFile(receipt.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}
