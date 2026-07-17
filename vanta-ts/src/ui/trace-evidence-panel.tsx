import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Entry, ToolEntry } from "./types.js";
import { FOCUS, RISK } from "../term/palette.js";

export function TraceEvidencePanel(props: { entries: readonly Entry[] }): ReactElement {
  const tools = props.entries.flatMap((entry) => entry.kind === "toolGroup" ? entry.tools : entry.kind === "tool" ? [entry] : []);
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>Tool evidence <Text dimColor>Ctrl+T closes</Text></Text>
      {tools.length ? tools.map((tool, index) => <EvidenceRow key={`${tool.name}-${index}`} tool={tool} />) : <Text dimColor>No tool evidence in this task yet.</Text>}
    </Box>
  );
}
function EvidenceRow(props: { tool: ToolEntry }): ReactElement {
  const tool = props.tool;
  const output = tool.rawOutput?.trim() || tool.errorLine || tool.summary || "(no output)";
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={tool.ok === false ? RISK : FOCUS}>{tool.ok === false ? "✗" : "✓"} {tool.name}{tool.detail ? ` · ${tool.detail}` : ""}</Text>
      {output.split("\n").map((line, index) => <Text key={index}>  {line}</Text>)}
    </Box>
  );
}
