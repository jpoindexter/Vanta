import { useState, type ReactElement } from "react";
import { Box, Text } from "ink";
import { Tabs } from "../tabs.js";
import { overlayAccent } from "../overlay.js";
import { useKeybinding } from "../keybinding/use-keybinding.js";
import { VerdictLadder } from "./verdict-ladder.js";
import { GoalsPanel } from "./goals-panel.js";
import { LoopsPanel } from "./loops-panel.js";
import type { CockpitData } from "./cockpit-data.js";

// The v2 mission-control surface (VANTA_TUI=v2). A tabbed overlay over the three
// read-only boundary screens from the demo — Kernel verdict ladder, live Goals,
// live Loops — switched with the registry's "tabs" context (tab / ⇧tab / arrows,
// esc to close). Opt-in: the v1 composer path is untouched.

const TAB_LABELS = ["Kernel", "Goals", "Loops"] as const;

function Panel(props: { tab: number; data: CockpitData; width: number }): ReactElement {
  if (props.tab === 1) return <GoalsPanel goals={props.data.goals} width={props.width} />;
  if (props.tab === 2) return <LoopsPanel loops={props.data.loops} width={props.width} />;
  return <VerdictLadder width={props.width} />;
}

export function MissionControl(props: { data: CockpitData; width: number; onClose: () => void }): ReactElement {
  const [tab, setTab] = useState(0);
  const accent = overlayAccent(undefined);
  const count = TAB_LABELS.length;
  useKeybinding("tabs.next", () => setTab((t) => (t + 1) % count));
  useKeybinding("tabs.prev", () => setTab((t) => (t - 1 + count) % count));
  useKeybinding("tabs.close", () => props.onClose());
  const inner = Math.max(20, props.width - 4);
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={accent} paddingX={1} width={props.width}>
      <Box justifyContent="space-between">
        <Tabs tabs={TAB_LABELS} active={tab} accent={accent} />
        <Text dimColor>mission-control</Text>
      </Box>
      <Box marginTop={1}>
        <Panel tab={tab} data={props.data} width={inner} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>tab / ⇧tab switch · esc close</Text>
      </Box>
    </Box>
  );
}
