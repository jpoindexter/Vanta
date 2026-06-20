import { useState, type ReactElement, type ReactNode } from "react";
import { Box, Text, useInput } from "ink";

// Progressive disclosure: a header that ratchets a body open/closed. A click-once
// reveal (Enter/Space toggles) — collapsed shows a ▸ chevron + summary, expanded
// shows a ▾ chevron + the body. Defaults to collapsed (`defaultOpen`). Open state
// is internal but reportable via `onToggle`; keyboard is opt-out via `isActive`.

const CLOSED = "▸";
const OPEN = "▾";

export function Ratchet(props: {
  summary: string;
  children?: ReactNode;
  defaultOpen?: boolean;
  isActive?: boolean;
  onToggle?: (open: boolean) => void;
}): ReactElement {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const toggle = (): void => setOpen((o) => { props.onToggle?.(!o); return !o; });
  useInput(
    (input, key) => { if (key.return || input === " ") toggle(); },
    { isActive: props.isActive ?? true },
  );
  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{open ? OPEN : CLOSED} </Text>
        <Text>{props.summary}</Text>
      </Box>
      {open ? <Box flexDirection="column" marginLeft={2}>{props.children}</Box> : null}
    </Box>
  );
}
