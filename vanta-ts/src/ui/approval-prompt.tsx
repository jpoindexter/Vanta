import { useEffect, useRef, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { focusIndicator, type FocusTarget } from "./focus.js";
import { decidePermission, type PermissionDecision, type PermissionDecisionResult } from "../permissions/decision.js";
import type { Pending } from "./use-agent.js";
import { buildPermissionRequest, type PermissionSection } from "../permissions/request.js";

// The Claude-method approval prompt: a titled box over a numbered, arrow-key
// selectable menu ("Do you want to proceed?  ❯ 1. Yes …"). ↑/↓ move, Enter
// confirms, 1-4 jump, Esc denies. "Always" and "Never" persist tool-scoped
// rules; the kernel block stays immovable.

export type Outcome = "task" | PermissionDecision;
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
export async function decide(pending: Pending, outcome: Outcome): Promise<PermissionDecisionResult> {
  if (outcome === "task") {
    if (pending.fresh || !pending.canContinueTask || !pending.grantTask) {
      pending.resolve(false);
      return { approved: false, decision: "deny" };
    }
    pending.grantTask();
    pending.resolve(true);
    return { approved: true, decision: "allow" };
  }
  const result = await decidePermission(pending, outcome);
  pending.resolve(result.approved);
  return result;
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
  const { error, pick, isClaimed, dismiss } = useApprovalDecision(pending, onDone);
  const choose = (i: number): void => { if (choices[i]) pick(choices[i]!.outcome); };
  useEffect(() => {
    const idx = choiceIndex(props.focusedTarget, choices);
    if (idx >= 0) setSel(idx);
  }, [props.focusedTarget]);

  useInput((input, key) => {
    if (error) {
      if (key.return || key.escape) dismiss();
      return;
    }
    if (isClaimed()) return;
    if (key.upArrow) moveChoice(sel, -1, { choices, setSel, onFocus: props.onFocusTargetChange });
    else if (key.downArrow) moveChoice(sel, 1, { choices, setSel, onFocus: props.onFocusTargetChange });
    else if (key.return) choose(sel);
    else if (key.escape) choose(choices.findIndex((choice) => choice.outcome === "deny"));
    else if (/^[1-4]$/.test(input)) { const index = Number(input) - 1; if (index < choices.length) choose(index); }
  });

  if (error) return <Box borderStyle="round" flexDirection="column" paddingX={1}><Text color="yellow">{error}</Text><Text>Action denied. Press Enter or Esc to dismiss.</Text></Box>;

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

function useApprovalDecision(pending: Pending, onDone: () => void) {
  const claimed = useRef<Pending | null>(null);
  const dismissed = useRef<Pending | null>(null);
  const currentPending = useRef(pending);
  currentPending.current = pending;
  const [failure, setFailure] = useState<{ pending: Pending; message: string } | null>(null);
  const error = failure?.pending === pending ? failure.message : "";
  const pick = (outcome: Outcome): void => {
    if (claimed.current === pending) return;
    claimed.current = pending;
    void decide(pending, outcome).then((result) => {
      if (currentPending.current !== pending) return;
      if (result.error) setFailure({ pending, message: result.error });
      else onDone();
    });
  };
  const dismiss = (): void => {
    if (dismissed.current === pending) return;
    dismissed.current = pending;
    onDone();
  };
  return { error, pick, dismiss, isClaimed: () => claimed.current === pending };
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
