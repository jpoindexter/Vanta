import { createContext } from "react";
import { Text } from "ink";
import { useShortcut } from "./shortcut-display.js";
import { GLOBAL_ACTIONS } from "./keybindings.js";

export type ComposerDraft = { text: string; id: number };
export const DictationDraftContext = createContext<{ draft: ComposerDraft | null; consumed: () => void }>({ draft: null, consumed: () => {} });
export type VoicePhase = "idle" | "checking" | "recording" | "transcribing";

export function DictationIndicator({ phase }: { phase: VoicePhase }) {
  const shortcut = useShortcut()(GLOBAL_ACTIONS.dictation, "global", "Ctrl+R");
  if (phase === "idle") return <Text dimColor>Voice: /voice · {shortcut} dictate 5s · text stays a draft</Text>;
  const label = { checking: "Checking local dictation", recording: "Recording locally", transcribing: "Transcribing locally" }[phase];
  return <Text>{label}… · Esc / {shortcut} cancel · nothing sent</Text>;
}
