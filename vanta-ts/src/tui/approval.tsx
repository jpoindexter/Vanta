import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { Overlay, OverlayRow } from "./overlay.js";

// The HITL approval prompt — the kernel's ASK verdict made visible. Shows the
// gated action on its own line and the kernel's reason as "why", then the
// choices. once/deny are always available; session + always-allow only when the
// gated action carries a tool name to key on (kernel-gated tool calls do; some
// tool-internal confirmations don't). ↑↓ + ⏎, or 1–4 quick keys, Esc = deny.

export type ApprovalChoice = "once" | "session" | "always" | "deny";

type Option = { key: ApprovalChoice; label: string; deny?: boolean };

/** Clip to one line so a long command can't wrap and desync the box height
 * (the alt-screen ghost-frame class of bug — see ERRORS.md). */
function clipOneLine(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s;
}

export function buildApprovalOptions(toolName?: string): Option[] {
  if (!toolName) return [{ key: "once", label: "Allow once" }, { key: "deny", label: "Deny", deny: true }];
  return [
    { key: "once", label: "Allow once" },
    { key: "session", label: "Allow this session" },
    { key: "always", label: `Always allow ${toolName}` },
    { key: "deny", label: "Deny", deny: true },
  ];
}

export function ApprovalPrompt(props: {
  action: string;
  reason: string;
  toolName?: string;
  width: number;
  isActive?: boolean;
  onChoose: (choice: ApprovalChoice) => void;
}): ReactElement {
  const options = buildApprovalOptions(props.toolName);
  const [sel, setSel] = useState(0);

  useInput(
    (input, key) => {
      if (key.escape) return props.onChoose("deny");
      if (key.upArrow) return setSel((s) => (s - 1 + options.length) % options.length);
      if (key.downArrow) return setSel((s) => (s + 1) % options.length);
      if (key.return) return props.onChoose(options[Math.min(sel, options.length - 1)]!.key);
      const n = Number(input);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) return props.onChoose(options[n - 1]!.key);
    },
    { isActive: props.isActive ?? true },
  );

  const inner = Math.max(8, props.width - 4); // round border (2) + paddingX (2)
  return (
    <Overlay
      title={`⚠ ASK · ${props.toolName ?? "kernel verdict"}`}
      keys="↑↓ select · ⏎ confirm · 1–4 quick · Esc deny"
      color="yellow"
      width={props.width}
    >
      <Text color="white">{clipOneLine(props.action, inner)}</Text>
      <Text dimColor>why  {clipOneLine(props.reason, inner - 5)}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((o, i) => (
          <OverlayRow
            key={o.key}
            selected={i === sel}
            mark={String(i + 1)}
            markColor={o.deny ? "red" : "yellow"}
            label={o.label}
          />
        ))}
      </Box>
    </Overlay>
  );
}
