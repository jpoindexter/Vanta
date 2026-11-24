import { Mic, Square, X } from "lucide-react";
import type { VoiceDictation } from "./voice-dictation.js";
import "./voice.css";

export function VoiceButton({ voice, ready, sessionId }: { voice: VoiceDictation; ready: boolean; sessionId?: string }) {
  const disabled = !sessionId || (!ready && !voice.busy);
  const recording = voice.phase === "recording";
  return <button className="composer-context-button voice-button" type="button" disabled={disabled || (voice.busy && !recording)}
    data-recording={recording} title={recording ? "Stop recording and transcribe · ⌘/Ctrl Shift D · Esc cancels" : "Dictate a message · ⌘/Ctrl Shift D · local transcription"}
    aria-keyshortcuts="Meta+Shift+D Control+Shift+D"
    aria-label={recording ? "Stop recording and transcribe" : "Dictate a message"} aria-pressed={recording}
    onClick={recording ? voice.stop : voice.start}>
    {recording ? <Square size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
  </button>;
}

export function VoiceStatus({ voice }: { voice: VoiceDictation }) {
  if (!voice.message) return null;
  return <div className="voice-status" data-phase={voice.phase}>
    <span role={voice.phase === "error" ? "alert" : "status"} aria-live="polite">{voice.message}</span>
    {voice.busy ? <button type="button" onClick={voice.cancel} aria-label="Cancel dictation"><X size={13} aria-hidden="true" />Cancel</button> : null}
  </div>;
}
