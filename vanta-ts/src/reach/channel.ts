// The reach channel contract — Vanta's "internet reach" layer.
//
// A channel is one platform (web, search, rss, reddit, …). It does NOT read
// content itself; it describes an ORDERED list of backends (primary + fallbacks)
// and a check() that probes which one actually works right now, so the doctor
// can report the active backend + the exact fix on a gap. Mirrors Vanta's
// provider/search resolve-by-env pattern. Adding a platform = one channel file.

/** 0 = zero-config, 1 = needs a free key, 2 = needs setup (login/cookie/CLI). */
export type ChannelTier = 0 | 1 | 2;

export type ChannelStatus = {
  name: string;
  /** ok = a backend is serving; warn = degraded/partial; off = nothing usable. */
  status: "ok" | "warn" | "off";
  /** The backend actually serving this channel now, or null when none works. */
  activeBackend: string | null;
  detail: string;
  /** The exact enabling command/step when status is not ok. */
  fix?: string;
};

export type ReachChannel = {
  name: string;
  description: string;
  /** Ordered candidates: backends[0] is preferred, the rest are fallbacks. */
  backends: string[];
  tier: ChannelTier;
  /** Does this channel handle this URL? (search-only channels return false.) */
  canHandle: (url: string) => boolean;
  /** Really probe the channel's backends and report the active one. */
  check: (env: NodeJS.ProcessEnv) => Promise<ChannelStatus>;
  /**
   * Self-heal: rebuild/upgrade the backend when the platform changed and broke
   * it (CLI-backed channels). Absent for built-in channels that can't break.
   * Returns what it ran + the outcome. Kernel-gated by the caller.
   */
  heal?: (env: NodeJS.ProcessEnv) => Promise<import("./heal.js").HealResult>;
};

/**
 * Candidate backends in probe order, honoring a `<NAME>_BACKEND` env override
 * (e.g. `REDDIT_BACKEND=rdt-cli`) that moves the named backend to the front.
 * Unknown overrides are ignored so a stale value can never hide working
 * backends. Pure.
 */
export function orderedBackends(channel: ReachChannel, env: NodeJS.ProcessEnv): string[] {
  const candidates = [...channel.backends];
  const override = env[`${channel.name.toUpperCase()}_BACKEND`];
  if (!override) return candidates;
  const i = candidates.findIndex((b) => b === override || b.startsWith(override));
  if (i > 0) candidates.unshift(candidates.splice(i, 1)[0]!);
  return candidates;
}
