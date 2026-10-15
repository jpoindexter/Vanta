import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLocalDictationStatus, transcribeLocalAudio, runLocalDictationProcess, type LocalDictationDeps } from "./local-dictation.js";
import { decodeDictationAudio, MAX_DICTATION_BYTES, validateDictationAudio } from "./local-dictation-input.js";

function pcmWav(sample = 1): Buffer {
  const wav = Buffer.alloc(44 + 32_000);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24); wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
  wav.writeUInt32LE(32_000, 40); wav.writeInt16LE(sample, 44);
  return wav;
}
const wav = pcmWav();
let root: string;
let deps: LocalDictationDeps;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-dictation-test-"));
  await mkdir(join(root, ".cache", "whisper"), { recursive: true });
  await writeFile(join(root, ".cache", "whisper", "tiny.pt"), "fixture");
  for (const name of ["whisper", "ffmpeg"]) {
    await writeFile(join(root, name), "fixture");
    await chmod(join(root, name), 0o700);
  }
  deps = { home: root, tempRoot: root, env: { PATH: root } };
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("local dictation validation and readiness", () => {
  it("reports only installed models and refuses path or URL model overrides", async () => {
    await expect(getLocalDictationStatus(deps)).resolves.toEqual({ ready: true, provider: "local-whisper", model: "tiny" });
    await expect(getLocalDictationStatus({ ...deps, env: { PATH: root, VANTA_STT_MODEL: "base" } })).resolves.toMatchObject({ ready: false, model: "base" });
    const status = await getLocalDictationStatus({ ...deps, env: { PATH: root, VANTA_STT_MODEL: "https://secret.example/model" } });
    expect(status.ready).toBe(false);
    expect(JSON.stringify(status)).not.toContain("secret.example");
  });
  it("checks canonical base64, size, MIME and actual audio signature", () => {
    expect(decodeDictationAudio(wav.toString("base64"))).toEqual(wav);
    expect(validateDictationAudio(wav, "audio/wav").extension).toBe("wav");
    expect(() => decodeDictationAudio("AA!!")).toThrow("base64");
    expect(() => validateDictationAudio(wav, "text/plain")).toThrow("invalid audio");
    expect(() => validateDictationAudio(Buffer.from("https://example.com/audio"), "audio/wav")).toThrow("invalid audio");
    expect(() => validateDictationAudio(Buffer.alloc(MAX_DICTATION_BYTES + 1), "audio/wav")).toThrow("4 MiB");
  });
});

describe("local transcription lifecycle", () => {
  it("runs asynchronously with the absolute cached model and removes audio/transcript", async () => {
    const calls: string[][] = [];
    deps.run = async (_command, args, options) => {
      calls.push(args);
      expect(options.env).not.toHaveProperty("OPENAI_API_KEY");
      if (args.includes("--model")) {
        expect(args[args.indexOf("--model") + 1]).toBe(join(root, ".cache", "whisper", "tiny.pt"));
        await writeFile(join(args[args.indexOf("--output_dir") + 1]!, "audio.txt"), " Hello\u001b world ");
      } else await writeFile(args.at(-1)!, wav);
    };
    await expect(transcribeLocalAudio({ audio: wav, mimeType: "audio/wav" }, deps)).resolves.toEqual({ text: "Hello world", provider: "local-whisper", model: "tiny" });
    expect(calls).toHaveLength(2);
    expect((await readdir(root)).filter((n) => n.startsWith("vanta-dictation-"))).toEqual([]);
  });
  it("redacts failures and cleans temporary files", async () => {
    deps.run = async () => { throw new Error("secret /private/audio customer transcript"); };
    await expect(transcribeLocalAudio({ audio: wav, mimeType: "audio/wav" }, deps)).rejects.toThrow("Local transcription failed. Try another recording.");
    expect((await readdir(root)).filter((n) => n.startsWith("vanta-dictation-"))).toEqual([]);
  });
  it("rejects digital silence before invoking Whisper and removes the recording", async () => {
    const calls: string[][] = [];
    deps.run = async (_command, args) => { calls.push(args); await writeFile(args.at(-1)!, pcmWav(0)); };
    await expect(transcribeLocalAudio({ audio: pcmWav(0), mimeType: "audio/wav" }, deps)).rejects.toMatchObject({ statusCode: 422, publicMessage: "No speech was detected. Check your microphone and try again." });
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("--model");
    expect((await readdir(root)).filter((n) => n.startsWith("vanta-dictation-"))).toEqual([]);
  });
  it.skipIf(!existsSync("/opt/homebrew/bin/ffmpeg"))("rejects a real ffmpeg-normalized silent WAV without running Whisper", async () => {
    let whisperCalls = 0;
    deps.run = async (_command, args, options) => {
      if (args.includes("--model")) { whisperCalls++; throw new Error("Whisper must not run for silence"); }
      await runLocalDictationProcess("/opt/homebrew/bin/ffmpeg", args, options);
    };
    await expect(transcribeLocalAudio({ audio: pcmWav(0), mimeType: "audio/wav" }, deps)).rejects.toMatchObject({ statusCode: 422, publicMessage: "No speech was detected. Check your microphone and try again." });
    expect(whisperCalls).toBe(0);
  });
  it("rejects overlong recordings before Whisper runs", async () => {
    let calls = 0;
    deps.run = async (_command, args) => { calls++; await writeFile(args.at(-1)!, Buffer.alloc(61 * 32_000)); };
    await expect(transcribeLocalAudio({ audio: wav, mimeType: "audio/wav" }, deps)).rejects.toMatchObject({ statusCode: 413 });
    expect(calls).toBe(1);
    expect((await readdir(root)).filter((n) => n.startsWith("vanta-dictation-"))).toEqual([]);
  });
  it("returns a recoverable empty-speech error", async () => {
    deps.run = async (_command, args) => {
      if (args.includes("--model")) await writeFile(join(args[args.indexOf("--output_dir") + 1]!, "audio.txt"), " \n");
      else await writeFile(args.at(-1)!, wav);
    };
    await expect(transcribeLocalAudio({ audio: wav, mimeType: "audio/wav" }, deps)).rejects.toMatchObject({ statusCode: 422, publicMessage: "No speech was detected. Try again." });
  });
  it("cancels before spawning and rejects parallel work", async () => {
    const cancelled = AbortSignal.abort();
    await expect(transcribeLocalAudio({ audio: wav, mimeType: "audio/wav", signal: cancelled }, deps)).rejects.toMatchObject({ statusCode: 499 });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const running = new Promise<void>((resolve) => { entered = resolve; });
    deps.run = async () => { entered(); await held; throw new Error("stopped"); };
    const first = transcribeLocalAudio({ audio: wav, mimeType: "audio/wav" }, deps);
    await running;
    await expect(transcribeLocalAudio({ audio: wav, mimeType: "audio/wav" }, deps)).rejects.toMatchObject({ statusCode: 409 });
    release();
    await expect(first).rejects.toThrow("Local transcription failed");
  });
  it("kills a real async child on cancellation without blocking the event loop", async () => {
    const controller = new AbortController();
    const promise = runLocalDictationProcess(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { signal: controller.signal, env: {} });
    setTimeout(() => controller.abort(), 20);
    await expect(promise).rejects.toMatchObject({ statusCode: 499 });
  });
});
