import { type ReactElement } from "react";
import { Box, Text } from "ink";
import type { Entry } from "./types.js";
import { FOCUS } from "../term/palette.js";
import {
  renderSelectionPreview,
  selectedTranscriptText,
  transcriptPlainText,
  type TranscriptSelection,
} from "./transcript-selection.js";

export function TranscriptSelectionPanel(props: { entries: readonly Entry[]; selection: TranscriptSelection | null }): ReactElement | null {
  if (!props.selection) return null;
  const selected = selectedTranscriptText(props.entries, props.selection);
  if (!selected) return null;
  const text = transcriptPlainText(props.entries);
  const preview = clipAroundSelection(renderSelectionPreview(text, props.selection), 220);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={FOCUS}>  transcript selection <Text dimColor>Shift+arrows extend · Ctrl+C copies</Text></Text>
      <Text>
        {"  "}
        {preview.map((seg, i) => (
          <Text key={i} inverse={seg.selected}>{seg.text.replace(/\n/g, "↵")}</Text>
        ))}
      </Text>
    </Box>
  );
}

function clipAroundSelection(segments: Array<{ text: string; selected: boolean }>, max: number): Array<{ text: string; selected: boolean }> {
  const selectedIndex = segments.findIndex((seg) => seg.selected);
  if (selectedIndex < 0) return [{ text: "", selected: false }];
  const selected = segments[selectedIndex]!;
  const side = Math.max(20, Math.floor((max - selected.text.length) / 2));
  const before = (segments[selectedIndex - 1]?.text ?? "").slice(-side);
  const after = (segments[selectedIndex + 1]?.text ?? "").slice(0, side);
  return [
    before && { text: `…${before}`, selected: false },
    selected,
    after && { text: `${after}…`, selected: false },
  ].filter(Boolean) as Array<{ text: string; selected: boolean }>;
}
