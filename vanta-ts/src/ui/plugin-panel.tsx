import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { PluginPanel as PluginPanelData } from "../plugins/panels.js";

export function PluginPanel(props: { panel: PluginPanelData; onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape) props.onClose(); });
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{props.panel.title}</Text>
      <Text dimColor>  {props.panel.plugin} worker</Text>
      {props.panel.lines.length
        ? props.panel.lines.map((line, index) => <Text key={`${index}:${line}`}>  {line}</Text>)
        : <Text>  (no panel content)</Text>}
      <Text>  Esc close</Text>
    </Box>
  );
}
