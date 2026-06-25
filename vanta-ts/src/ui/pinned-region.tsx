import { type ReactElement, type ReactNode } from "react";
import { Box } from "ink";

// Bottom-pins the live region (composer + footer + live tail) to the terminal
// floor — the "real chat box" feel. A minHeight box reserves the space below the
// committed transcript; a flexGrow spacer at the top pushes the children to the
// bottom edge. Crucially minHeight = viewport − committed stays UNDER the full
// viewport height (committed always includes the banner), so Ink keeps its inline
// render path and native <Static> scrollback is preserved (a full-viewport region
// would trip Ink's fullscreen-clear, which wipes scrollback).
//
// Self-adjusting: once committed content reaches the viewport, minHeight clamps to
// 0, the spacer collapses, and the composer flows naturally just below the latest
// line (where inline rendering already puts it at the bottom).
//
// DEFAULT is "bottom" — the input rides the terminal floor (chat-box feel) so the
// composer isn't stranded mid-screen with dead space below it. `VANTA_COMPOSER_ANCHOR=float`
// or `/composer float` opts back into the float behavior (composer just below the last line).

export type ComposerAnchor = "float" | "bottom";

/** Resolve the composer anchor from env. Default "bottom" (input pinned to the floor). */
export function resolveComposerAnchor(env: NodeJS.ProcessEnv): ComposerAnchor {
  return env.VANTA_COMPOSER_ANCHOR?.trim().toLowerCase() === "float" ? "float" : "bottom";
}

export function pinSpacerHeight(viewportRows: number, committedRows: number): number {
  return Math.max(0, viewportRows - committedRows);
}

export function PinnedRegion(props: { enabled?: boolean; viewportRows: number; committedRows: number; children: ReactNode }): ReactElement {
  if (props.enabled === false) return <Box flexDirection="column">{props.children}</Box>;
  const minHeight = pinSpacerHeight(props.viewportRows, props.committedRows);
  return (
    <Box flexDirection="column" minHeight={minHeight}>
      <Box flexGrow={1} />
      {props.children}
    </Box>
  );
}
