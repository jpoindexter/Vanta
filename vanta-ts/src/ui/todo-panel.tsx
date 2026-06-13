import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.js";
import type { TodoItem } from "../todo/store.js";

// The agent's live plan. Lives in the live region (not <Static>) so it updates in
// place as the agent rewrites the todo list mid-turn, then quietly disappears
// when the plan is cleared. Done count in the header.

export function TodoPanel(props: { todos: TodoItem[] }): ReactElement | null {
  const t = useTheme();
  if (props.todos.length === 0) return null;
  const done = props.todos.filter((x) => x.status === "done").length;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor={t.dimText}>plan · {done}/{props.todos.length} done</Text>
      {props.todos.map((x, i) => <TodoRow key={i} todo={x} />)}
    </Box>
  );
}

function TodoRow(props: { todo: TodoItem }): ReactElement {
  const { todo } = props;
  const t = useTheme();
  const mark = todo.status === "done" ? "✓" : todo.status === "in_progress" ? "▸" : "○";
  const color = todo.status === "done" ? t.success : todo.status === "in_progress" ? t.accent : undefined;
  return (
    <Box>
      <Text color={color}>  {mark} </Text>
      <Text dimColor={todo.status === "done"}>{todo.text}</Text>
    </Box>
  );
}
