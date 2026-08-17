import { type ReactElement } from "react";
import { Box, Text } from "ink";
import type { TodoItem } from "../todo/store.js";
import { displayLabel } from "../tools/todo-active-form.js";
import { ACTIVITY, BONE } from "../term/palette.js";

// The agent's live plan. Lives in the live region (not <Static>) so it updates in
// place as the agent rewrites the todo list mid-turn. A completed plan remains as
// turn evidence until the next turn begins, when the reducer clears it.
//
// Shape follows the Claude-CLI plan block — a headline naming what is happening
// right now with the turn's cost beside it, then the checklist under a tree
// connector — in Vanta's palette: violet marks the one live row (brand: violet =
// active/live), settled rows fall back to Bone and strike through.

const MAX_ROWS = 6;

export type TodoActivity = { elapsed?: string; tokens?: number; effort?: string };

/** Claude-style summary, derived from the same task array that renders the rows. */
export function taskSummary(todos: TodoItem[]): string {
  const done = todos.filter((item) => item.status === "done").length;
  const running = todos.filter((item) => item.status === "in_progress").length;
  const open = todos.length - done - running;
  return `${todos.length} ${todos.length === 1 ? "task" : "tasks"} (${done} done, ${running} in progress, ${open} open)`;
}

function compactTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

/** The parenthetical after the headline: elapsed, turn tokens, reasoning effort.
 *  Each part is optional so the panel still reads before the turn reports cost. */
export function activityMeta(activity: TodoActivity | undefined): string {
  if (!activity) return "";
  const parts = [
    activity.elapsed,
    activity.tokens ? `↓ ${compactTokens(activity.tokens)} tokens` : "",
    activity.effort ? `${activity.effort} effort` : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

/** The headline: what the agent is doing now, else the plan's shape. */
export function headline(todos: TodoItem[]): string {
  const active = todos.find((todo) => todo.status === "in_progress");
  return active ? `${displayLabel(active)}…` : taskSummary(todos);
}

export function TodoPanel(props: { todos: TodoItem[]; activity?: TodoActivity }): ReactElement | null {
  if (props.todos.length === 0) return null;
  // Preserve authored task order so the checklist remains a stable mental model.
  // Bound height so the live region cannot grow past the viewport and ghost.
  const shown = visibleTasks(props.todos);
  const extra = props.todos.length - shown.length;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={ACTIVITY}>✻ </Text>
        <Text bold>{headline(props.todos)}</Text>
        <Text dimColor>{activityMeta(props.activity)}</Text>
      </Text>
      {shown.map((todo, index) => <TodoRow key={`${index}:${todo.text}`} todo={todo} first={index === 0} />)}
      {extra > 0 ? <Text dimColor>    … {extra} more</Text> : null}
    </Box>
  );
}

/** Keep authored order, but never truncate away the one active task. */
export function visibleTasks(todos: TodoItem[]): TodoItem[] {
  const shown = todos.slice(0, MAX_ROWS);
  if (shown.some((todo) => todo.status === "in_progress")) return shown;
  const active = todos.slice(MAX_ROWS).find((todo) => todo.status === "in_progress");
  if (!active || shown.length === 0) return shown;
  return [...shown.slice(0, -1), active];
}

function TodoRow(props: { todo: TodoItem; first: boolean }): ReactElement {
  const { todo, first } = props;
  const done = todo.status === "done";
  const running = todo.status === "in_progress";
  const mark = done ? "✓" : running ? "■" : "□";
  return (
    <Box>
      <Text dimColor>{first ? "  └ " : "    "}</Text>
      <Text color={running ? ACTIVITY : BONE} dimColor={!running}>{mark} </Text>
      <Text bold={running} dimColor={!running} strikethrough={done}>{displayLabel(todo)}</Text>
    </Box>
  );
}
