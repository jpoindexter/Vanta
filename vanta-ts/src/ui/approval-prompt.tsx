import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme.js";
import { grantAlways, grantNever } from "./grant.js";
import type { Pending } from "./use-agent.js";
import { buildPermissionRequest, type PermissionSection } from "../permissions/request.js";

// The Claude-method approval prompt: a titled box over a numbered, arrow-key
// selectable menu ("Do you want to proceed?  ❯ 1. Yes …"). ↑/↓ move, Enter
// confirms, 1-4 jump, Esc denies. "Always" and "Never" persist tool-scoped
// rules; the kernel block stays immovable.

export type Outcome = "allow" | "always" | "deny" | "never";
type Choice = { n: number; label: string; outcome: Outcome };

const CHOICES: Choice[] = [
  { n: 1, label: "Yes", outcome: "allow" },
  { n: 2, label: "Yes, and don't ask again", outcome: "always" },
  { n: 3, label: "No, and tell Vanta what to do", outcome: "deny" },
  { n: 4, label: "Never allow this tool", outcome: "never" },
];

/** Whether an outcome lets the tool run (allow + always → yes, deny → no). Pure. */
export const approves = (outcome: Outcome): boolean => outcome === "allow" || outcome === "always";

/** Resolve a pending approval for an outcome; "always" also persists the rule. */
export function decide(pending: Pending, outcome: Outcome): void {
  if (outcome === "always") void grantAlways(pending.toolName).catch(() => {});
  if (outcome === "never") void grantNever(pending.toolName).catch(() => {});
  pending.resolve(approves(outcome));
}

export function ApprovalPrompt(props: { pending: Pending; onDone: () => void }): ReactElement {
  const { pending, onDone } = props;
  const t = useTheme();
  const [sel, setSel] = useState(0);
  const request = buildPermissionRequest(pending);
  const pick = (i: number): void => { decide(pending, CHOICES[i]!.outcome); onDone(); };

  useInput((input, key) => {
    if (key.upArrow) setSel((s) => (s + CHOICES.length - 1) % CHOICES.length);
    else if (key.downArrow) setSel((s) => (s + 1) % CHOICES.length);
    else if (key.return) pick(sel);
    else if (key.escape) pick(2);
    else if (/^[1-4]$/.test(input)) pick(Number(input) - 1);
  });

  return (
    <Box borderStyle="round" borderColor={t.warning} flexDirection="column" paddingX={1} marginTop={1}>
      <Text color={t.warning} bold>⚠ {request.title}</Text>
      <Text>{request.subject}</Text>
      {request.reason ? <Text dimColor={t.dimText}>{request.reason}</Text> : null}
      {request.sections.map((section) => <RequestSection key={section.label} section={section} />)}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Do you want to proceed?</Text>
        {CHOICES.map((c, i) => <ChoiceRow key={c.n} choice={c} selected={i === sel} accent={t.warning} primary={t.primary} />)}
      </Box>
    </Box>
  );
}

function RequestSection(props: { section: PermissionSection }): ReactElement {
  const color = props.section.tone === "danger" ? "yellow" : undefined;
  return <Text color={color}><Text bold>{props.section.label}:</Text> {props.section.value}</Text>;
}

function ChoiceRow(props: { choice: Choice; selected: boolean; accent: string; primary: string }): ReactElement {
  const { choice, selected, accent, primary } = props;
  return (
    <Text color={selected ? primary : undefined}>
      <Text color={accent}>{selected ? "❯ " : "  "}{choice.n}.</Text> {choice.label}
      {choice.outcome === "deny" ? <Text dimColor>  (esc)</Text> : null}
    </Text>
  );
}
