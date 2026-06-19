import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { HEALTH, ACTIVITY, RISK, FOCUS } from "../term/palette.js";
import type { SandboxState, DoctorCheck, ToggleKey } from "../settings/sandbox.js";
import {
  SANDBOX_TABS, configRows, configToggleKey, dependencyRows, doctorGlyph,
  overrideRows, sandboxSummary, type SandboxTab,
} from "./sandbox-view.js";

// Sandbox settings panel (inline overlay) with four tabs:
//   Config · Dependencies · Doctor · Overrides.
// ←/→ switch tabs, ↑/↓ move the row cursor, ⏎ toggles a Config flag or cycles a
// tool's Overrides rule (none→bypass→enforce→none); Esc closes. Presentational:
// the parent owns the settings read/write and passes onToggle/onCycleOverride.

export function SandboxPanel(props: {
  state: SandboxState;
  doctor: DoctorCheck[];
  onToggle: (key: ToggleKey) => void;
  onCycleOverride: (tool: string) => void;
  onClose: () => void;
}): ReactElement {
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState(0);
  const tabName = SANDBOX_TABS[tab]!;
  const count = rowCount(tabName, props.state);

  useInput((_input, key) => {
    if (key.escape) return props.onClose();
    if (key.leftArrow) { setTab((t) => (t + SANDBOX_TABS.length - 1) % SANDBOX_TABS.length); return void setSel(0); }
    if (key.rightArrow) { setTab((t) => (t + 1) % SANDBOX_TABS.length); return void setSel(0); }
    if (key.upArrow) return void setSel((s) => Math.max(0, s - 1));
    if (key.downArrow) return void setSel((s) => Math.min(Math.max(0, count - 1), s + 1));
    if (key.return) activate(tabName, sel, props);
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Sandbox settings <Text color={FOCUS}>· {sandboxSummary(props.state)}</Text></Text>
      <TabBar active={tab} />
      <Text> </Text>
      <TabBody tab={tabName} state={props.state} doctor={props.doctor} sel={sel} />
      <Text> </Text>
      <Text>  {footer(tabName)}</Text>
    </Box>
  );
}

function rowCount(tab: SandboxTab, state: SandboxState): number {
  if (tab === "Config") return configRows(state).length;
  if (tab === "Overrides") return overrideRows(state).length;
  return 0;
}

function activate(tab: SandboxTab, sel: number, props: {
  state: SandboxState; onToggle: (key: ToggleKey) => void; onCycleOverride: (tool: string) => void;
}): void {
  if (tab === "Config") {
    const key = configToggleKey(sel);
    if (key) props.onToggle(key);
    return;
  }
  if (tab === "Overrides") {
    const row = overrideRows(props.state)[sel];
    if (row) props.onCycleOverride(row.tool);
  }
}

function footer(tab: SandboxTab): string {
  const nav = "←/→ tab · ";
  if (tab === "Config") return `${nav}↑/↓ select · ⏎ toggle · Esc close`;
  if (tab === "Overrides") return `${nav}↑/↓ select · ⏎ cycle bypass/enforce · Esc close`;
  return `${nav}Esc close`;
}

function TabBar(props: { active: number }): ReactElement {
  return (
    <Box>
      {SANDBOX_TABS.map((name, i) => (
        <Text key={name}>
          {i > 0 ? <Text> </Text> : null}
          <Text color={i === props.active ? FOCUS : undefined} bold={i === props.active}>
            {i === props.active ? `[${name}]` : ` ${name} `}
          </Text>
        </Text>
      ))}
    </Box>
  );
}

function TabBody(props: { tab: SandboxTab; state: SandboxState; doctor: DoctorCheck[]; sel: number }): ReactElement {
  if (props.tab === "Config") return <ConfigBody state={props.state} sel={props.sel} />;
  if (props.tab === "Dependencies") return <DependenciesBody state={props.state} />;
  if (props.tab === "Doctor") return <DoctorBody doctor={props.doctor} />;
  return <OverridesBody state={props.state} sel={props.sel} />;
}

function ConfigBody(props: { state: SandboxState; sel: number }): ReactElement {
  const rows = configRows(props.state);
  return (
    <Box flexDirection="column">
      {rows.map((r, i) => (
        <Box key={r.label}>
          <Text>{i === props.sel ? "❯ " : "  "}</Text>
          <Text color={r.on ? HEALTH : undefined}>{r.on ? "●" : "○"} </Text>
          <Text>{r.label}</Text>
          <Text>  {r.hint}</Text>
        </Box>
      ))}
    </Box>
  );
}

function DependenciesBody(props: { state: SandboxState }): ReactElement {
  const deps = dependencyRows(props.state);
  return (
    <Box flexDirection="column">
      <Text>Pre-install packages ({deps.length})</Text>
      {deps.length === 0
        ? <Text>  (none — set sandbox.dependencies in settings)</Text>
        : deps.map((d) => <Text key={d}>  <Text color={HEALTH}>•</Text> {d}</Text>)}
    </Box>
  );
}

function DoctorBody(props: { doctor: DoctorCheck[] }): ReactElement {
  return (
    <Box flexDirection="column">
      {props.doctor.map((c) => (
        <Box key={c.label}>
          <Text color={glyphColor(c)}>{doctorGlyph(c)} </Text>
          <Text>{c.label}</Text>
          <Text>  {c.detail}</Text>
        </Box>
      ))}
    </Box>
  );
}

function OverridesBody(props: { state: SandboxState; sel: number }): ReactElement {
  const rows = overrideRows(props.state);
  return (
    <Box flexDirection="column">
      <Text>Per-tool rules ({rows.length})</Text>
      {rows.length === 0
        ? <Text>  (none — ⏎ on a tool cycles bypass → enforce; configure via settings)</Text>
        : rows.map((r, i) => (
            <Box key={r.tool}>
              <Text>{i === props.sel ? "❯ " : "  "}</Text>
              <Text color={r.rule === "bypass" ? ACTIVITY : HEALTH}>{r.glyph} </Text>
              <Text>{r.tool}</Text>
              <Text>  {r.rule}</Text>
            </Box>
          ))}
    </Box>
  );
}

function glyphColor(check: DoctorCheck): string | undefined {
  if (check.level === "ok") return HEALTH;
  if (check.level === "warn") return RISK;
  return ACTIVITY;
}
