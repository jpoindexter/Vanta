import { detectRecorder } from "./recorder.js";
import { whisperAvailable } from "./whisper-stt.js";

/** Fail before enabling a listener that cannot capture or detect locally. */
export async function assertWakeReady(): Promise<void> {
  if (!(await detectRecorder())) throw new Error("Wake word needs ffmpeg or sox (brew install ffmpeg)");
  if (!whisperAvailable()) throw new Error("Wake word needs local Whisper (pip install -U openai-whisper)");
}
