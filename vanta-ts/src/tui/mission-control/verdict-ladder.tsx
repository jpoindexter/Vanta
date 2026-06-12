import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { GLYPHS } from "../figures.js";
import { resolveTheme } from "../theme.js";

// The Kernel tab — an accurate explainer of the safety classifier's three
// verdict tiers (src/safety.rs assess_action). Read-only: it documents the
// boundary every tool call passes through, mirroring the demo's verdict ladder.

type Rung = { glyph: string; token: "success" | "warning" | "error"; label: string; rule: string };

const LADDER: Rung[] = [
  { glyph: GLYPHS.check, token: "success", label: "ALLOW", rule: "in-scope, non-destructive, no system/credential keywords → runs immediately" },
  { glyph: GLYPHS.halfRing, token: "warning", label: "ASK", rule: "outside the project root · system/credential · arbitrary-exec vectors → queued for your approval" },
  { glyph: GLYPHS.cross, token: "error", label: "BLOCK", rule: "destructive or exfiltration keywords → refused, never executes" },
];

export function VerdictLadder(props: { width: number }): ReactElement {
  const theme = resolveTheme(process.env);
  return (
    <Box flexDirection="column" width={props.width}>
      <Text dimColor>Every tool call is classified by the kernel before it runs:</Text>
      {LADDER.map((rung) => (
        <Box key={rung.label} flexDirection="column" marginTop={1}>
          <Text color={theme[rung.token]} bold>{rung.glyph} {rung.label}</Text>
          <Text dimColor>  {rung.rule}</Text>
        </Box>
      ))}
    </Box>
  );
}
