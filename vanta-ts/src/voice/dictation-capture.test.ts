import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { captureDictation } from "./dictation-capture.js";
import type { transcribeLocalAudio } from "./local-dictation.js";

const status = async () => ({ ready: true, provider: "local-whisper" as const, model: "tiny" });

describe("dictation capture", () => {
  it("checks local readiness before accessing the microphone", async () => {
    const record = vi.fn();
    await expect(captureDictation({ seconds: 5 }, { record, status: async () => ({ ...await status(), ready: false, reason: "Model missing" }) })).rejects.toThrow("Model missing");
    expect(record).not.toHaveBeenCalled();
  });
  it("passes captured bytes to the shared local backend and deletes audio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-capture-test-"));
    const path = join(dir, "audio.wav");
    await writeFile(path, "fixture audio");
    const cleanup = vi.fn(() => rm(dir, { recursive: true, force: true }));
    const transcribe = vi.fn<typeof transcribeLocalAudio>(async () => ({ text: "Draft", provider: "local-whisper" as const, model: "tiny" }));
    try {
      expect(await captureDictation({ seconds: 5 }, { status, record: async () => ({ path, cleanup }), transcribe })).toBe("Draft");
      expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ mimeType: "audio/wav" });
      expect(cleanup).toHaveBeenCalledOnce();
      await expect(readFile(path)).rejects.toThrow();
    } finally { await cleanup(); }
  });
  it("cleans up after transcription failure and never exposes a partial draft", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-capture-test-"));
    const path = join(dir, "audio.wav");
    await writeFile(path, "fixture audio");
    const cleanup = vi.fn(() => rm(dir, { recursive: true, force: true }));
    await expect(captureDictation({ seconds: 5 }, { status, record: async () => ({ path, cleanup }), transcribe: async () => { throw new Error("failed"); } })).rejects.toThrow("failed");
    expect(cleanup).toHaveBeenCalledOnce();
    await expect(readFile(path)).rejects.toThrow();
  });
});
