import { type ReactElement } from "react";
import { Box, Text } from "ink";
import type { TodoItem } from "../todo/store.js";
import { displayLabel } from "../tools/todo-active-form.js";

// The agent's live plan. Lives in the live region (not <Static>) so it updates in
// place as the agent rewrites the todo list mid-turn. A completed plan remains as
// turn evidence until the next turn begins, when the reducer clears it.

const MAX_ROWS = 6;

/** Claude-style summary, derived from the same task array that renders the rows. */
export function taskSummary(todos: TodoItem[]): string {
  const done = todos.filter((item) => item.status === "done").length;
  const running = todos.filter((item) => item.status === "in_progress").length;
  const open = todos.length - done - running;
  return `${todos.length} ${todos.length === 1 ? "task" : "tasks"} (${done} done, ${running} in progress, ${open} open)`;
}

export function TodoPanel(props: { todos: TodoItem[] }): ReactElement | null {
  if (props.todos.length === 0) return null;
  // Preserve authored task order so the checklist remains a stable mental model.
  // Bound height so the live region cannot grow past the viewport and ghost.
  const shown = visibleTasks(props.todos);
  const extra = props.todos.length - shown.length;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{taskSummary(props.todos)}</Text>
      {shown.map((todo, index) => <TodoRow key={`${index}:${todo.text}`} todo={todo} />)}
      {extra > 0 ? <Text dimColor>  … {extra} more</Text> : null}
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

function TodoRow(props: { todo: TodoItem }): ReactElement {
  const { todo } = props;
  const mark = todo.status === "done" ? "✓" : todo.status === "in_progress" ? "■" : "□";
  const color = todo.status === "done" ? "cyan" : todo.status === "in_progress" ? "yellow" : undefined;
  return (
    <Box>
      <Text color={color} dimColor={todo.status === "pending"}>{mark} </Text>
      <Text bold={todo.status === "in_progress"} dimColor={todo.status === "pending"}>{displayLabel(todo)}</Text>
    </Box>
  );
}
