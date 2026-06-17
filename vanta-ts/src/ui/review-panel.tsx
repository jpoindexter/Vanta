import { useEffect, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { fileDiff, undoFile, type ChangedFile } from "../repl/changed-files.js";

// Interactive edit-review: the session's changed files with per-file keep/undo.
// ↑/↓ select, the selected file's diff previews below, `u` undoes it (restore to
// HEAD for a tracked file, delete for an untracked one — the keypress is the
// explicit per-action consent), Esc closes. Lives in the live region (its own
// keys), like the approval prompt.

const DIFF_ROWS = 12;
const MAX_W = 92;

export function ReviewPanel(props: { files: ChangedFile[]; cwd: string; onClose: () => void }): ReactElement {
  const [files, setFiles] = useState<ChangedFile[]>(props.files);
  const [sel, setSel] = useState(0);
  const [diff, setDiff] = useState("");
  const clamped = Math.min(sel, Math.max(0, files.length - 1));
  const current = files[clamped];

  useEffect(() => {
    let live = true;
    if (current) void fileDiff(props.cwd, current.file).then((d) => live && setDiff(d)).catch(() => {});
    else setDiff("");
    return () => { live = false; };
  }, [props.cwd, current?.file]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = (): void => {
    const f = files[clamped];
    if (!f) return;
    void undoFile(props.cwd, f.file).then((r) => r.ok && setFiles((fs) => fs.filter((x) => x.file !== f.file))).catch(() => {});
  };

  useInput((input, key) => {
    if (key.escape) return void props.onClose();
    if (key.upArrow) return void setSel(Math.max(0, clamped - 1));
    if (key.downArrow) return void setSel(Math.min(files.length - 1, clamped + 1));
    if (input === "u") undo();
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Review changes · {files.length} file{files.length === 1 ? "" : "s"}</Text>
      {files.length === 0
        ? <Text>  (no changes — working tree clean)</Text>
        : files.map((f, i) => <FileRow key={f.file} file={f} active={i === clamped} />)}
      {current ? <DiffPreview diff={diff} /> : null}
      <Text>  ↑/↓ select · u undo (restore to HEAD) · Esc close</Text>
    </Box>
  );
}

function statusColor(_status: ChangedFile["status"]): string {
  return "white";
}

function FileRow(props: { file: ChangedFile; active: boolean }): ReactElement {
  const { file, active } = props;
  return (
    <Box>
      <Text>{active ? "❯ " : "  "}</Text>
      <Text>{file.status} </Text>
      <Text>{file.file}</Text>
      <Text>  +{file.added}</Text>
      <Text> -{file.removed}</Text>
    </Box>
  );
}

function DiffPreview(props: { diff: string }): ReactElement | null {
  const lines = props.diff.split("\n").filter((l) => l.length > 0).slice(0, DIFF_ROWS);
  if (lines.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      {lines.map((l, i) => <DiffLineView key={i} line={l} />)}
    </Box>
  );
}

function DiffLineView(props: { line: string }): ReactElement {
  const l = clip(props.line, MAX_W);
  if (l.startsWith("+")) return <Text>  {l}</Text>;
  if (l.startsWith("-")) return <Text>  {l}</Text>;
  if (l.startsWith("@@")) return <Text>  {l}</Text>;
  return <Text>  {l}</Text>;
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
