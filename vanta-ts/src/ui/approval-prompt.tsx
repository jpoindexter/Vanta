import { useEffect, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { focusIndicator, type FocusTarget } from "./focus.js";
import { grantAlways, grantNever } from "./grant.js";
import type { Pending } from "./use-agent.js";
import { buildPermissionRequest, type PermissionSection } from "../permissions/request.js";

// The Claude-method approval prompt: a titled box over a numbered, arrow-key
// selectable menu ("Do you want to proceed?  ❯ 1. Yes …"). ↑/↓ move, Enter
// confirms, 1-4 jump, Esc denies. "Always" and "Never" persist tool-scoped
// rules; the kernel block stays immovable.

export type Outcome = "allow" | "always" | "deny" | "never";
type Choice = { focus: FocusTarget; n: number; label: string; outcome: Outcome };

const CHOICES: Choice[] = [
  { focus: "approval-allow", n: 1, label: "Yes", outcome: "allow" },
  { focus: "approval-always", n: 2, label: "Yes, and don't ask again", outcome: "always" },
  { focus: "approval-deny", n: 3, label: "No, and tell Vanta what to do", outcome: "deny" },
  { focus: "approval-never", n: 4, label: "Never allow this tool", outcome: "never" },
];

/** Whether an outcome lets the tool run (allow + always → yes, deny → no). Pure. */
export const approves = (outcome: Outcome): boolean => outcome === "allow" || outcome === "always";

/** Resolve a pending approval for an outcome; "always" also persists the rule. */
export function decide(pending: Pending, outcome: Outcome): void {
  if (outcome === "always") void grantAlways(pending.toolName).catch(() => {});
  if (outcome === "never") void grantNever(pending.toolName).catch(() => {});
  pending.resolve(approves(outcome));
}

export function ApprovalPrompt(props: { focusedTarget?: FocusTarget; onDone: () => void; onFocusTargetChange?: (target: FocusTarget) => void; pending: Pending }): ReactElement {
  const { pending, onDone } = props;
  const [sel, setSel] = useState(() => Math.max(0, choiceIndex(props.focusedTarget)));
  const request = buildPermissionRequest(pending);
  const pick = (i: number): void => { decide(pending, CHOICES[i]!.outcome); onDone(); };
  useEffect(() => {
    const idx = choiceIndex(props.focusedTarget);
    if (idx >= 0) setSel(idx);
  }, [props.focusedTarget]);

  useInput((input, key) => {
    if (key.upArrow) moveChoice(sel, -1, setSel, props.onFocusTargetChange);
    else if (key.downArrow) moveChoice(sel, 1, setSel, props.onFocusTargetChange);
    else if (key.return) pick(sel);
    else if (key.escape) pick(2);
    else if (/^[1-4]$/.test(input)) pick(Number(input) - 1);
  });

  return (
    <Box borderStyle="round" borderColor={"white"} flexDirection="column" paddingX={1} marginTop={1}>
      <Text color={"white"} bold>⚠ {request.title}</Text>
      <Text>{request.subject}</Text>
      {request.reason ? <Text dimColor={true}>{request.reason}</Text> : null}
      {request.sections.map((section) => <RequestSection key={section.label} section={section} />)}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Do you want to proceed?</Text>
        {CHOICES.map((c, i) => <ChoiceRow key={c.n} choice={c} selected={i === sel} accent={"white"} primary={"white"} />)}
      </Box>
    </Box>
  );
}

function choiceIndex(target: FocusTarget | undefined): number {
  return CHOICES.findIndex((c) => c.focus === target);
}

function moveChoice(sel: number, step: 1 | -1, setSel: (n: number) => void, onFocus?: (target: FocusTarget) => void): void {
  const next = (sel + step + CHOICES.length) % CHOICES.length;
  setSel(next);
  onFocus?.(CHOICES[next]!.focus);
}

function RequestSection(props: { section: PermissionSection }): ReactElement {
  const color = props.section.tone === "danger" ? "yellow" : undefined;
  return <Text color={color}><Text bold>{props.section.label}:</Text> {props.section.value}</Text>;
}

function ChoiceRow(props: { choice: Choice; selected: boolean; accent: string; primary: string }): ReactElement {
  const { choice, selected, accent, primary } = props;
  return (
      <Text color={selected ? primary : undefined}>
      <Text color={accent}>{focusIndicator(selected)} {choice.n}.</Text> {choice.label}
      {choice.outcome === "deny" ? <Text dimColor>  (esc)</Text> : null}
    </Text>
  );
}
