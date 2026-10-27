import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export type ProfileKernelState = { directory: string; owner: string; scopeId: string };

/** Derived only from the explicit runtime identity, never a project-configured state-directory override. */
export function profileKernelState(root: string, env: NodeJS.ProcessEnv = process.env): ProfileKernelState | undefined {
  const owner = env.VANTA_PROFILE;
  if (!owner || owner === "default") return undefined;
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(owner)) throw new Error("Invalid kernel profile owner.");
  const base = env.VANTA_PROFILE_BASE_HOME;
  const home = env.VANTA_HOME;
  if (!base || !home || !isAbsolute(base) || !isAbsolute(home)) throw new Error("Kernel profile home is not bound.");
  const canonicalBase = realpathSync(base);
  const expected = join(canonicalBase, "profiles", owner);
  if (resolve(home) !== expected || realpathSync(home) !== expected) throw new Error("Kernel profile home does not match its owner.");
  const project = realpathSync(root);
  return { directory: join(expected, "kernel-state", createHash("sha256").update(project).digest("hex")), owner,
    scopeId: createHash("sha256").update(owner + "\n" + project).digest("hex") };
}

/** Create only private, non-symlink state directories inside the already validated profile home. */
export function prepareProfileKernelState(state: ProfileKernelState): void {
  const parent = resolve(state.directory, "..");
  for (const directory of [parent, state.directory]) {
    if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
    const info = lstatSync(directory);
    if (info.isSymbolicLink() || !info.isDirectory() || realpathSync(directory) !== directory) {
      throw new Error("Kernel profile state must be a private, non-symlink directory.");
    }
    chmodSync(directory, 0o700);
  }
  const ignore = join(parent, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n", { flag: "wx", mode: 0o600 });
  if (!lstatSync(ignore).isFile() || realpathSync(ignore) !== ignore || readFileSync(ignore, "utf8") !== "*\n") {
    throw new Error("Kernel profile state must be excluded from home versioning.");
  }
}
