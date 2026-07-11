import {
  inspectProfileDistribution,
  installProfileDistribution,
  updateProfileDistribution,
  type DistributionPreview,
} from "../profiles/distribution.js";

export type ProfileCommandDeps = { env?: NodeJS.ProcessEnv; log?: (line: string) => void };

function usage(log: (line: string) => void): number {
  log("Usage: vanta profile install <git|path> [--apply] | update <profile-id> [--apply]");
  return 1;
}

function printPreview(preview: DistributionPreview, log: (line: string) => void): void {
  log(`preview ${preview.profileId} · source ${preview.sourceCommit}`);
  for (const file of preview.files) log(`  ${file}`);
  log("private memory, sessions, inbox, history, credentials, and secret files are excluded");
}

async function install(target: string, apply: boolean, env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  if (!apply) {
    printPreview(await inspectProfileDistribution(target), log);
    log("rerun with --apply to install");
    return 0;
  }
  const installed = await installProfileDistribution(target, env);
  log(`installed ${installed.profile.id} · source ${installed.sourceCommit}`);
  return 0;
}

async function update(target: string, apply: boolean, env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  const updated = await updateProfileDistribution(target, env, { apply });
  printPreview(updated, log);
  log(updated.applied ? `updated ${target} · backup ${updated.backupDir}` : `changed ${updated.changed.length}: ${updated.changed.join(", ") || "none"}\nrerun with --apply to update`);
  return 0;
}

export async function runProfileCommand(rest: string[], deps: ProfileCommandDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  const [command, target] = rest;
  if (!target || (command !== "install" && command !== "update")) return usage(log);
  const apply = rest.includes("--apply");
  try {
    return command === "install" ? install(target, apply, env, log) : update(target, apply, env, log);
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
