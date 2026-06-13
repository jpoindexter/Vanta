import { type ReactElement } from "react";
import { Text, useStdout } from "ink";
import { useTheme } from "./theme.js";

// A thin full-width horizontal rule — the Claude Code v2 way of bracketing the
// input and separating chrome (no heavy boxes). Width tracks the terminal.

export function Rule(): ReactElement {
  const t = useTheme();
  const cols = useStdout().stdout?.columns ?? 80;
  return <Text dimColor={t.dimText}>{"─".repeat(Math.max(8, cols - 1))}</Text>;
}
