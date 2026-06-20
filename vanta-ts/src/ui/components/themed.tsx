import { type ReactElement, type ReactNode } from "react";
import { Box, Text } from "ink";

// Thin literal-color wrappers (NOT a theme context — the theme system was removed,
// DECISIONS 2026-06-17). ThemedBox/ThemedText carry a small set of named props so
// callers express intent ("muted", "bordered") without re-deriving Ink color props.
// Everything resolves to literal Ink colors; there is no provider and no lookup.

/** A box with an optional single-line border in a literal color. */
export function ThemedBox(props: {
  children?: ReactNode;
  borderColor?: string;
  bordered?: boolean;
  flexDirection?: "row" | "column";
  paddingX?: number;
  paddingY?: number;
}): ReactElement {
  return (
    <Box
      flexDirection={props.flexDirection ?? "column"}
      borderStyle={props.bordered ? "round" : undefined}
      borderColor={props.borderColor}
      paddingX={props.paddingX}
      paddingY={props.paddingY}
    >
      {props.children}
    </Box>
  );
}

/** Text with literal color + the common emphasis flags as named props. */
export function ThemedText(props: {
  children?: ReactNode;
  color?: string;
  bold?: boolean;
  muted?: boolean;
  inverse?: boolean;
}): ReactElement {
  return (
    <Text color={props.color} bold={props.bold} dimColor={props.muted} inverse={props.inverse}>
      {props.children}
    </Text>
  );
}
