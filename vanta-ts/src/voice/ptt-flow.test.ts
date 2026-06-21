import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPttCapture } from "./ptt-flow.js";
import { whisperAvailable } from "./whisper-stt.js";

describe("runPttCapture (injected capture + transcribe)", () => {
  it("happy path: record → transcribe → done with the transcript", () => {
    const res = runPttCapture({
      capture: () => ({ ok: true, path: "/x.wav" }),
      transcribe: () => ({ ok: true, text: "hello world" }),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transcript).toBe("hello world");
    expect(res.state.phase).toBe("done");
  });

  it("capture failure → error state, never throws", () => {
    const res = runPttCapture({ capture: () => ({ ok: false, error: "no mic" }) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.state.phase).toBe("error");
  });

  it("transcribe failure → error state", () => {
    const res = runPttCapture({
      capture: () => ({ ok: true, path: "/x.wav" }),
      transcribe: () => ({ ok: false, error: "stt failed" }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.state.phase).toBe("error");
  });
});

// LIVE: full flow end-to-end with say-generated audio standing in for the live
// mic recording (the one part needing a real mic + speaker). Opt-in.
const LIVE = whisperAvailable() && process.env.VANTA_TEST_VOICE === "1";

describe.skipIf(!LIVE)("runPttCapture (LIVE say→whisper flow)", () => {
  it("captures (say audio) → transcribes → text, end to end", () => {
    const audio = join(tmpdir(), `vanta_ptt_test_${process.pid}.aiff`);
    execFileSync("say", ["-o", audio, "push to talk capture works"]);
    const res = runPttCapture({ capture: () => ({ ok: true, path: audio }), sttDeps: { model: "tiny" } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.transcript.toLowerCase()).toMatch(/talk|capture|works|push/);
  });
});
