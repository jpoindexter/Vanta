import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { moveWorkflowStep, runSelectedWorkflow, toggleWorkflowStep, type WorkflowSelectData } from "./workflow-select-actions.js";
import { FOCUS, HEALTH } from "../term/palette.js";

export function WorkflowSelectPanel(props: { repoRoot: string; data: WorkflowSelectData; onClose: () => void }): ReactElement {
  const [selection, setSelection] = useState(props.data.selection);
  const [sel, setSel] = useState(0);
  const [note, setNote] = useState("");
  const steps = props.data.spec?.steps ?? [];
  const ordered = selection.order.flatMap((id) => steps.find((step) => step.id === id) ?? []);
  const clamped = Math.min(sel, Math.max(0, ordered.length - 1));
  const current = ordered[clamped];

  const run = (): void => {
    if (!props.data.spec) return;
    void runSelectedWorkflow(props.repoRoot, props.data.spec, selection)
      .then((result) => setNote(result.message))
      .catch((err: unknown) => setNote(String(err)));
  };

  useInput((input, key) => {
    if (key.escape) return props.onClose();
    if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSel((i) => Math.min(ordered.length - 1, i + 1));
    if (input === " ") return current && setSelection((s) => toggleWorkflowStep(s, current.id));
    if (input === "u") return current && setSelection((s) => moveWorkflowStep(s, current.id, -1));
    if (input === "d") return current && setSelection((s) => moveWorkflowStep(s, current.id, 1));
    if (key.return) return run();
  });

  if (!props.data.spec) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Workflow steps</Text>
        <Text>  {props.data.error ?? "No workflow draft loaded"}</Text>
        <Text dimColor>  Write a legacy workflow spec to {props.data.draftPath}</Text>
        <Text>  Esc close</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Workflow steps · {props.data.spec.name}</Text>
      {ordered.map((step, i) => {
        const selected = selection.selectedIds.includes(step.id);
        return (
          <Text key={step.id}>
            <Text color={i === clamped ? FOCUS : undefined}>{i === clamped ? "❯ " : "  "}</Text>
            <Text color={selected ? HEALTH : undefined}>{selected ? "☑" : "☐"}</Text>
            {` ${step.id}  ${step.type}  ${step.instruction}`}
          </Text>
        );
      })}
      {note ? <Text>  {note}</Text> : null}
      <Text dimColor>{`  ${props.data.draftPath}`}</Text>
      <Text>  ↑/↓ select · Space skip/run · u/d reorder · ⏎ run selected · Esc close</Text>
    </Box>
  );
}
