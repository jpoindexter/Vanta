import { type ReactElement } from "react";
import { Box, Text, useInput } from "inkr";
import type { CockpitData } from "../tui/mission-control/cockpit-data.js";

// Mission control, inline: the kernel's verdict ladder (what each risk tier
// means), live goals from the kernel, and live loop state from disk. Read-only —
// Esc or ⏎ closes. Data is best-effort (gatherCockpitData never throws), so a
// kernel-down state shows empty sections rather than failing.

export function CockpitPanel(props: { data: CockpitData; onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape || key.return) props.onClose(); });
  const { goals, loops } = props.data;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>Mission control</Text>
      <Text> </Text>
      <Text dimColor>Kernel verdict ladder</Text>
      <Text><Text color="green">  ✓ allow</Text><Text dimColor> in-scope, no risk keywords — runs</Text></Text>
      <Text><Text color="yellow">  ⚠ ask</Text><Text dimColor>   out-of-scope / system / credentials — needs you</Text></Text>
      <Text><Text color="red">  ✗ block</Text><Text dimColor>  destructive / exfiltration — refused</Text></Text>
      <Text> </Text>
      <Text dimColor>Goals ({goals.length})</Text>
      {goals.length === 0 ? <Text dimColor>  (none active)</Text> : goals.slice(0, 6).map((g) => (
        <Text key={g.id}>  <Text color="cyan">[{g.id}]</Text> {clip(g.text)}</Text>
      ))}
      <Text> </Text>
      <Text dimColor>Loops ({loops.length})</Text>
      {loops.length === 0 ? <Text dimColor>  (none)</Text> : loops.slice(0, 6).map((l) => (
        <Text key={l.id}>  <Text color={l.inProgress ? "green" : "gray"}>●</Text> {clip(l.goal)} <Text dimColor>· {l.status} · {l.iterations} iter{l.openEscalations ? ` · ${l.openEscalations} esc` : ""}</Text></Text>
      ))}
      <Text> </Text>
      <Text dimColor>  Esc close</Text>
    </Box>
  );
}

const clip = (t: string): string => (t.length > 56 ? `${t.slice(0, 55)}…` : t);
