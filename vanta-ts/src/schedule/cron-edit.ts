import { loadLegacyCron, saveCron, type CronEntry } from "./cron.js";

export type CronPatch = {
  cron?: string;
  instruction?: string;
  script?: string;
  status?: CronEntry["status"];
  /** Rebinds the script's exact bytes to a fresh authority; pass only after a human approved them. */
  authority?: { scriptSha256: string; authorityId: string };
};

/** Applies a patch to one file-backed entry. Returns null when the id is not in cron.tsv. */
export async function updateCron(dataDir: string, id: number, patch: CronPatch): Promise<CronEntry | null> {
  const entries = await loadLegacyCron(dataDir);
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return null;
  if (patch.cron !== undefined) entry.cron = patch.cron;
  if (patch.instruction !== undefined) entry.instruction = patch.instruction;
  if (patch.script !== undefined) entry.script = patch.script;
  if (patch.status !== undefined) entry.status = patch.status;
  if (patch.authority) {
    entry.scriptSha256 = patch.authority.scriptSha256;
    entry.authorityId = patch.authority.authorityId;
  }
  await saveCron(dataDir, entries);
  return entry;
}

export function isScriptMode(entry: CronEntry): boolean {
  return entry.mode === "no_agent" || entry.mode === "script_context";
}

/** The exact bytes a script-mode entry will execute. */
export function scriptOf(entry: CronEntry): string | undefined {
  return entry.script ?? (entry.mode === "no_agent" ? entry.instruction : undefined);
}
