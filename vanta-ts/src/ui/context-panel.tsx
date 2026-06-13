import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme.js";
import { contextBar, kfmt } from "./busy.js";
import type { CtxCategory } from "./context-breakdown.js";

// Read-only context-usage breakdown panel. Esc closes. Data comes from the
// parent (no fetching here). Renders a bar per category using accent colour.

const LABEL_WIDTH = 16;

export function ContextPanel(props: {
  categories: CtxCategory[];
  total: number;
  contextWindow: number;
  onClose: () => void;
}): ReactElement {
  const { categories, total, contextWindow, onClose } = props;
  const t = useTheme();

  useInput((_input, key) => {
    if (key.escape) onClose();
  });

  const pct = contextWindow > 0 ? Math.round((total / contextWindow) * 100) : 0;
  const title = `Context  ${kfmt(total)}/${kfmt(contextWindow)}  (${pct}%)`;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={t.accent} bold>{title}</Text>
      <Text> </Text>
      {categories.length === 0 ? (
        <Text dimColor={t.dimText}>(context is empty)</Text>
      ) : (
        categories.map((cat) => {
          const catPct = total > 0 ? Math.round((cat.tokens / total) * 100) : 0;
          const bar = contextBar(catPct, 12);
          const label = cat.label.padEnd(LABEL_WIDTH);
          return (
            <Text key={cat.label}>
              <Text>{label}</Text>
              <Text color={t.accent}>{bar}</Text>
              <Text>{"  "}</Text>
              <Text dimColor={t.dimText}>{kfmt(cat.tokens)}  {catPct}%</Text>
            </Text>
          );
        })
      )}
      <Text> </Text>
      <Text dimColor={t.dimText}>  Esc close</Text>
    </Box>
  );
}
