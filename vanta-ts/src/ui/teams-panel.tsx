import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { createStarterWorker, reloadTeams, updateWorkerStatus, type TeamsData } from "./teams-actions.js";
import { teamSummary, teamsKeyAction, toTeamWorkerRow, type TeamWorkerRow, type TeamsKeyAction } from "./team-rows.js";
import { tasksForWorker } from "../team/tasks.js";
import type { Worker } from "../team/store.js";

export function TeamsPanel(props: { data: TeamsData; onClose: () => void }): ReactElement {
  const [data, setData] = useState<TeamsData>(props.data);
  const [sel, setSel] = useState(0);
  const [detail, setDetail] = useState(false);
  const [note, setNote] = useState("");
  const workers = data.workers;
  const clamped = Math.min(sel, Math.max(0, workers.length - 1));
  const current = workers[clamped];

  const applyResult = (run: Promise<{ ok: true; data: TeamsData; note: string } | { ok: false; error: string }>): void => {
    void run.then((r) => {
      if (!r.ok) return setNote(r.error);
      setData(r.data);
      setNote(r.note);
    }).catch((e: unknown) => setNote(String(e)));
  };

  const apply = (action: TeamsKeyAction): void => {
    switch (action.kind) {
      case "close": return props.onClose();
      case "openDetail": return setDetail(true);
      case "closeDetail": return setDetail(false);
      case "move": return setSel(action.to);
      case "create": return applyResult(createStarterWorker());
      case "refresh": return void reloadTeams().then((fresh) => { setData(fresh); setNote("refreshed"); }).catch((e: unknown) => setNote(String(e)));
      case "status": return current ? applyResult(updateWorkerStatus(current, action.status)) : setNote("select a worker first");
      default: return;
    }
  };

  useInput((input, key) => apply(teamsKeyAction(input, key, { detail, sel: clamped, count: workers.length })));

  if (detail && current) return <TeamDetail worker={current} tasks={data.tasks} note={note} />;
  return <TeamList data={data} clamped={clamped} note={note} />;
}

function TeamList(props: { data: TeamsData; clamped: number; note: string }): ReactElement {
  const rows = props.data.workers.map((w) => toTeamWorkerRow(w, props.data.tasks));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Teams · {teamSummary(props.data.workers, props.data.tasks)}</Text>
      {rows.length === 0
        ? <Text>  (no workers — n creates a starter worker)</Text>
        : rows.map((row, i) => <TeamRowView key={row.id} row={row} active={i === props.clamped} />)}
      {props.note ? <Text>  {props.note}</Text> : null}
      <Text>  ↑/↓ select · ⏎ detail · n new · i idle · b blocked · d done · r refresh · Esc close</Text>
    </Box>
  );
}

function TeamRowView(props: { row: TeamWorkerRow; active: boolean }): ReactElement {
  const row = props.row;
  const task = row.openTasks ? ` · ${row.openTasks} open${row.runningTitle ? ` · ${row.runningTitle}` : ""}` : "";
  const note = row.note ? ` — ${row.note}` : "";
  return (
    <Box>
      <Text>{props.active ? "❯ " : "  "}</Text>
      <Text color={row.runtime === "running" ? "#ffb86b" : row.runtime === "idle" ? "#83f2b0" : "white"}>◆ </Text>
      <Text>{row.id} </Text>
      <Text dimColor>{row.role} </Text>
      <Text>{row.runtime}</Text>
      <Text dimColor>{row.storedStatus !== row.runtime ? ` · set ${row.storedStatus}` : ""}{task}{note}</Text>
    </Box>
  );
}

function TeamDetail(props: { worker: Worker; tasks: TeamsData["tasks"]; note: string }): ReactElement {
  const tasks = tasksForWorker(props.tasks, props.worker.id).slice(0, 8);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Worker {props.worker.id}</Text>
      <Text>  role    {props.worker.role}</Text>
      <Text>  status  {props.worker.status}</Text>
      {props.worker.model ? <Text>  model   {props.worker.model}</Text> : null}
      {props.worker.tools?.length ? <Text>  tools   {props.worker.tools.join(", ")}</Text> : null}
      {props.worker.note ? <Text>  note    {props.worker.note}</Text> : null}
      <Text>  tasks</Text>
      {tasks.length ? tasks.map((t) => <Text key={t.id}>    {t.status.padEnd(8)} {t.id} · {t.title}</Text>) : <Text>    (none)</Text>}
      {props.note ? <Text>  {props.note}</Text> : null}
      <Text>  Esc back</Text>
    </Box>
  );
}
