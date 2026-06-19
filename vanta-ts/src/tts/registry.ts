// TTS provider registry — the catalog the `vanta setup tts` wizard and the
// speak path read to know which voice backends exist, what each needs, and
// whether it's configured. Mirrors gateway/platforms/registry.ts and
// providers/catalog.ts. Adding a backend = one entry here + a synth adapter in
// tts/synth.ts; nothing central to edit.
//
// `keyless` is the honesty flag for availability: edge + local need no API key,
// so they're always "available"; openai/elevenlabs are available only once their
// key env is set.

export type TtsProvider = {
  /** VANTA_TTS_PROVIDER value (stable id, matches the synth adapter). */
  id: string;
  label: string;
  /** API-key env var, or undefined for keyless backends (edge, local). */
  envVar?: string;
  /** Voice id written as VANTA_TTS_VOICE if the user accepts the default. */
  defaultVoice?: string;
  /** True when the backend needs no API key (always available). */
  keyless?: boolean;
  /** Where to get a key / the tool (shown in the wizard). */
  signupUrl?: string;
  /** Runtime/OS prerequisite satisfied outside Vanta (e.g. a pip install). */
  prerequisite?: string;
  /** Ordered human setup steps. */
  setupSteps: string[];
};

export const TTS_CATALOG: TtsProvider[] = [
  {
    id: "edge",
    label: "Edge — Microsoft neural voices, keyless [default]",
    defaultVoice: "en-US-AriaNeural",
    keyless: true,
    prerequisite: "edge-tts on PATH (pip install edge-tts).",
    signupUrl: "https://github.com/rany2/edge-tts",
    setupSteps: [
      "Install the edge-tts CLI: pip install edge-tts.",
      "Optionally set VANTA_TTS_VOICE to a voice id (default en-US-AriaNeural; `edge-tts --list-voices` lists them).",
      "No API key needed — Edge neural voices are free.",
    ],
  },
  {
    id: "openai",
    label: "OpenAI — gpt-4o-mini-tts via API key",
    envVar: "OPENAI_API_KEY",
    defaultVoice: "alloy",
    signupUrl: "https://platform.openai.com/api-keys",
    setupSteps: [
      "Get an API key from platform.openai.com/api-keys.",
      "Paste it here (stored 0600 in vanta-ts/.env).",
      "Optionally set VANTA_TTS_VOICE (alloy, echo, fable, onyx, nova, shimmer).",
    ],
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs — high-fidelity voices via API key",
    envVar: "ELEVENLABS_API_KEY",
    defaultVoice: "21m00Tcm4TlvDq8ikWAM",
    signupUrl: "https://elevenlabs.io/app/settings/api-keys",
    setupSteps: [
      "Get an API key from elevenlabs.io (Settings → API Keys).",
      "Paste it here (stored 0600 in vanta-ts/.env).",
      "Set VANTA_TTS_VOICE to a voice id from your ElevenLabs voice library (default is the 'Rachel' voice).",
    ],
  },
  {
    id: "local",
    label: "Local — macOS `say` (offline, no key)",
    defaultVoice: "Samantha",
    keyless: true,
    prerequisite: "macOS (the built-in `say` command).",
    setupSteps: [
      "No setup needed on macOS — uses the built-in `say` command.",
      "Optionally set VANTA_TTS_VOICE to a system voice (e.g. Samantha; `say -v '?'` lists them).",
    ],
  },
];

export function ttsProviderById(id: string): TtsProvider | undefined {
  return TTS_CATALOG.find((p) => p.id === id);
}

export type TtsAvailability = { configured: boolean; missing: string[] };

/**
 * Whether a TTS provider is usable from the current env. Keyless backends (edge,
 * local) are always configured; key-based ones need their `envVar` set. Pure.
 */
export function ttsAvailability(
  provider: TtsProvider,
  env: NodeJS.ProcessEnv,
): TtsAvailability {
  if (provider.keyless || !provider.envVar) return { configured: true, missing: [] };
  const present = !!env[provider.envVar] && !!env[provider.envVar]!.trim();
  return { configured: present, missing: present ? [] : [provider.envVar] };
}
