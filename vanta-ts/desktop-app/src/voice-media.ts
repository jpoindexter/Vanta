import { api } from "./api.js";

export const VOICE_MAX_BYTES = 4 * 1024 * 1024;
export const VOICE_MAX_MS = 30_000;
export type VoiceReadiness = { ready: boolean; provider: "local-whisper"; model: string; reason?: string };
export type VoiceTranscript = { text: string; provider: "local-whisper"; model: string };

export function releaseVoiceTracks(stream?: MediaStream): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function voiceRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("Audio recording is unavailable in this desktop version. Update Vanta or type your message.");
  return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
}

export async function voiceTranscribe(blob: Blob, signal: AbortSignal): Promise<VoiceTranscript> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  signal.throwIfAborted();
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return api<VoiceTranscript>("/api/voice/transcribe", { method: "POST", signal,
    headers: { "content-type": "application/json" }, body: JSON.stringify({ audioBase64: btoa(binary), mimeType: blob.type }) });
}

export function voiceError(error: unknown): string {
  if (error instanceof Error && error.name === "NotAllowedError") return "Microphone access was denied. Allow Vanta in System Settings → Privacy & Security → Microphone, then try again.";
  if (error instanceof Error && error.name === "NotFoundError") return "No microphone was found. Connect a microphone, then try again.";
  return error instanceof Error ? error.message : "Dictation could not finish. Your draft is unchanged; try again or type your message.";
}

export function appendVoiceText(draft: string, text: string): string {
  return `${draft}${draft && !/\s$/.test(draft) ? " " : ""}${text.trim()}`;
}
