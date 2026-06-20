import { type ReactElement, type ReactNode } from "react";
import { Box, Text } from "ink";
import { FOCUS } from "../../term/palette.js";

// A modal container: a rounded border around a titled body, with an optional dim
// footer hint (e.g. "Enter confirm · Esc cancel"). Chrome only — it owns no input;
// the caller drives keys and passes the body. Lives in the live region, so it
// disappears on close (never committed to <Static> scrollback).

export function Dialog(props: {
  title: string;
  children?: ReactNode;
  footer?: string;
  borderColor?: string;
}): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={props.borderColor ?? FOCUS} paddingX={1}>
      <Text bold color={props.borderColor ?? FOCUS}>{props.title}</Text>
      <Box flexDirection="column" marginTop={1}>{props.children}</Box>
      {props.footer ? <Text dimColor>{props.footer}</Text> : null}
    </Box>
  );
}
