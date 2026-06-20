import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { FOCUS, GOAL } from "../../term/palette.js";
import { STEP_LABELS, type AgentDraft, type StepId } from "./steps.js";

// Presentational step screens for the agent-creation wizard. These own NO input
// — the wizard component drives keys and passes the current draft. Each screen
// shows the field it edits and a live echo so a render test can assert progress.

/** The tool names offered at the Tools step (toggle with the selection cursor). */
export const TOOL_CHOICES = [
  "read_file",
  "write_file",
  "shell_cmd",
  "web_search",
  "web_fetch",
] as const;

/** The two location choices, in cursor order. */
export const LOCATION_CHOICES = ["home", "project"] as const;

/** A single-line text field echo: label + current value (or a dim placeholder). */
function Field(props: { label: string; value: string; placeholder: string }): ReactElement {
  return (
    <Box>
      <Text bold>{props.label}: </Text>
      {props.value
        ? <Text color={FOCUS}>{props.value}▏</Text>
        : <Text dimColor>{props.placeholder}</Text>}
    </Box>
  );
}

/** A cursor-driven option list (Tools/Location), marking the active + chosen rows. */
function OptionList(props: {
  options: readonly string[];
  cursor: number;
  chosen: readonly string[];
}): ReactElement {
  return (
    <Box flexDirection="column">
      {props.options.map((opt, i) => (
        <Box key={opt}>
          <Text color={i === props.cursor ? FOCUS : undefined}>{i === props.cursor ? "❯ " : "  "}</Text>
          <Text>{props.chosen.includes(opt) ? "◉ " : "◯ "}</Text>
          <Text inverse={i === props.cursor}>{opt}</Text>
        </Box>
      ))}
    </Box>
  );
}

/** Render the screen body for `step`. The cursor index is owned by the wizard. */
export function StepScreen(props: { step: StepId; draft: AgentDraft; cursor: number }): ReactElement {
  const { step, draft, cursor } = props;
  switch (step) {
    case "type":
      return <Field label="Type" value={draft.type} placeholder="e.g. researcher, reviewer, writer" />;
    case "description":
      return <Field label="Description" value={draft.description} placeholder="What does this agent do?" />;
    case "model":
      return <Field label="Model" value={draft.model} placeholder="optional — Enter to inherit the default" />;
    case "tools":
      return <OptionList options={TOOL_CHOICES} cursor={cursor} chosen={draft.tools} />;
    case "prompt":
      return <PromptScreen draft={draft} />;
    case "generate":
      return <GenerateScreen draft={draft} />;
    case "location":
      return <OptionList options={LOCATION_CHOICES} cursor={cursor} chosen={[draft.location]} />;
    case "confirm":
      return <ConfirmScreen draft={draft} />;
  }
}

/** The Prompt step edits the agent's display name (the system prompt is generated). */
function PromptScreen(props: { draft: AgentDraft }): ReactElement {
  return (
    <Box flexDirection="column">
      <Field label="Name" value={props.draft.name} placeholder="A display name for this agent" />
      <Text dimColor>The system prompt is produced by the Generate step.</Text>
    </Box>
  );
}

/** The Generate step shows the produced prompt (or a prompt to generate it). */
function GenerateScreen(props: { draft: AgentDraft }): ReactElement {
  const prompt = props.draft.systemPrompt.trim();
  return (
    <Box flexDirection="column">
      <Text bold>System prompt</Text>
      {prompt
        ? <Text color={GOAL}>{prompt.slice(0, 240)}{prompt.length > 240 ? "…" : ""}</Text>
        : <Text dimColor>Press g to generate from the description.</Text>}
    </Box>
  );
}

/** The Confirm step reviews every field before writing the file. */
function ConfirmScreen(props: { draft: AgentDraft }): ReactElement {
  const d = props.draft;
  return (
    <Box flexDirection="column">
      <Text bold>Review</Text>
      <Text>Name: <Text color={FOCUS}>{d.name || "(unnamed)"}</Text></Text>
      <Text>Type: {d.type || "(none)"}</Text>
      <Text>Model: {d.model || "(default)"}</Text>
      <Text>Tools: {d.tools.length ? d.tools.join(", ") : "(all)"}</Text>
      <Text>Location: {d.location}</Text>
      <Text dimColor>Enter writes the agent file.</Text>
    </Box>
  );
}

/** The header line: step label + position caption. */
export function StepHeader(props: { step: StepId; position: number; total: number }): ReactElement {
  return (
    <Text bold>
      Step {props.position}/{props.total} — {STEP_LABELS[props.step]}
    </Text>
  );
}
