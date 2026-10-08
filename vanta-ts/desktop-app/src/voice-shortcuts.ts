import { useEffect } from "react";
import type { VoiceDictation } from "./voice-dictation.js";

export function useVoiceShortcuts(voice: VoiceDictation): void {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const action = shortcutAction(event, voice.isBusy());
      if (!action) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (action === "cancel") voice.cancel();
      else if (voice.phase === "recording") voice.stop();
      else if (!voice.isBusy()) voice.start();
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [voice]);
}

function shortcutAction(event: KeyboardEvent, busy: boolean): "toggle" | "cancel" | undefined {
  if (event.defaultPrevented || event.repeat || event.isComposing || blockedTarget(event.target)) return;
  if (event.key === "Escape" && busy) return "cancel";
  if (dictationChord(event)) return "toggle";
  return undefined;
}

function dictationChord(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.code === "KeyD";
}

function blockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[role=dialog], dialog")) return true;
  const typing = target.closest("input, textarea, [contenteditable=true]");
  return Boolean(typing && !typing.closest(".composer"));
}
