import {
  startRecording,
  stopRecording,
  isRecording,
  recordingPath,
} from "../recording/session-recorder.js";
import type { SlashHandler } from "./types.js";

// VANTA-ASCIICAST — `/record [start|stop]` toggles asciicast v2 session
// recording. Bare shows status; `start` opens a new `.cast` under
// ~/.vanta/recordings/; `stop` seals the current one. Off = no terminal-output
// tee, so non-recording sessions are byte-identical.
export const record: SlashHandler = (arg, ctx) => {
  const verb = arg.trim().toLowerCase();

  if (verb === "stop") {
    const path = stopRecording();
    return { output: path ? `  ⏹ recording saved → ${path}` : "  (not recording)" };
  }

  if (verb === "start" || verb === "") {
    if (isRecording()) {
      return { output: `  ⏺ already recording → ${recordingPath()} (/record stop to seal)` };
    }
    if (verb === "") {
      return { output: "  (not recording — /record start to begin, /record stop to seal)" };
    }
    const res = startRecording(ctx.env, () => ctx.now().getTime());
    return {
      output: res.ok
        ? `  ⏺ recording → ${res.path} (/record stop to seal)`
        : `  ✗ could not start recording: ${res.error}`,
    };
  }

  return { output: "  usage: /record [start|stop]" };
};
