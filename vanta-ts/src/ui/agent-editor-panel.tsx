import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { FOCUS, HEALTH } from "../term/palette.js";
import {
  cycleColor,
  cycleModel,
  openAgentFile,
  saveAgent,
  toggleTool,
  type AgentEditorData,
  type EditableAgent,
} from "./agent-editor-actions.js";

type View = "list" | "edit";

export function AgentEditorPanel(props: { repoRoot: string; data: AgentEditorData; onClose: () => void }): ReactElement {
  const [data, setData] = useState(props.data);
  const [view, setView] = useState<View>("list");
  const [sel, setSel] = useState(0);
  const [row, setRow] = useState(0);
  const [note, setNote] = useState("");
  const agents = data.agents;
  const clamped = Math.min(sel, Math.max(0, agents.length - 1));
  const current = agents[clamped];

  const persist = (agent: EditableAgent, nextNote?: string): void => {
    void saveAgent(props.repoRoot, agent, data.toolNames).then((r) => {
      if (!r.ok) return setNote(r.error);
      setData(r.data);
      setNote(nextNote ?? r.note);
    }).catch((e: unknown) => setNote(String(e)));
  };

  useInput((input, key) => {
    if (view === "list") return routeList(input, key, { count: agents.length, sel: clamped, setSel, setView, onClose: props.onClose });
    if (!current) return;
    routeEdit(input, key, {
      agent: current,
      row,
      rowCount: 2 + data.toolNames.length + 1,
      data,
      setRow,
      setView,
      setNote,
      persist,
    });
  });

  if (view === "edit" && current) return <AgentEdit agent={current} data={data} row={row} note={note} />;
  return <AgentList agents={agents} selected={clamped} note={note} />;
}

function routeList(
  _input: string,
  key: { escape?: boolean; return?: boolean; upArrow?: boolean; downArrow?: boolean },
  ctx: { count: number; sel: number; setSel: (n: number) => void; setView: (v: View) => void; onClose: () => void },
): void {
  if (key.escape) return ctx.onClose();
  if (key.upArrow) return ctx.setSel(Math.max(0, ctx.sel - 1));
  if (key.downArrow) return ctx.setSel(Math.min(Math.max(0, ctx.count - 1), ctx.sel + 1));
  if (key.return && ctx.count > 0) return ctx.setView("edit");
}

function routeEdit(
  input: string,
  key: { escape?: boolean; return?: boolean; upArrow?: boolean; downArrow?: boolean },
  ctx: {
    agent: EditableAgent;
    row: number;
    rowCount: number;
    data: AgentEditorData;
    setRow: (fn: (n: number) => number) => void;
    setView: (v: View) => void;
    setNote: (note: string) => void;
    persist: (agent: EditableAgent, note?: string) => void;
  },
): void {
  if (key.escape) return ctx.setView("list");
  if (key.upArrow) return ctx.setRow((n) => Math.max(0, n - 1));
  if (key.downArrow) return ctx.setRow((n) => Math.min(ctx.rowCount - 1, n + 1));
  if (!key.return && input !== " ") return;
  if (ctx.row === 0) return ctx.persist(cycleModel(ctx.agent, ctx.data.modelChoices), "model changed");
  if (ctx.row === 1) return ctx.persist(cycleColor(ctx.agent, ctx.data.colorChoices), "color changed");
  const toolIndex = ctx.row - 2;
  if (toolIndex < ctx.data.toolNames.length) return ctx.persist(toggleTool(ctx.agent, ctx.data.toolNames[toolIndex]!), "tools changed");
  void openAgentFile(ctx.agent).then((r) => ctx.setNote(r.note)).catch((e: unknown) => ctx.setNote(String(e)));
}

function AgentList(props: { agents: EditableAgent[]; selected: number; note: string }): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Agents · custom agent editor</Text>
      {props.agents.length
        ? props.agents.map((agent, i) => <AgentRow key={agent.path} agent={agent} active={i === props.selected} />)
        : <Text>  (no custom agents in .claude/agents or ~/.vanta/agents)</Text>}
      {props.note ? <Text>  {props.note}</Text> : null}
      <Text>  ↑/↓ select · ⏎ edit · Esc close</Text>
    </Box>
  );
}

function AgentRow(props: { agent: EditableAgent; active: boolean }): ReactElement {
  const tools = props.agent.allowTools.length ? `${props.agent.allowTools.length} tools` : "all tools";
  const model = props.agent.model || "default model";
  const color = props.agent.color || "default color";
  return (
    <Box>
      <Text color={props.active ? FOCUS : undefined}>{props.active ? "❯ " : "  "}</Text>
      <Text>{props.agent.name} </Text>
      <Text dimColor>{props.agent.source} · {model} · {tools} · {color}</Text>
    </Box>
  );
}

function AgentEdit(props: { agent: EditableAgent; data: AgentEditorData; row: number; note: string }): ReactElement {
  const rows = [
    { label: "Model", value: props.agent.model || "(inherit active model)", picked: true },
    { label: "Color", value: props.agent.color || "(default)", picked: true },
    ...props.data.toolNames.map((tool) => ({
      label: tool,
      value: props.agent.allowTools.includes(tool) ? "allowed" : "off",
      picked: props.agent.allowTools.includes(tool),
    })),
    { label: "Open file", value: props.agent.path, picked: false },
  ];
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Agent editor · <Text color={HEALTH}>{props.agent.name}</Text></Text>
      <Text dimColor>{props.agent.description || "(no description)"}</Text>
      {rows.map((r, i) => (
        <Box key={`${r.label}-${i}`}>
          <Text color={i === props.row ? FOCUS : undefined}>{i === props.row ? "❯ " : "  "}</Text>
          <Text>{r.picked ? "● " : "○ "}</Text>
          <Text>{r.label.padEnd(18)} </Text>
          <Text dimColor={!r.picked}>{r.value}</Text>
        </Box>
      ))}
      {props.note ? <Text>  {props.note}</Text> : null}
      <Text>  ↑/↓ select · ⏎ change/open · Esc back</Text>
    </Box>
  );
}
