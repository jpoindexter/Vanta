export const COMPLETION_SOUND_IDS = ["soft", "bright", "resonant"] as const;

export type CompletionSoundId = (typeof COMPLETION_SOUND_IDS)[number];
export type CompletionSoundSettings = { enabled: boolean; sound: CompletionSoundId };

export const DEFAULT_COMPLETION_SOUND: CompletionSoundSettings = {
  enabled: true,
  sound: "soft",
};

export const COMPLETION_SOUND_LABELS: Record<CompletionSoundId, string> = {
  soft: "Soft",
  bright: "Bright",
  resonant: "Resonant",
};

const STORAGE_KEY = "vanta.desktop.completion-sound.v1";

type StoragePort = Pick<Storage, "getItem" | "setItem">;
type Note = { at: number; frequency: number; duration: number; gain: number; wave: OscillatorType };

const CHIMES: Record<CompletionSoundId, readonly Note[]> = {
  soft: [
    { at: 0, frequency: 523.25, duration: 0.22, gain: 0.055, wave: "sine" },
    { at: 0.12, frequency: 659.25, duration: 0.28, gain: 0.045, wave: "sine" },
  ],
  bright: [
    { at: 0, frequency: 659.25, duration: 0.14, gain: 0.04, wave: "triangle" },
    { at: 0.09, frequency: 783.99, duration: 0.16, gain: 0.035, wave: "triangle" },
    { at: 0.18, frequency: 1046.5, duration: 0.22, gain: 0.03, wave: "triangle" },
  ],
  resonant: [
    { at: 0, frequency: 392, duration: 0.34, gain: 0.045, wave: "sine" },
    { at: 0.08, frequency: 587.33, duration: 0.4, gain: 0.038, wave: "sine" },
    { at: 0.16, frequency: 783.99, duration: 0.46, gain: 0.03, wave: "sine" },
  ],
};

export function loadCompletionSoundSettings(storage: StoragePort): CompletionSoundSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COMPLETION_SOUND;
    const parsed = JSON.parse(raw) as { enabled?: unknown; sound?: unknown };
    if (typeof parsed.enabled !== "boolean" || !isCompletionSoundId(parsed.sound)) return DEFAULT_COMPLETION_SOUND;
    return { enabled: parsed.enabled, sound: parsed.sound };
  } catch {
    return DEFAULT_COMPLETION_SOUND;
  }
}

export function saveCompletionSoundSettings(storage: StoragePort, settings: CompletionSoundSettings): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Browser storage can be disabled; the in-memory setting still works.
  }
}

export function createCompletionSoundPlayer(createContext: (() => AudioContext) | undefined) {
  let context: AudioContext | null = null;

  function ensureContext(): AudioContext | null {
    if (!createContext) return null;
    context ??= createContext();
    return context;
  }

  function prime(): void {
    const current = ensureContext();
    if (current?.state === "suspended") void current.resume().catch(() => undefined);
  }

  async function play(settings: CompletionSoundSettings): Promise<boolean> {
    if (!settings.enabled) return false;
    const current = ensureContext();
    if (!current) return false;
    try {
      if (current.state === "suspended") await current.resume();
      scheduleChime(current, settings.sound);
      return true;
    } catch {
      return false;
    }
  }

  async function dispose(): Promise<void> {
    const current = context;
    context = null;
    if (current) await current.close().catch(() => undefined);
  }

  return { prime, play, dispose };
}

export type CompletionSoundPlayer = ReturnType<typeof createCompletionSoundPlayer>;

function scheduleChime(context: AudioContext, sound: CompletionSoundId): void {
  const start = context.currentTime + 0.01;
  for (const note of CHIMES[sound]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + note.at;
    const noteEnd = noteStart + note.duration;
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  }
}

function isCompletionSoundId(value: unknown): value is CompletionSoundId {
  return typeof value === "string" && COMPLETION_SOUND_IDS.includes(value as CompletionSoundId);
}
