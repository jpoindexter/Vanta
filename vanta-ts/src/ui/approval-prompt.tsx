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

export type Outcome = "task" | "allow" | "always" | "deny" | "never";
type Choice = { focus: FocusTarget; label: string; outcome: Outcome };

const CHOICES: Choice[] = [
  { focus: "approval-task", label: "Yes — go ahead with this task", outcome: "task" },
  { focus: "approval-allow", label: "Yes, just once", outcome: "allow" },
  { focus: "approval-always", label: "Yes, and don't ask again", outcome: "always" },
  { focus: "approval-deny", label: "No, and tell Vanta what to do", outcome: "deny" },
  { focus: "approval-never", label: "Never allow this tool", outcome: "never" },
];

/** Whether an outcome lets the tool run (allow + always → yes, deny → no). Pure. */
export const approves = (outcome: Outcome): boolean => outcome === "task" || outcome === "allow" || outcome === "always";

/** Resolve a pending approval for an outcome; "always" also persists the rule. */
export async function decide(pending: Pending, outcome: Outcome): Promise<void> {
  if (pending.fresh && (outcome === "task" || outcome === "always")) { pending.resolve(false); return; }
  if (outcome === "task") pending.grantTask?.();
  if (outcome === "always") await grantAlways(pending.toolName).catch(() => {});
  if (outcome === "never") await grantNever(pending.toolName).catch(() => {});
  pending.resolve(approves(outcome));
}

export function ApprovalPrompt(props: { focusedTarget?: FocusTarget; onDone: () => void; onFocusTargetChange?: (target: FocusTarget) => void; pending: Pending }): ReactElement {
  const { pending, onDone } = props;
  const choices = CHOICES.filter((choice) =>
    (!pending.fresh || !["task", "always"].includes(choice.outcome))
    && (choice.outcome !== "task" || pending.canContinueTask),
  ).filter((choice) =>
    choice.outcome !== "allow" || !pending.canContinueTask || pending.fresh,
  );
  const [sel, setSel] = useState(() => Math.max(0, choiceIndex(props.focusedTarget, choices)));
  const request = buildPermissionRequest(pending);
  const pick = (i: number): void => { void decide(pending, choices[i]!.outcome).then(onDone); };
  useEffect(() => {
    const idx = choiceIndex(props.focusedTarget, choices);
    if (idx >= 0) setSel(idx);
  }, [props.focusedTarget]);

  useInput((input, key) => {
    if (key.upArrow) moveChoice(sel, -1, { choices, setSel, onFocus: props.onFocusTargetChange });
    else if (key.downArrow) moveChoice(sel, 1, { choices, setSel, onFocus: props.onFocusTargetChange });
    else if (key.return) pick(sel);
    else if (key.escape) pick(choices.findIndex((choice) => choice.outcome === "deny"));
    else if (/^[1-4]$/.test(input)) { const index = Number(input) - 1; if (index < choices.length) pick(index); }
  });

  return (
    <Box borderStyle="round" borderColor={"white"} flexDirection="column" paddingX={1} marginTop={1}>
      <Text bold>⚠ {request.title}</Text>
      <Text>{request.subject}</Text>
      {request.reason ? <Text>{request.reason}</Text> : null}
      {request.sections.map((section) => <RequestSection key={section.label} section={section} />)}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Do you want to proceed?</Text>
        {choices.map((c, i) => <ChoiceRow key={c.outcome} choice={c} number={i + 1} selected={i === sel} accent={"white"} primary={"white"} />)}
      </Box>
    </Box>
  );
}

function choiceIndex(target: FocusTarget | undefined, choices: Choice[]): number {
  return choices.findIndex((c) => c.focus === target);
}

function moveChoice(sel: number, step: 1 | -1, options: { choices: Choice[]; setSel: (n: number) => void; onFocus?: (target: FocusTarget) => void }): void {
  const next = (sel + step + options.choices.length) % options.choices.length;
  options.setSel(next);
  options.onFocus?.(options.choices[next]!.focus);
}

function RequestSection(props: { section: PermissionSection }): ReactElement {
  const color = props.section.tone === "danger" ? "yellow" : undefined;
  return <Text><Text bold>{props.section.label}:</Text> {props.section.value}</Text>;
}

function ChoiceRow(props: { choice: Choice; number: number; selected: boolean; accent: string; primary: string }): ReactElement {
  const { choice, number, selected, accent, primary } = props;
  return (
      <Text>
      <Text>{focusIndicator(selected)} {number}.</Text> {choice.label}
      {choice.outcome === "deny" ? <Text>  (esc)</Text> : null}
    </Text>
  );
}
