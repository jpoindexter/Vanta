import { useMemo, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { Dialog } from "./components/dialog.js";
import {
  buildExportDialogData,
  DEFAULT_EXPORT_OPTIONS,
  nextExportFormat,
  toggleExportDestination,
  writeConversationExport,
  type ExportContext,
  type ExportOptions,
  type ExportResult,
} from "./export-actions.js";
import { FOCUS, HEALTH } from "../term/palette.js";

type Row = "format" | "tools" | "thinking" | "destination" | "export";
const ROWS: Row[] = ["format", "tools", "thinking", "destination", "export"];

function rowText(row: Row, options: ExportOptions): string {
  if (row === "format") return `Format: ${options.format}`;
  if (row === "tools") return `Tool calls/results: ${options.includeTools ? "included" : "hidden"}`;
  if (row === "thinking") return `Thinking text: ${options.includeThinking ? "included" : "hidden"}`;
  if (row === "destination") return `Destination: ${options.destination}`;
  return "Export";
}

function applyRow(row: Row, options: ExportOptions): ExportOptions {
  if (row === "format") return { ...options, format: nextExportFormat(options.format) };
  if (row === "tools") return { ...options, includeTools: !options.includeTools };
  if (row === "thinking") return { ...options, includeThinking: !options.includeThinking };
  if (row === "destination") return { ...options, destination: toggleExportDestination(options.destination) };
  return options;
}

export function ExportDialog(props: { repoRoot: string; context: ExportContext; onClose: () => void }): ReactElement {
  const [selected, setSelected] = useState(0);
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [result, setResult] = useState<ExportResult | null>(null);
  const data = useMemo(() => buildExportDialogData(props.repoRoot, props.context, options), [props.repoRoot, props.context, options]);

  useInput((input, key) => {
    if (key.escape) return props.onClose();
    if (key.upArrow) return setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) return setSelected((s) => Math.min(ROWS.length - 1, s + 1));
    if (input === "f") return setOptions((o) => ({ ...o, format: nextExportFormat(o.format) }));
    if (input === "t") return setOptions((o) => ({ ...o, includeTools: !o.includeTools }));
    if (input === "i") return setOptions((o) => ({ ...o, includeThinking: !o.includeThinking }));
    if (input === "c") return setOptions((o) => ({ ...o, destination: toggleExportDestination(o.destination) }));
    if (key.return) {
      const row = ROWS[selected]!;
      if (row !== "export") return setOptions((o) => applyRow(row, o));
      void writeConversationExport(props.repoRoot, data).then(setResult).catch((err) => setResult({ ok: false, message: err instanceof Error ? err.message : String(err) }));
    }
  });

  return (
    <Dialog title="Export conversation">
      <Box flexDirection="column">
        {ROWS.map((row, i) => (
          <Text key={row}>
            <Text color={i === selected ? FOCUS : undefined}>{i === selected ? "❯ " : "  "}</Text>
            {rowText(row, options)}
          </Text>
        ))}
        <Text dimColor>  ↑↓ select · Enter change/export · f format · t tools · i thinking · c destination · Esc close</Text>
        <Text dimColor>  Preview</Text>
        {data.preview.map((line, i) => <Text key={i} dimColor>{`  ${line || " "}`}</Text>)}
        <Text dimColor>{`  ${data.file}`}</Text>
        {result ? <Text color={result.ok ? HEALTH : "red"}>{`  ${result.message}`}</Text> : null}
      </Box>
    </Dialog>
  );
}
