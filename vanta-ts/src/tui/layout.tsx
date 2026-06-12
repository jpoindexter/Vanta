import { type ReactElement, type MutableRefObject } from "react";
import { AlternateScreen, Box, ScrollBox, type ScrollBoxHandle } from "ink";

// The fullscreen slot composer. Two slots: a `scrollable` transcript region
// (line-based ScrollBox, stickyScroll, wheel via mouseTracking) and a pinned
// `bottom` chrome region (composer / modal overlay / approval). flexShrink=0 on
// the bottom slot guarantees the prompt zone is never squeezed by transcript
// overflow — Yoga would otherwise clip the composer (the upstream hermes
// pinning). Formalizing the slots keeps App a thin orchestrator and gives the
// v2 surfaces one place to compose against.

export function FullscreenLayout(props: {
  scrollRef: MutableRefObject<ScrollBoxHandle | null>;
  scrollable: ReactElement;
  bottom: ReactElement;
}): ReactElement {
  return (
    <AlternateScreen mouseTracking="wheel">
      <Box flexDirection="column" flexGrow={1}>
        <ScrollBox ref={props.scrollRef} flexDirection="column" flexGrow={1} flexShrink={1} stickyScroll>
          {props.scrollable}
        </ScrollBox>
        <Box flexDirection="column" flexShrink={0} flexGrow={0}>
          {props.bottom}
        </Box>
      </Box>
    </AlternateScreen>
  );
}
