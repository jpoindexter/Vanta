// VANTA-MCP-MULTISELECT — pure, immutable multiselect model for batch-enabling
// project MCP servers. When a project's .mcp.json declares several servers, the
// operator gets ONE list to toggle many at once (toggle each, all/none, confirm)
// instead of one trust prompt per server. No Ink/React, no fs, no spawn — the
// caller supplies the server `string[]`. Mirrors the move/clamp/toggle style of
// ui/msg-selector.ts (no-wrap clamp, immutable `{...state}` returns, same control
// stripping so a server name can't inject terminal escapes into the rendered list).
//
// WIRING (not done this round, named for the clarity gate): an mcp-mount dialog
// component (sibling of ui/approval-prompt.tsx) would open this with
// `openMultiSelect(Object.keys(config.servers))` from `readMcpConfig` (mcp/mount.ts)
// after a project `.mcp.json` is discovered with >1 server. ↑/↓ drive `moveCursor`,
// `space` calls `toggleChecked`, `a` calls `setAll(state, !allChecked)`, and the
// dialog renders `formatMultiSelect(state)`. On `enter` the host calls
// `chosenItems(state)` and passes the returned server NAMES to the same per-server
// mount path mountMcpServers already runs (`mountOneServer` per name), batch-enabling
// the chosen set in one confirm instead of N separate trust gates. That live mount
// wiring is deliberately out of scope this round — this is the tested model the
// dialog resolves against.

/** The multiselect's full immutable state. `cursor` = the focused row; `checked` = the chosen indices. */
export type MultiSelectState = {
  readonly items: readonly string[];
  readonly cursor: number;
  readonly checked: ReadonlySet<number>;
};

const CURSOR_MARK = "▸ ";
const PLAIN_MARK = "  ";
const CHECKED_BOX = "[x]";
const UNCHECKED_BOX = "[ ]";
const CONTROL_STRIP_HINT = "[space] toggle · [a] all · [enter] confirm";

// ANSI escape sequences (OSC, CSI, and any other bare ESC) plus the C0/C1 control
// ranges, written with explicit \u code points so the source carries NO literal
// control bytes. Stripping these stops a server name from injecting terminal escapes
// into the rendered list (same threat model as ui/msg-selector.ts).
const ANSI_ESCAPE = new RegExp("\\u001b(?:\\][\\s\\S]*?(?:\\u0007|\\u001b\\\\)|\\[[0-9;?]*[ -/]*[@-~]|.)", "g");
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

/** Strip ANSI escapes + control chars (newlines/tabs → space), collapse whitespace runs, trim. */
function controlStrip(text: string): string {
  return text
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clamp `value` into `[0, max]` (no wrap). `max < 0` (empty list) → 0. */
function clamp(value: number, max: number): number {
  if (max < 0) return 0;
  return Math.max(0, Math.min(max, value));
}

/**
 * Open the multiselect over `items`: cursor at row 0, the optional `preChecked`
 * indices checked (out-of-range indices ignored). The input arrays are copied —
 * the caller's arrays are never retained or mutated.
 */
export function openMultiSelect(items: readonly string[], preChecked: readonly number[] = []): MultiSelectState {
  const copied = [...items];
  const checked = new Set<number>();
  for (const index of preChecked) {
    if (Number.isInteger(index) && index >= 0 && index < copied.length) checked.add(index);
  }
  return { items: copied, cursor: 0, checked };
}

/** Move the cursor by `delta` (-1 up / +1 down), clamped to `[0, items.length-1]` (no wrap). */
export function moveCursor(state: MultiSelectState, delta: number): MultiSelectState {
  const next = clamp(state.cursor + delta, state.items.length - 1);
  return { ...state, cursor: next };
}

/** Toggle the checked state of the cursor's item only. Empty list → unchanged (no item to toggle). */
export function toggleChecked(state: MultiSelectState): MultiSelectState {
  if (state.items.length === 0) return state;
  const next = new Set(state.checked);
  if (next.has(state.cursor)) next.delete(state.cursor);
  else next.add(state.cursor);
  return { ...state, checked: next };
}

/** Check (`true`) or uncheck (`false`) every item. Returns a new state; input untouched. */
export function setAll(state: MultiSelectState, checked: boolean): MultiSelectState {
  if (!checked) return { ...state, checked: new Set<number>() };
  const next = new Set<number>();
  for (let i = 0; i < state.items.length; i++) next.add(i);
  return { ...state, checked: next };
}

/**
 * The checked item NAMES, in list order (ascending index). This is what a confirm
 * yields — the set of server names to batch-enable. Empty selection → [].
 */
export function chosenItems(state: MultiSelectState): string[] {
  const out: string[] = [];
  for (const [i, name] of state.items.entries()) {
    if (state.checked.has(i)) out.push(name);
  }
  return out;
}

/**
 * Render the multiselect list: one row per item, `▸ ` marks the cursor row, `[x]` /
 * `[ ]` marks checked / unchecked, then the control-stripped item name. A trailing
 * hint line shows the keys. An empty list shows a clear placeholder.
 */
export function formatMultiSelect(state: MultiSelectState): string {
  if (state.items.length === 0) return "  (no servers)";
  const rows: string[] = [];
  for (const [i, name] of state.items.entries()) {
    const cursorMark = i === state.cursor ? CURSOR_MARK : PLAIN_MARK;
    const box = state.checked.has(i) ? CHECKED_BOX : UNCHECKED_BOX;
    rows.push(`${cursorMark}${box} ${controlStrip(name)}`);
  }
  rows.push(CONTROL_STRIP_HINT);
  return rows.join("\n");
}
