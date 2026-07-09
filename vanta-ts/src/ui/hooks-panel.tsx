import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { SHELL_HOOK_EVENTS, type ShellHook, type ShellHookEvent, type ShellHooksConfig } from "../hooks/shell-hooks.js";
import type { HooksPanelAction } from "./hooks-actions.js";
import { FOCUS } from "../term/palette.js";

type HookType = "command" | "http" | "prompt" | "agent" | "mcp_tool";
type MatcherMode = "all" | "tool" | "prompt" | "interactive";
type Mode =
  | { kind: "list"; sel: number }
  | { kind: "view"; event: ShellHookEvent; index: number }
  | { kind: "event"; sel: number }
  | { kind: "type"; event: ShellHookEvent; sel: number }
  | { kind: "matcher"; event: ShellHookEvent; hookType: HookType; sel: number }
  | { kind: "action"; event: ShellHookEvent; hookType: HookType; matcher: MatcherMode; sel: number };

const HOOK_TYPES: HookType[] = ["command", "http", "prompt", "agent", "mcp_tool"];
const MATCHERS: MatcherMode[] = ["all", "tool", "prompt", "interactive"];

function hookLabel(hook: ShellHook): string {
  const type = hook.type ?? "command";
  if (type === "http") return `http ${hook.url}`;
  if (type === "mcp_tool") return `mcp ${hook.server}.${hook.tool}`;
  if (type === "prompt" || type === "agent") return `${type} ${hook.prompt?.slice(0, 28) ?? ""}`;
  return hook.command ?? "(missing command)";
}

function hookRows(config: ShellHooksConfig): Array<{ event: ShellHookEvent; index: number; label: string }> {
  const rows: Array<{ event: ShellHookEvent; index: number; label: string }> = [];
  for (const event of SHELL_HOOK_EVENTS) {
    for (const [index, hook] of (config[event] ?? []).entries()) {
      rows.push({ event, index, label: `${event} #${index + 1} · ${hookLabel(hook)}` });
    }
  }
  return rows;
}

function actionTemplates(type: HookType): string[] {
  if (type === "http") return ["http://127.0.0.1:8787/hook", "https://example.com/vanta-hook"];
  if (type === "prompt") return ["Review this event and return allow/block JSON.", "Add concise context for this event."];
  if (type === "agent") return ["Inspect this event with tools and return a verdict.", "Summarize this event for the operator."];
  if (type === "mcp_tool") return ["tool_name", "review_event"];
  return ["printf 'vanta hook fired\\n'", "vanta status"];
}

function buildHook(type: HookType, matcher: MatcherMode, action: string): ShellHook {
  const base: ShellHook =
    type === "http" ? { type, url: action } :
    type === "prompt" || type === "agent" ? { type, prompt: action } :
    type === "mcp_tool" ? { type, server: "default", tool: action } :
    { type: "command", command: action };
  if (matcher === "tool") return { ...base, toolNamePattern: "shell_cmd|write_file" };
  if (matcher === "prompt") return { ...base, promptPattern: ".+" };
  if (matcher === "interactive") return { ...base, sessionType: "interactive" };
  return base;
}

function move(sel: number, delta: number, count: number): number {
  return Math.max(0, Math.min(Math.max(0, count - 1), sel + delta));
}

