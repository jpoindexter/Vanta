import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { toTaskRow, detailLines, tasksKeyAction, type TaskRow, type TasksKeyAction } from "./task-rows.js";
import { stopWorkerTask, respawnWorkerTask } from "./tasks-actions.js";
import type { WorkerTask } from "../team/tasks.js";

// Inline panel for /agents: a live list of all background tasks (agent/shell/
// remote) with status badge + elapsed. ↑/↓ select, ⏎ opens the detail view with
// the task's full output log, s stops a running/assigned task, r respawns a
// terminal one. Self-contained like ReviewPanel — holds its own task state and
// drives the team-task store, re-reading after each action (the keypress is the
// explicit consent). Key→action mapping is the pure tasksKeyAction helper.

const LOG_ROWS = 16;

export function TasksPanel(props: { tasks: WorkerTask[]; onClose: () => void; initialDetail?: boolean }): ReactElement {
  const [tasks, setTasks] = useState<WorkerTask[]>(props.tasks);
  const [sel, setSel] = useState(0);
  const [detail, setDetail] = useState(props.initialDetail ?? false);
  const [note, setNote] = useState("");
  const now = new Date();
  const clamped = Math.min(sel, Math.max(0, tasks.length - 1));
  const current = tasks[clamped];

  const runAction = (kind: "stop" | "respawn"): void => {
    if (!current) return;
    const run = kind === "stop" ? stopWorkerTask : respawnWorkerTask;
    void run(current).then((r) => {
      if (r.ok) { setTasks(r.tasks); setNote(`${kind === "stop" ? "stopped" : "respawned"} ${current.id}`); }
      else setNote(r.error);
    }).catch((e: unknown) => setNote(String(e)));
  };

  const apply = (action: TasksKeyAction): void => {
    switch (action.kind) {
      case "close": return props.onClose();
      case "openDetail": return setDetail(true);
      case "closeDetail": return setDetail(false);
      case "move": return setSel(action.to);
      case "stop": return runAction("stop");
      case "respawn": return runAction("respawn");
      case "rejectStop": return setNote(`cannot stop a ${action.status} task`);
      case "rejectRespawn": return setNote(`cannot respawn a ${action.status} task`);
      default: return;
    }
  };

  useInput((input, key) => apply(tasksKeyAction(input, key, { detail, sel: clamped, count: tasks.length, current })));

  if (detail && current) return <TaskDetail task={current} note={note} />;
  return <TaskList tasks={tasks} clamped={clamped} now={now} note={note} />;
}

function TaskList(props: { tasks: WorkerTask[]; clamped: number; now: Date; note: string }): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Agents · {props.tasks.length} task{props.tasks.length === 1 ? "" : "s"}</Text>
      {props.tasks.length === 0
        ? <Text>  (no background tasks — dispatch one with the team tool)</Text>
        : props.tasks.map((t, i) => <TaskRowView key={t.id} row={toTaskRow(t, props.now)} active={i === props.clamped} />)}
      {props.note ? <Text>  {props.note}</Text> : null}
      <Text>  ↑/↓ select · ⏎ detail · s stop · r respawn · Esc close</Text>
    </Box>
  );
}

function TaskRowView(props: { row: TaskRow; active: boolean }): ReactElement {
  const { row, active } = props;
  return (
    <Box>
      <Text>{active ? "❯ " : "  "}</Text>
      <Text color={row.statusColor}>{row.statusGlyph} </Text>
      <Text>{row.typeBadge.padEnd(8)} </Text>
      <Text>{row.status.padEnd(8)} </Text>
      <Text dimColor>{row.elapsed.padStart(7)}  </Text>
      <Text>{row.title}</Text>
    </Box>
  );
}

function TaskDetail(props: { task: WorkerTask; note: string }): ReactElement {
  const lines = detailLines(props.task).slice(0, LOG_ROWS);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Task {props.task.id}</Text>
      {lines.map((l, i) => <Text key={i} dimColor={l.startsWith("(")}>  {l}</Text>)}
      {props.note ? <Text>  {props.note}</Text> : null}
      <Text>  Esc back</Text>
    </Box>
  );
}
