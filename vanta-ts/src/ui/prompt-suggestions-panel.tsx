import { useEffect, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { focusIndicator } from "./focus.js";

export function PromptSuggestionsPanel(props: {
  suggestions: string[];
  focused: boolean;
  onSelect: (prompt: string) => void;
}): ReactElement | null {
  const [sel, setSel] = useState(0);
  const count = props.suggestions.length;
  useEffect(() => { setSel(0); }, [props.suggestions.join("\n")]);
  useInput((input, key) => {
    if (!props.focused || count === 0) return;
    if (key.upArrow) setSel((i) => (i + count - 1) % count);
    else if (key.downArrow) setSel((i) => (i + 1) % count);
    else if (key.return) props.onSelect(props.suggestions[sel]!);
    else if (/^[1-3]$/.test(input)) {
      const idx = Number(input) - 1;
      if (idx < count) props.onSelect(props.suggestions[idx]!);
    }
  });
  if (count === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>Next prompts</Text>
      {props.suggestions.map((suggestion, i) => (
        <Text key={suggestion} color={props.focused && i === sel ? "cyan" : undefined}>
          {focusIndicator(props.focused && i === sel)} {i + 1}. {suggestion}
        </Text>
      ))}
    </Box>
  );
}
