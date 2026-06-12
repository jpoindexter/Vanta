import { type ReactElement } from "react";
import { Text } from "ink";
import { overlayAccent } from "./overlay.js";

// Tabs — the design-language tab row from docs/design-refs/tui-demo.html. The
// active tab is an accent chip (dark on accent); the rest are dimmed, separated
// by a middot. Accent defaults to the active theme so it tracks /theme. Used as
// a step indicator in the model wizard; ready for any multi-view surface.

export function Tabs(props: { tabs: readonly string[]; active: number; accent?: string }): ReactElement {
  const accent = props.accent ?? overlayAccent(undefined);
  return (
    <Text>
      {props.tabs.map((label, i) => (
        <Text key={label}>
          {i === props.active ? (
            <Text backgroundColor={accent} color="black"> {label} </Text>
          ) : (
            <Text dimColor> {label} </Text>
          )}
          {i < props.tabs.length - 1 ? <Text dimColor>·</Text> : null}
        </Text>
      ))}
    </Text>
  );
}
