import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { persistOutputStyle, type OutputStyleData, type OutputStyleOption } from "./output-style-actions.js";

export function OutputStylePanel(props: { repoRoot: string; data: OutputStyleData; onClose: () => void }): ReactElement {
  const [data, setData] = useState(props.data);
  const [sel, setSel] = useState(Math.max(0, data.options.findIndex((o) => o.name.toLowerCase() === data.active.toLowerCase())));
  const [note, setNote] = useState("");
  const clamped = Math.min(sel, Math.max(0, data.options.length - 1));
  const current = data.options[clamped];

  const apply = (): void => {
    if (!current) return;
    void persistOutputStyle(props.repoRoot, current.name).then((next) => {
      setData(next);
      setNote(`applied ${current.name}`);
    }).catch((e: unknown) => setNote(String(e)));
  };

  useInput((_input, key) => {
    if (key.escape) return props.onClose();
    if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSel((i) => Math.min(data.options.length - 1, i + 1));
    if (key.return) return apply();
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Output style</Text>
      {data.options.map((option, i) => <StyleRow key={option.name} option={option} selected={i === clamped} active={option.name.toLowerCase() === data.active.toLowerCase()} />)}
      {current ? <Preview option={current} /> : <Text>  (no output styles found)</Text>}
      {note ? <Text>  {note}</Text> : null}
      <Text>  ↑/↓ preview · ⏎ apply · Esc close</Text>
    </Box>
  );
}

function StyleRow(props: { option: OutputStyleOption; selected: boolean; active: boolean }): ReactElement {
  const mark = props.active ? "●" : " ";
  const source = props.option.builtin ? "built-in" : "custom";
  return (
    <Box>
      <Text>{props.selected ? "❯ " : "  "}</Text>
      <Text>{mark} </Text>
      <Text bold={props.selected}>{props.option.name}</Text>
      <Text dimColor>  {source}{props.option.description ? ` · ${props.option.description}` : ""}</Text>
    </Box>
  );
}

function Preview(props: { option: OutputStyleOption }): ReactElement {
  const line = props.option.body.split("\n").find((l) => l.trim()) ?? props.option.description;
  return <Text dimColor>  preview: {line.length > 100 ? `${line.slice(0, 99)}…` : line}</Text>;
}
