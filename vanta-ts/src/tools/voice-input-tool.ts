// VANTA-VOICE-STT — the trigger surface: a kernel-gated tool that invokes the
// proven push-to-talk flow (voice/ptt-flow.ts: record mic → whisper → text).
// This makes the verified audio→text→flow actually callable; the composer PTT
// key (hold-to-talk) is the remaining cosmetic host wire on top of the same
// runPttCapture. The mic recording needs a real microphone + speech — the one
// part not headlessly verifiable; the transcribe + flow are proven by the
// say→whisper integration tests.

import type { Tool } from "./types.js";
import { runPttCapture, type PttFlowResult } from "../voice/ptt-flow.js";

/** Shape the PTT flow outcome into a tool result. Pure — unit-tested. */
export function formatVoiceResult(r: PttFlowResult): { ok: boolean; output: string } {
  if (!r.ok) return { ok: false, output: `voice input failed: ${r.error}` };
  if (r.transcript.trim().length === 0) return { ok: false, output: "voice input produced no speech" };
  return { ok: true, output: r.transcript };
}

export const voiceInputTool: Tool = {
  schema: {
    name: "voice_input",
    description:
      "Record a short push-to-talk voice clip from the microphone and transcribe it to text (local whisper). No args — records, transcribes, returns the transcript.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  describeForSafety: () => "record + transcribe microphone voice input",
  async execute() {
    return formatVoiceResult(runPttCapture());
  },
};
