import { type ReactElement } from "react";
import { Box, Text } from "inkr";
import type { TodoItem } from "../todo/store.js";

// The agent's live plan. Lives in the live region (not <Static>) so it updates in
// place as the agent rewrites the todo list mid-turn, then quietly disappears
// when the plan is cleared. Done count in the header.

export function TodoPanel(props: { todos: TodoItem[] }): ReactElement | null {
  if (props.todos.length === 0) return null;
  const done = props.todos.filter((t) => t.status === "done").length;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>plan · {done}/{props.todos.length} done</Text>
      {props.todos.map((t, i) => <TodoRow key={i} todo={t} />)}
    </Box>
  );
}

function TodoRow(props: { todo: TodoItem }): ReactElement {
  const { todo } = props;
  const mark = todo.status === "done" ? "✓" : todo.status === "in_progress" ? "▸" : "○";
  const color = todo.status === "done" ? "green" : todo.status === "in_progress" ? "cyan" : undefined;
  return (
    <Box>
      <Text color={color}>  {mark} </Text>
      <Text dimColor={todo.status === "done"}>{todo.text}</Text>
    </Box>
  );
}
