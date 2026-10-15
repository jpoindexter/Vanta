import { TTS_CATALOG, ttsAvailability, ttsProviderById, type TtsProvider } from "../tts/registry.js";

// Text-to-speech is an AUXILIARY output channel, resolved the same way vision is
// (routing/vision.ts): the speak path asks this resolver which backend to use
// rather than hard-coding `say`. Default is edge (keyless neural voices) so a
// spoken reply works with zero config; a key-based backend is used only when the
// operator picked it AND its key is present, so a missing key degrades to a clear
// message instead of a live call that fails mid-synthesis.

/** The default TTS provider when VANTA_TTS_PROVIDER is unset. Keyless. */
export const DEFAULT_TTS_PROVIDER = "edge";

export type ResolvedTts = {
  provider: TtsProvider;
  /** The voice to speak with: VANTA_TTS_VOICE, else the provider's default. */
  voice?: string;
  /** True when the provider needs no key, or its key env is set. */
  ready: boolean;
  /** Env var that must be set for `ready` (when a key-based provider lacks one). */
  missingKey?: string;
};

export type StreamingTtsConfig = {
  enabled: boolean;
  tts: ResolvedTts;
  minClauseChars: number;
  maxClauseChars: number;
  maxClauses: number;
};

function enabled(value: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

function boundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.floor(parsed)))
    : fallback;
}

/**
 * Resolve the TTS backend the speak path should use. Pure — reads env, never
 * mutates it, never makes a network/CLI call.
 *   VANTA_TTS_PROVIDER unset / unknown → edge (keyless default).
 *   VANTA_TTS_VOICE set                → overrides the provider's default voice.
 *   key-based provider without its key → `ready:false` + `missingKey`, so the
 *                                        caller reports a fix instead of failing live.
 */
export function resolveTtsProvider(env: NodeJS.ProcessEnv): ResolvedTts {
  const requested = env.VANTA_TTS_PROVIDER?.trim();
  const provider =
    (requested && ttsProviderById(requested)) ||
    ttsProviderById(DEFAULT_TTS_PROVIDER) ||
    TTS_CATALOG[0]!;
  const { configured, missing } = ttsAvailability(provider, env);
  const voice = env.VANTA_TTS_VOICE?.trim() || provider.defaultVoice;
  return { provider, voice, ready: configured, missingKey: missing[0] };
}

/**
 * Resolve the opt-in first-clause speech path. A dedicated streaming provider
 * and voice may override the normal spoken-reply backend without changing it.
 */
export function resolveStreamingTtsConfig(env: NodeJS.ProcessEnv): StreamingTtsConfig {
  const minClauseChars = boundedInt(env.VANTA_TTS_STREAM_MIN_CHARS, 24, 1, 500);
  const maxClauseChars = boundedInt(
    env.VANTA_TTS_STREAM_MAX_CHARS,
    240,
    minClauseChars,
    2_000,
  );
  const tts = resolveTtsProvider({
    ...env,
    VANTA_TTS_PROVIDER:
      env.VANTA_TTS_STREAMING_PROVIDER?.trim() || env.VANTA_TTS_PROVIDER,
    VANTA_TTS_VOICE:
      env.VANTA_TTS_STREAMING_VOICE?.trim() || env.VANTA_TTS_VOICE,
  });
  return {
    enabled: enabled(env.VANTA_TTS_STREAMING),
    tts,
    minClauseChars,
    maxClauseChars,
    maxClauses: boundedInt(env.VANTA_TTS_STREAM_MAX_CLAUSES, 24, 1, 100),
  };
}
