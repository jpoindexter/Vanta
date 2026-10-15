import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceSession, type VoiceDeps } from "./voice-session.js";
import { VOICE_MAX_BYTES, VOICE_MAX_MS } from "./voice-media.js";
import { deferred, FakeVoiceRecorder } from "./voice-test-fixtures.js";

function setup() {
  const stopped = vi.fn();
  const stream = { getTracks: () => [{ stop: stopped }] } as unknown as MediaStream;
  const recorder = new FakeVoiceRecorder();
  const deps: VoiceDeps = { readiness: vi.fn().mockResolvedValue({ ready: true, provider: "local-whisper", model: "tiny" }),
    capture: vi.fn().mockResolvedValue(stream), recorder: () => recorder as unknown as MediaRecorder,
    transcribe: vi.fn().mockResolvedValue({ text: "A thought", provider: "local-whisper", model: "tiny" }) };
  const changed = vi.fn(), transcript = vi.fn();
  return { session: new VoiceSession(changed, transcript, deps), deps, recorder, stopped, stream, changed, transcript };
}
afterEach(() => vi.useRealTimers());

describe("dictation capture lifecycle", () => {
  it("never captures before start, releases tracks on stop, and returns text only", async () => {
    const f = setup();
    expect(f.deps.capture).not.toHaveBeenCalled();
    await f.session.start(); f.recorder.chunk(); f.session.stop();
    expect(f.stopped).toHaveBeenCalled();
    await Promise.resolve();
    expect(f.transcript).toHaveBeenCalledWith("A thought");
    expect(f.session.busy).toBe(false);
  });
  it("shows setup recovery without opening the microphone when the engine is unready", async () => {
    const f = setup();
    vi.mocked(f.deps.readiness).mockResolvedValue({ ready: false, provider: "local-whisper", model: "tiny", reason: "Install local Whisper and download the tiny model." });
    await f.session.start();
    expect(f.deps.capture).not.toHaveBeenCalled();
    expect(f.changed).toHaveBeenLastCalledWith({ phase: "error", message: "Install local Whisper and download the tiny model." });
  });
  it("discards delayed permission and immediately releases its tracks after cancel", async () => {
    const f = setup(), permission = deferred<MediaStream>();
    vi.mocked(f.deps.capture).mockReturnValue(permission.promise);
    const pending = f.session.start(); await Promise.resolve();
    f.session.cancel(); permission.resolve(f.stream); await pending;
    expect(f.stopped).toHaveBeenCalled(); expect(f.recorder.state).toBe("inactive");
    expect(f.deps.transcribe).not.toHaveBeenCalled();
  });
  it("aborts transcription and discards a response even if the transport ignores abort", async () => {
    const f = setup(), response = deferred<{ text: string; provider: "local-whisper"; model: string }>();
    vi.mocked(f.deps.transcribe).mockReturnValue(response.promise);
    await f.session.start(); f.recorder.chunk(); f.session.stop(); f.session.cancel();
    expect(vi.mocked(f.deps.transcribe).mock.calls[0][1].aborted).toBe(true);
    response.resolve({ text: "late", provider: "local-whisper", model: "tiny" }); await Promise.resolve();
    expect(f.transcript).not.toHaveBeenCalled();
  });
  it("stops after 30 seconds without leaving a live track", async () => {
    vi.useFakeTimers(); const f = setup(); await f.session.start(); f.recorder.chunk();
    await vi.advanceTimersByTimeAsync(VOICE_MAX_MS);
    expect(f.stopped).toHaveBeenCalled(); expect(f.transcript).toHaveBeenCalledOnce();
  });
  it("discards over-limit audio rather than uploading it", async () => {
    const f = setup(); await f.session.start(); f.recorder.chunk(VOICE_MAX_BYTES + 1);
    expect(f.stopped).toHaveBeenCalled(); expect(f.deps.transcribe).not.toHaveBeenCalled();
    expect(f.changed).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "error" }));
  });
  it("releases on recorder failure and empty audio", async () => {
    const f = setup(); await f.session.start(); f.recorder.onerror?.();
    expect(f.stopped).toHaveBeenCalled(); expect(f.session.busy).toBe(false);
    await f.session.start(); f.session.stop(); await Promise.resolve();
    expect(f.changed).toHaveBeenLastCalledWith(expect.objectContaining({ message: "No audio was captured. Check your microphone and try again." }));
  });
});
