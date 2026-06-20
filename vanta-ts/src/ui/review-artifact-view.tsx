import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { diffArtifact, type ArtifactLine } from "./artifact-diff.js";
import { HEALTH, RISK } from "../term/palette.js";

// Diff-style artifact review. Chrome only — it owns no input; the caller drives
// keys and passes the approve/reject affordance state. Shows the proposed file's
// old-vs-new diff (added lines marked +, removed lines marked -, context plain),
// a +A/-B summary, and a two-option approve/reject footer. Accent colors live on
// the +/- symbols only (HEALTH/RISK), per the palette's one-role-per-row rule.

const MAX_ROWS = 16;
const MAX_W = 92;

export function ReviewArtifactView(props: {
  path: string;
  oldContent: string;
  newContent: string;
  /** Which affordance is highlighted; the caller advances it. Defaults to approve. */
  selected?: "approve" | "reject";
}): ReactElement {
  const diff = diffArtifact(props.oldContent, props.newContent);
  const sel = props.selected ?? "approve";
  const kind = diff.isNew ? "new file" : "edit";
  const rows = diff.lines.slice(0, MAX_ROWS);
  const extra = diff.lines.length - rows.length;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={HEALTH} paddingX={1}>
      <Text bold>Review artifact · {props.path} ({kind})</Text>
      <Text>
        <Text color={HEALTH}>+{diff.added}</Text> <Text color={RISK}>-{diff.removed}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {diff.unchanged
          ? <Text>(no changes — proposed artifact matches the existing file)</Text>
          : rows.map((l, i) => <DiffRow key={i} line={l} />)}
        {extra > 0 ? <Text>  … {extra} more line{extra === 1 ? "" : "s"}</Text> : null}
      </Box>
      <Box marginTop={1}>
        <Option label="Approve & write" active={sel === "approve"} tone={HEALTH} />
        <Text>   </Text>
        <Option label="Reject" active={sel === "reject"} tone={RISK} />
      </Box>
      <Text dimColor>←/→ choose · Enter confirm · Esc reject</Text>
    </Box>
  );
}

function DiffRow(props: { line: ArtifactLine }): ReactElement {
  const { line } = props;
  if (line.kind === "added") return <Text><Text color={HEALTH}>+ </Text>{clip(line.text)}</Text>;
  if (line.kind === "removed") return <Text><Text color={RISK}>- </Text>{clip(line.text)}</Text>;
  return <Text>  {clip(line.text)}</Text>;
}

function Option(props: { label: string; active: boolean; tone: string }): ReactElement {
  return (
    <Text bold={props.active} color={props.active ? props.tone : undefined}>
      {props.active ? "❯ " : "  "}{props.label}
    </Text>
  );
}

function clip(t: string): string {
  const l = (t.split("\n")[0] ?? "").trimEnd();
  return l.length > MAX_W ? `${l.slice(0, MAX_W - 1)}…` : l;
}