export function HooksPanel(props: {
  config: ShellHooksConfig;
  onAction: (action: HooksPanelAction) => void;
  onClose: () => void;
}): ReactElement {
  const [mode, setMode] = useState<Mode>({ kind: "list", sel: 0 });
  const rows = hookRows(props.config);
  useInput((input, key) => {
    if (key.escape) return mode.kind === "list" ? props.onClose() : setMode({ kind: "list", sel: 0 });
    if (mode.kind === "list") {
      const count = rows.length + 1;
      if (key.upArrow) return setMode({ kind: "list", sel: move(mode.sel, -1, count) });
      if (key.downArrow) return setMode({ kind: "list", sel: move(mode.sel, 1, count) });
      if (key.return) {
        if (mode.sel === rows.length) return setMode({ kind: "event", sel: 0 });
        const row = rows[mode.sel];
        if (row) return setMode({ kind: "view", event: row.event, index: row.index });
      }
    } else if (mode.kind === "view") {
      if (input === "d") {
        props.onAction({ kind: "remove", event: mode.event, index: mode.index });
        return setMode({ kind: "list", sel: 0 });
      }
    } else if (mode.kind === "event") {
      if (key.upArrow) return setMode({ kind: "event", sel: move(mode.sel, -1, SHELL_HOOK_EVENTS.length) });
      if (key.downArrow) return setMode({ kind: "event", sel: move(mode.sel, 1, SHELL_HOOK_EVENTS.length) });
      if (key.return) return setMode({ kind: "type", event: SHELL_HOOK_EVENTS[mode.sel]!, sel: 0 });
    } else if (mode.kind === "type") {
      if (key.upArrow) return setMode({ ...mode, sel: move(mode.sel, -1, HOOK_TYPES.length) });
      if (key.downArrow) return setMode({ ...mode, sel: move(mode.sel, 1, HOOK_TYPES.length) });
      if (key.return) return setMode({ kind: "matcher", event: mode.event, hookType: HOOK_TYPES[mode.sel]!, sel: 0 });
    } else if (mode.kind === "matcher") {
      if (key.upArrow) return setMode({ ...mode, sel: move(mode.sel, -1, MATCHERS.length) });
      if (key.downArrow) return setMode({ ...mode, sel: move(mode.sel, 1, MATCHERS.length) });
      if (key.return) return setMode({ kind: "action", event: mode.event, hookType: mode.hookType, matcher: MATCHERS[mode.sel]!, sel: 0 });
    } else if (mode.kind === "action") {
      const actions = actionTemplates(mode.hookType);
      if (key.upArrow) return setMode({ ...mode, sel: move(mode.sel, -1, actions.length) });
      if (key.downArrow) return setMode({ ...mode, sel: move(mode.sel, 1, actions.length) });
      if (key.return) {
        props.onAction({ kind: "add", event: mode.event, hook: buildHook(mode.hookType, mode.matcher, actions[mode.sel]!) });
        return setMode({ kind: "list", sel: 0 });
      }
    }
  });
  return <HooksPanelBody mode={mode} rows={rows} config={props.config} />;
}

function HooksPanelBody(props: { mode: Mode; rows: ReturnType<typeof hookRows>; config: ShellHooksConfig }): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold><Text color={FOCUS}>❯</Text> Hooks</Text>
      {props.mode.kind === "list" ? <ListView rows={props.rows} sel={props.mode.sel} /> : null}
      {props.mode.kind === "view" ? <ViewHook config={props.config} event={props.mode.event} index={props.mode.index} /> : null}
      {props.mode.kind === "event" ? <Pick title="Event" items={[...SHELL_HOOK_EVENTS]} sel={props.mode.sel} /> : null}
      {props.mode.kind === "type" ? <Pick title={`Type for ${props.mode.event}`} items={HOOK_TYPES} sel={props.mode.sel} /> : null}
      {props.mode.kind === "matcher" ? <Pick title={`Matcher for ${props.mode.event}`} items={MATCHERS} sel={props.mode.sel} /> : null}
      {props.mode.kind === "action" ? <Pick title={`Action for ${props.mode.event}`} items={actionTemplates(props.mode.hookType)} sel={props.mode.sel} /> : null}
      <Text dimColor>  ↑/↓ select · ⏎ choose · d delete · Esc back/close</Text>
    </Box>
  );
}

function ListView(props: { rows: ReturnType<typeof hookRows>; sel: number }): ReactElement {
  const labels = [...props.rows.map((r) => r.label), "New hook"];
  return <Pick title="Configured Hooks" items={labels.length ? labels : ["New hook"]} sel={props.sel} />;
}

function ViewHook(props: { config: ShellHooksConfig; event: ShellHookEvent; index: number }): ReactElement {
  const hook = props.config[props.event]?.[props.index];
  return (
    <Box flexDirection="column">
      <Text bold>{props.event} #{props.index + 1}</Text>
      <Text>{hook ? hookLabel(hook) : "(missing hook)"}</Text>
      <Text dimColor>{hook ? JSON.stringify(hook) : ""}</Text>
    </Box>
  );
}

function Pick<T extends string>(props: { title: string; items: readonly T[]; sel: number }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>{props.title}</Text>
      {props.items.map((item, i) => <Text key={item} inverse={i === props.sel}>{i === props.sel ? "❯ " : "  "}{item}</Text>)}
    </Box>
  );
}
