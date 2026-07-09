import { describe, expect, it, vi } from "vitest";
import {
  COMPLETION_SOUND_IDS,
  DEFAULT_COMPLETION_SOUND,
  createCompletionSoundPlayer,
  loadCompletionSoundSettings,
  saveCompletionSoundSettings,
} from "./completion-sound.js";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
  };
}

function fakeAudioContext() {
  const oscillators: Array<{ frequency: number; started: number; stopped: number }> = [];
  const resume = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  class FakeAudioContext {
    currentTime = 4;
    destination = {};
    state = "suspended";
    resume = resume;
    close = close;
    createOscillator() {
      const record = { frequency: 0, started: 0, stopped: 0 };
      oscillators.push(record);
      return {
        type: "sine" as OscillatorType,
        frequency: { setValueAtTime: (value: number) => { record.frequency = value; }, exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: (time: number) => { record.started = time; },
        stop: (time: number) => { record.stopped = time; },
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
    }
  }
  return { FakeAudioContext, oscillators, resume, close };
}

describe("completion sound settings", () => {
  it("persists and restores the selected muted state", () => {
    const storage = memoryStorage();
    saveCompletionSoundSettings(storage, { enabled: false, sound: "bright" });
    expect(loadCompletionSoundSettings(storage)).toEqual({ enabled: false, sound: "bright" });
  });

  it("falls back safely for malformed storage", () => {
    expect(loadCompletionSoundSettings(memoryStorage("not-json"))).toEqual(DEFAULT_COMPLETION_SOUND);
    expect(loadCompletionSoundSettings(memoryStorage('{"enabled":true,"sound":"unknown"}'))).toEqual(DEFAULT_COMPLETION_SOUND);
  });

  it("does not break the control when browser storage is unavailable", () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(() => { throw new Error("quota"); }) };
    expect(() => saveCompletionSoundSettings(storage, { enabled: false, sound: "soft" })).not.toThrow();
  });
});

describe("completion sound player", () => {
  it.each([
    [COMPLETION_SOUND_IDS[0], 2],
    [COMPLETION_SOUND_IDS[1], 3],
    [COMPLETION_SOUND_IDS[2], 3],
  ] as const)("synthesizes the %s cue without audio assets", async (sound, noteCount) => {
    const audio = fakeAudioContext();
    const player = createCompletionSoundPlayer(() => new audio.FakeAudioContext() as unknown as AudioContext);
    expect(await player.play({ enabled: true, sound })).toBe(true);
    expect(audio.resume).toHaveBeenCalledOnce();
    expect(audio.oscillators).toHaveLength(noteCount);
    expect(audio.oscillators.every((note) => note.frequency > 0 && note.stopped > note.started)).toBe(true);
  });

  it("does not create or schedule audio while muted", async () => {
    const audio = fakeAudioContext();
    const player = createCompletionSoundPlayer(() => new audio.FakeAudioContext() as unknown as AudioContext);
    expect(await player.play({ enabled: false, sound: "soft" })).toBe(false);
    expect(audio.resume).not.toHaveBeenCalled();
    expect(audio.oscillators).toEqual([]);
  });
});
