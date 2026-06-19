import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { contextBar, kfmt } from "./busy.js";
import { formatUsd } from "../pricing.js";
import type { UsageStats } from "./stats-data.js";

// Read-only usage-stats panel: account-wide session / turn / tool-call totals,
// the most-used tools as share bars, and a coarse token+cost estimate. Mirrors
// cockpit-panel (read-only, Esc closes). Data comes from the parent — no fetching
// here. Reuses the context-bar/kfmt figures (no new dep).

const LABEL_WIDTH = 16;

function ToolRow(props: { name: string; count: number; total: number }): ReactElement {
  const pct = props.total > 0 ? Math.round((props.count / props.total) * 100) : 0;
  const label = props.name.length > LABEL_WIDTH ? `${props.name.slice(0, LABEL_WIDTH - 1)}…` : props.name.padEnd(LABEL_WIDTH);
  return (
    <Text>
      <Text>  {label}</Text>
      <Text>{contextBar(pct, 12)}</Text>
      <Text>{"  "}{props.count}</Text>
    </Text>
  );
}

export function StatsPanel(props: { stats: UsageStats; onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape || key.return) props.onClose(); });
  const { stats } = props;
  const cost = stats.costUsd === null ? "~?" : formatUsd(stats.costUsd);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Usage stats</Text>
      <Text> </Text>
      <Text>  Sessions   {stats.sessions}</Text>
      <Text>  Turns      {stats.turns}</Text>
      <Text>  Tool calls {stats.toolCalls}</Text>
      <Text>  Tokens     ~{kfmt(stats.tokens)}  ·  est cost {cost}</Text>
      <Text> </Text>
      <Text>Top tools ({stats.topTools.length})</Text>
      {stats.topTools.length === 0
        ? <Text>  (none yet)</Text>
        : stats.topTools.map((t) => <ToolRow key={t.name} name={t.name} count={t.count} total={stats.toolCalls} />)}
      <Text> </Text>
      <Text>  Esc close</Text>
    </Box>
  );
}
