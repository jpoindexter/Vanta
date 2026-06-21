import { describe, it, expect } from "vitest";
import { buildFfmpegMicArgs, captureMicAudio, type FfmpegRunner } from "./mic-capture.js";

describe("buildFfmpegMicArgs", () => {
  it("builds an avfoundation mono-16k record argv", () => {
    expect(buildFfmpegMicArgs("/tmp/x.wav", 5)).toEqual([
      "-f", "avfoundation", "-i", ":0", "-t", "5", "-ac", "1", "-ar", "16000", "-y", "/tmp/x.wav",
    ]);
  });
  it("clamps an invalid/huge duration", () => {
    expect(buildFfmpegMicArgs("/x.wav", 0)).toContain("10"); // invalid → default 10
    expect(buildFfmpegMicArgs("/x.wav", 9999)[5]).toBe("120"); // clamp to 120
  });
});

describe("captureMicAudio (injected ffmpeg)", () => {
  it("records → the file path", () => {
    const run: FfmpegRunner = (argv) => (argv[0] === "-version" ? "ffmpeg" : "");
    expect(captureMicAudio({ run, outputPath: "/tmp/r.wav" })).toEqual({ ok: true, path: "/tmp/r.wav" });
  });
  it("ffmpeg absent → {ok:false}, never throws", () => {
    const absent: FfmpegRunner = () => {
      throw new Error("no ffmpeg");
    };
    expect(captureMicAudio({ run: absent }).ok).toBe(false);
  });
});
