import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { HEALTH, RISK, ACTIVITY } from "../term/palette.js";
import { serverRows, toolRows, toolDetail, canReconnect, type McpServerView } from "./mcp-view.js";
import { ElicitationDialog, type ElicitationRequest } from "./elicitation-dialog.js";

// MCP management panel (inline overlay). Three navigable levels:
//   servers → tools (for one server) → tool detail.
// ↑/↓ move, ⏎ drills in, Esc backs out (or closes at the top). On an errored
// server, r reconnects (re-runs the connect path). When a server requests input
// mid-call, the ElicitationDialog takes over until answered. Read/manage only.

export function McpPanel(props: {
  servers: McpServerView[];
  onReconnect: (name: string) => void;
  onClose: () => void;
  elicitation?: ElicitationRequest | null;
  onElicitationDone?: () => void;
}): ReactElement {
  const [serverIdx, setServerIdx] = useState(0);
  const [toolIdx, setToolIdx] = useState<number | null>(null);
  const [detail, setDetail] = useState(false);
  const eliciting = Boolean(props.elicitation);

  const server = props.servers[serverIdx];
  const tools = toolRows(server);
  const back = (): void => { if (detail) setDetail(false); else if (toolIdx !== null) setToolIdx(null); else props.onClose(); };

  // Hook order stays stable across renders (the dialog renders below, not via an
  // early return). While eliciting, the dialog owns input — ignore panel keys.
  useInput((input, key) => {
    if (eliciting) return;
    if (key.escape) return back();
    if (input === "r" && toolIdx === null && canReconnect(server)) return void props.onReconnect(server!.name);
    if (detail) return;
    if (toolIdx === null) {
      return moveSelection({ key, count: props.servers.length, idx: serverIdx, setIdx: setServerIdx, onEnter: () => { if (server && server.tools.length > 0) setToolIdx(0); } });
    }
    moveSelection({ key, count: tools.length, idx: toolIdx, setIdx: setToolIdx, onEnter: () => { if (tools.length > 0) setDetail(true); } });
  });

  if (props.elicitation) return <ElicitationDialog request={props.elicitation} onDone={props.onElicitationDone ?? (() => {})} />;
  if (detail && server) return <ToolDetailView server={server} toolIdx={toolIdx ?? 0} />;
  if (toolIdx !== null && server) return <ToolListView server={server} sel={toolIdx} />;
  return <ServerListView servers={props.servers} sel={serverIdx} />;
}

type MoveKey = { upArrow?: boolean; downArrow?: boolean; return?: boolean };

/** ↑/↓ clamp the selection; ⏎ runs onEnter. One mover for both list levels. */
function moveSelection(opts: { key: MoveKey; count: number; idx: number; setIdx: (n: number) => void; onEnter: () => void }): void {
  const { key, count, idx, setIdx, onEnter } = opts;
  if (key.upArrow) return setIdx(Math.max(0, idx - 1));
  if (key.downArrow) return setIdx(Math.min(count - 1, idx + 1));
  if (key.return) onEnter();
}

function ServerListView(props: { servers: McpServerView[]; sel: number }): ReactElement {
  const rows = serverRows(props.servers);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>MCP servers ({rows.length})</Text>
      {rows.length === 0
        ? <Text>  (none configured — set VANTA_MCP_SERVERS or ~/.vanta/mcp.json)</Text>
        : rows.map((r, i) => (
            <Box key={r.name}>
              <Text>{i === props.sel ? "❯ " : "  "}</Text>
              <Text color={r.badgeOk ? HEALTH : RISK}>{r.badge} </Text>
              <Text>{r.name}</Text>
              <Text>  {r.detail}</Text>
            </Box>
          ))}
      <Text> </Text>
      <Text>  ↑/↓ select · ⏎ tools · <Text color={ACTIVITY}>r</Text> reconnect failed · Esc close</Text>
    </Box>
  );
}

function ToolListView(props: { server: McpServerView; sel: number }): ReactElement {
  const rows = toolRows(props.server);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{props.server.name} · tools ({rows.length})</Text>
      {rows.length === 0
        ? <Text>  (no tools)</Text>
        : rows.map((r, i) => (
            <Box key={r.name}>
              <Text>{i === props.sel ? "❯ " : "  "}</Text>
              <Text>{r.name}</Text>
              {r.desc ? <Text>  {r.desc}</Text> : null}
            </Box>
          ))}
      <Text> </Text>
      <Text>  ↑/↓ select · ⏎ detail · Esc back</Text>
    </Box>
  );
}

function ToolDetailView(props: { server: McpServerView; toolIdx: number }): ReactElement {
  const tool = props.server.tools[props.toolIdx];
  const d = toolDetail(tool);
  if (!d) return <Box marginBottom={1}><Text>  (tool not found)</Text></Box>;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{props.server.name} · {d.name}</Text>
      <Text> </Text>
      <Text>{d.description}</Text>
      <Text> </Text>
      <Text>Schema</Text>
      {d.schema.split("\n").map((line, i) => <Text key={i}>  {line}</Text>)}
      <Text> </Text>
      <Text>  Esc back</Text>
    </Box>
  );
}
