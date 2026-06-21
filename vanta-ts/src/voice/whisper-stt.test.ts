import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWhisperArgs, transcribeAudio, sttModel, whisperAvailable, type WhisperRunner } from "./whisper-stt.js";

const BEL = String.fromCharCode(7); // control byte, written clean

describe("buildWhisperArgs", () => {
  it("builds the whisper txt-output argv", () => {
    expect(buildWhisperArgs("/a/b.wav", { model: "tiny", outputDir: "/tmp" })).toEqual([
      "/a/b.wav", "--model", "tiny", "--language", "en", "--output_format", "txt", "--output_dir", "/tmp", "--fp16", "False",
    ]);
  });
});

describe("sttModel", () => {
  it("defaults to tiny, honors VANTA_STT_MODEL", () => {
    expect(sttModel({})).toBe("tiny");
    expect(sttModel({ VANTA_STT_MODEL: "base" } as NodeJS.ProcessEnv)).toBe("base");
  });
});

describe("transcribeAudio (injected whisper)", () => {
  const okRun: WhisperRunner = (argv) => (argv[0] === "--help" ? "ok" : "");

  it("runs whisper + reads the .txt, trimmed + control-stripped", () => {
    const res = transcribeAudio("/a/clip.wav", { run: okRun, readText: () => `  hello vanta world  ${BEL}`, outputDir: "/tmp" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.text).toBe("hello vanta world");
  });
  it("whisper absent → {ok:false}, never throws", () => {
    const absent: WhisperRunner = () => {
      throw new Error("not found");
    };
    expect(transcribeAudio("/a.wav", { run: absent }).ok).toBe(false);
  });
  it("empty transcript → {ok:false}", () => {
    expect(transcribeAudio("/a.wav", { run: okRun, readText: () => "   " }).ok).toBe(false);
  });
});

// LIVE: say → whisper → text. Opt-in (a model run is slow) — proven manually +
// here with VANTA_TEST_VOICE=1. The mocked unit tests above always run.
const LIVE = whisperAvailable() && process.env.VANTA_TEST_VOICE === "1";

describe.skipIf(!LIVE)("transcribeAudio (LIVE whisper)", () => {
  it("transcribes real say-generated speech to text", () => {
    const audio = join(tmpdir(), `vanta_stt_test_${process.pid}.aiff`);
    execFileSync("say", ["-o", audio, "hello vanta transcription works"]);
    const res = transcribeAudio(audio, { model: "tiny" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.text.toLowerCase()).toMatch(/transcription|works|hello/);
  });
});
