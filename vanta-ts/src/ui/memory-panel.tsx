import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { loadMemoryOverlayData, openMemoryFile, type MemoryOverlayData, type MemoryFileRow } from "./memory-actions.js";
import { FOCUS } from "../term/palette.js";

export function MemoryPanel(props: { repoRoot: string; data: MemoryOverlayData; onClose: () => void }): ReactElement {
  const [data, setData] = useState(props.data);
  const [sel, setSel] = useState(0);
  const [note, setNote] = useState("");
  const clamped = Math.min(sel, Math.max(0, data.rows.length - 1));
  const current = data.rows[clamped];

  const refresh = (): void => {
    void loadMemoryOverlayData(props.repoRoot).then((next) => {
      setData(next);
      setSel((i) => Math.min(i, Math.max(0, next.rows.length - 1)));
      setNote("refreshed memory files");
    }).catch((err: unknown) => setNote(String(err)));
  };

  const open = (): void => {
    if (!current) return;
    void openMemoryFile(current).then(setNote).catch((err: unknown) => setNote(String(err)));
  };

  useInput((input, key) => {
    if (key.escape) return props.onClose();
    if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSel((i) => Math.min(data.rows.length - 1, i + 1));
    if (key.return) return open();
    if (input === "r") return refresh();
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Memory files</Text>
      {data.rows.length === 0
        ? <Text>  (no memory files found)</Text>
        : data.rows.map((row, i) => <MemoryRow key={row.id} row={row} selected={i === clamped} />)}
      {current ? <Text dimColor>{`  ${current.path}`}</Text> : null}
      {note ? <Text>  {note}</Text> : null}
      <Text>  ↑/↓ select · ⏎ open in editor · r refresh · Esc close</Text>
    </Box>
  );
}

function MemoryRow(props: { row: MemoryFileRow; selected: boolean }): ReactElement {
  const source = props.row.source.padEnd(7);
  return (
    <Box>
      <Text>{props.selected ? "❯ " : "  "}</Text>
      <Text color={props.row.exists ? FOCUS : undefined}>{props.row.exists ? "● " : "○ "}</Text>
      <Text>{source} </Text>
      <Text bold={props.selected}>{props.row.label}</Text>
      <Text dimColor>{`  ${props.row.detail}`}</Text>
    </Box>
  );
}
