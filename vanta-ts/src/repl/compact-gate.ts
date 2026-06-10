// CC-COMPACT-INSTRUCTIONS — an opt-out kill switch for conversation compaction.
// Strict "1" (not the default-on `compressEnabled` contract): compaction is ON
// unless the operator explicitly disables it. Either env var (canonical
// `VANTA_DISABLE_COMPACT`, or the unprefixed `DISABLE_COMPACT`) flips it off.

/** True when the operator has explicitly disabled compaction via env. Pure. */
export function compactionDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VANTA_DISABLE_COMPACT === "1" || env.DISABLE_COMPACT === "1";
}
