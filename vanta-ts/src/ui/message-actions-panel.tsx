import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { Entry } from "./types.js";
import { writeClipboardText } from "./composer-input.js";
import { FOCUS } from "../term/palette.js";

export type MessageAction = "copy" | "retry" | "branch";

const ACTIONS: MessageAction[] = ["copy", "retry", "branch"];

function entryText(entry: Entry): string {
  if (entry.kind === "user" || entry.kind === "assistant" || entry.kind === "note" || entry.kind === "thinking") return entry.text;
  if (entry.kind === "tool") return `${entry.verb}${entry.detail ? ` ${entry.detail}` : ""} ${entry.summary ?? entry.errorLine ?? ""}`.trim();
  return entry.tools.map(entryText).join("\n");
}

function entryLabel(entry: Entry): string {
  const text = entryText(entry).replace(/\s+/g, " ").trim();
  const clip = text.length > 60 ? `${text.slice(0, 59)}…` : text;
  return `${entry.kind}: ${clip || "(empty)"}`;
}

function move(sel: number, delta: number, count: number): number {
  return Math.max(0, Math.min(Math.max(0, count - 1), sel + delta));
}

export function MessageActionsPanel(props: {
  entries: Entry[];
  onRetry: (text: string) => void;
  onBranch: () => void;
  onClose: () => void;
  onNote?: (text: string) => void;
}): ReactElement {
  const [messageSel, setMessageSel] = useState(Math.max(0, props.entries.length - 1));
  const [actionSel, setActionSel] = useState(0);
  const [mode, setMode] = useState<"message" | "action">("message");
  const selected = props.entries[messageSel];
  useInput((_input, key) => {
    if (key.escape) return mode === "action" ? setMode("message") : props.onClose();
    if (mode === "message") {
      if (key.upArrow) return setMessageSel((s) => move(s, -1, props.entries.length));
      if (key.downArrow) return setMessageSel((s) => move(s, 1, props.entries.length));
      if (key.return && selected) return setMode("action");
      return;
    }
    if (key.upArrow) return setActionSel((s) => move(s, -1, ACTIONS.length));
    if (key.downArrow) return setActionSel((s) => move(s, 1, ACTIONS.length));
    if (key.return && selected) {
      const action = ACTIONS[actionSel]!;
      const text = entryText(selected);
      if (action === "copy") props.onNote?.(writeClipboardText(text) ? "  ✓ copied message" : "  clipboard unavailable");
      if (action === "retry") selected.kind === "user" ? props.onRetry(text) : props.onNote?.("  retry is available for user messages");
      if (action === "branch") props.onBranch();
      props.onClose();
    }
  });
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold><Text color={FOCUS}>❯</Text> Message Actions</Text>
      {props.entries.length === 0 ? <Text dimColor>  (no previous messages)</Text> : null}
      {mode === "message"
        ? props.entries.map((entry, i) => <Text key={i} inverse={i === messageSel}>{i === messageSel ? "❯ " : "  "}{entryLabel(entry)}</Text>)
        : <ActionView entry={selected} sel={actionSel} />}
      <Text dimColor>  ↑/↓ select · ⏎ choose · Esc back/close</Text>
    </Box>
  );
}

function ActionView(props: { entry: Entry | undefined; sel: number }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text>{props.entry ? entryLabel(props.entry) : "(missing)"}</Text>
      {ACTIONS.map((action, i) => <Text key={action} inverse={i === props.sel}>{i === props.sel ? "❯ " : "  "}{action}</Text>)}
    </Box>
  );
}
