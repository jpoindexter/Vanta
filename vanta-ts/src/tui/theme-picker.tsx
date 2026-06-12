import { useState, useEffect, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { Overlay, OverlayRow } from "./overlay.js";
import { THEME_NAMES } from "./theme.js";
import type { OverlayKind } from "./use-overlays.js";

// The /theme picker — an interactive menu over the real themes with LIVE
// preview: arrowing applies the theme immediately so the whole UI (this
// overlay's own border + accent included) restyles as you move. ⏎ keeps the
// highlighted theme; Esc reverts to the one the picker opened with.

export function ThemePicker(props: {
  current: string;
  width: number;
  isActive?: boolean;
  onApply: (name: string) => void;
  onClose: () => void;
}): ReactElement {
  const [original] = useState(props.current);
  const [sel, setSel] = useState(() => Math.max(0, THEME_NAMES.indexOf(props.current)));

  // Apply on every selection change — this is what makes the preview live.
  useEffect(() => { props.onApply(THEME_NAMES[sel]!); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  useInput(
    (_in, key) => {
      if (key.escape) { props.onApply(original); props.onClose(); return; }
      if (key.upArrow) setSel((s) => (s - 1 + THEME_NAMES.length) % THEME_NAMES.length);
      else if (key.downArrow) setSel((s) => (s + 1) % THEME_NAMES.length);
      else if (key.return) props.onClose();
    },
    { isActive: props.isActive ?? true },
  );

  return (
    <Overlay title="Theme" hint="↑↓ preview live · ⏎ keep · Esc cancel" keys="the whole UI restyles as you move" width={props.width}>
      {THEME_NAMES.map((t, i) => (
        <OverlayRow
          key={t}
          selected={i === sel}
          mark={t === original ? "●" : "·"}
          markColor={t === original ? "green" : "gray"}
          label={t}
          meta={t === original ? "opened with" : undefined}
        />
      ))}
    </Overlay>
  );
}

/** Bottom-chrome wrapper for the theme overlay — lives here (not app.tsx) so the
 * App file stays under the size gate. */
export function ChromeTheme(p: { themeName: string; setTheme: (n: string) => void; setOverlay: (o: OverlayKind) => void; w: number }): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <ThemePicker current={p.themeName} width={p.w} onApply={p.setTheme} onClose={() => p.setOverlay(null)} />
      <Box borderStyle="round" borderColor="gray" paddingX={1} width={p.w}>
        <Text dimColor>{"› "}choosing theme — changes apply live…</Text>
      </Box>
    </Box>
  );
}
