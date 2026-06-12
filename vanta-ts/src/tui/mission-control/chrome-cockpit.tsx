import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { MissionControl } from "./mission-control.js";
import type { CockpitData } from "./cockpit-data.js";

// Bottom-chrome wrapper for the mission-control overlay — mirrors app.tsx's
// other Chrome* wrappers (a framed picker + a dim status footer). Extracted here
// so app.tsx stays under the size gate.

export function ChromeCockpit(p: { data: CockpitData; onClose: () => void; w: number }): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <MissionControl data={p.data} width={p.w} onClose={p.onClose} />
      <Box borderStyle="round" borderColor="gray" paddingX={1} width={p.w}><Text dimColor>{"› "}mission-control…</Text></Box>
    </Box>
  );
}
