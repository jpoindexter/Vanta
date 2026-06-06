import { useState, type ReactElement } from "react";
import { useInput } from "ink";
import { Overlay, OverlayRow } from "./overlay.js";

// The HITL approval prompt (docs/hermes-model.html tab 6). Replaces the old
// inline y/n with a four-option choice. once/deny are always available; session
// + always-allow only when the gated action carries a tool name to key on
// (kernel-gated tool calls do; some tool-internal confirmations don't). ↑↓ + ⏎,
// or 1–4 quick keys, Esc = deny.

export type ApprovalChoice = "once" | "session" | "always" | "deny";

type Option = { key: ApprovalChoice; label: string; deny?: boolean };

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

  return (
    <Overlay
      title={`⚠ Approve action — ${props.toolName ?? props.action}`}
      hint={props.reason}
      keys="↑↓ select · ⏎ confirm · 1–4 quick · Esc deny"
      color="yellow"
      width={props.width}
    >
      {options.map((o, i) => (
        <OverlayRow
          key={o.key}
          selected={i === sel}
          mark={String(i + 1)}
          markColor={o.deny ? "red" : "yellow"}
          label={o.label}
        />
      ))}
    </Overlay>
  );
}
