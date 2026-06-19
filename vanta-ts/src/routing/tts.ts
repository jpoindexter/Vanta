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
