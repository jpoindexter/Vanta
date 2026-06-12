import { type ReactElement } from "react";
import { Text } from "ink";

// StatusChip — a background-filled label block, the design-language chip from
// docs/design-refs/tui-demo.html (● ready · ⚡auto · REVIEW). The background is
// applied to the label EXACTLY as given, with no added padding, so callers keep
// precise control of width — the status bar depends on this to never wrap (an
// unexpected status-line wrap is the alt-screen ghost-frame class — see ERRORS.md).

export function StatusChip(props: { label: string; bg: string; fg?: string }): ReactElement {
  return (
    <Text backgroundColor={props.bg} color={props.fg ?? "black"}>
      {props.label}
    </Text>
  );
}
