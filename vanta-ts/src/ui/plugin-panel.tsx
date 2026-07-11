import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { PluginPanel as PluginPanelData } from "../plugins/panels.js";

export function PluginPanel(props: { panel: PluginPanelData; onClose: () => void; onAction?: (prompt: string) => void }): ReactElement {
  useInput((input, key) => {
    if (key.escape) props.onClose();
    const index = Number(input) - 1;
    const action = Number.isInteger(index) && index >= 0 ? props.panel.actions?.[index] : undefined;
    if (action) props.onAction?.(action.prompt);
    if (input === "d") props.onAction?.(`Disable plugin ${props.panel.plugin} with vanta plugin disable ${props.panel.plugin}`);
  });
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{props.panel.title}</Text>
      <Text dimColor>  {props.panel.plugin} worker</Text>
      {props.panel.lines.length
        ? props.panel.lines.map((line, index) => <Text key={`${index}:${line}`}>  {line}</Text>)
        : <Text>  (no panel content)</Text>}
      {props.panel.actions?.map((action, index) => <Text key={action.id}>  {index + 1}. {action.label}</Text>)}
      {props.panel.refreshMs ? <Text dimColor>  refresh {Math.round(props.panel.refreshMs / 1000)}s · d disable plugin</Text> : null}
      <Text>  Esc close</Text>
    </Box>
  );
}
