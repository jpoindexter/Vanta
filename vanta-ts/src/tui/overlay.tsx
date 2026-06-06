import { type ReactElement, type ReactNode } from "react";
import { Box, Text } from "ink";

// Shared chrome for the floating pickers (sessions, model, approval) — the
// bordered overlay box from docs/hermes-model.html: a colored title, a hint
// line, the rows, and a key-legend footer. Each picker owns its own keyboard
// handling and selection; this is purely the frame so the three surfaces look
// identical without copy-pasting the layout.

export function Overlay(props: {
  title: string;
  hint?: string;
  keys?: string;
  /** Border + title color. Defaults to cyan; approval uses yellow. */
  color?: string;
  width: number;
  children: ReactNode;
}): ReactElement {
  const color = props.color ?? "cyan";
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} width={props.width}>
      <Text color={color} bold>
        {props.title}
      </Text>
      {props.hint ? <Text dimColor>{props.hint}</Text> : null}
      <Box flexDirection="column" marginTop={1}>
        {props.children}
      </Box>
      {props.keys ? <Text color="gray">{props.keys}</Text> : null}
    </Box>
  );
}

export function OverlayRow(props: {
  selected: boolean;
  mark: string;
  markColor?: string;
  label: string;
  meta?: string;
}): ReactElement {
  return (
    <Box>
      <Text color="cyan">{props.selected ? "› " : "  "}</Text>
      <Box flexGrow={1} justifyContent="space-between">
        <Text>
          <Text color={props.markColor}>{props.mark} </Text>
          <Text color={props.selected ? "cyan" : undefined} bold={props.selected}>
            {props.label}
          </Text>
        </Text>
        {props.meta ? <Text dimColor> {props.meta}</Text> : null}
      </Box>
    </Box>
  );
}
