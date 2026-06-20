import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { FOCUS } from "../../term/palette.js";

// A tabbed pane header. ←/→ move the active tab; the active label is inverse +
// accent-colored, the rest dim. Selection is controlled — the parent owns the
// index and `onChange` reports a new one (so it composes with external state).
// Keyboard nav is opt-out via `isActive` (e.g. when a modal owns input).

export type Tab = { id: string; label: string };

export function Tabs(props: {
  tabs: Tab[];
  active: number;
  onChange?: (index: number) => void;
  isActive?: boolean;
}): ReactElement {
  const last = props.tabs.length - 1;
  const clamped = Math.max(0, Math.min(props.active, last));
  useInput(
    (_input, key) => {
      if (key.leftArrow && clamped > 0) props.onChange?.(clamped - 1);
      else if (key.rightArrow && clamped < last) props.onChange?.(clamped + 1);
    },
    { isActive: props.isActive ?? true },
  );
  return (
    <Box>
      {props.tabs.map((tab, i) => (
        <TabLabel key={tab.id} label={tab.label} active={i === clamped} first={i === 0} />
      ))}
    </Box>
  );
}

function TabLabel(props: { label: string; active: boolean; first: boolean }): ReactElement {
  return (
    <Box>
      {props.first ? null : <Text dimColor>{"  "}</Text>}
      <Text inverse={props.active} color={props.active ? FOCUS : undefined} dimColor={!props.active}>
        {` ${props.label} `}
      </Text>
    </Box>
  );
}
