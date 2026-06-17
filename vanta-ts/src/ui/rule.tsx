import { type ReactElement } from "react";
import { Text, useStdout } from "ink";

// A thin full-width horizontal rule — the Claude Code v2 way of bracketing the
// input and separating chrome (no heavy boxes). Width tracks the terminal.

export function Rule(): ReactElement {
  const cols = useStdout().stdout?.columns ?? 80;
  return <Text>{"─".repeat(Math.max(8, cols - 1))}</Text>;
}
