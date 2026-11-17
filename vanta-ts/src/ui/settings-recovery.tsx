import { type Dispatch, type ReactElement, type SetStateAction } from "react";
import { Box, Text, useInput } from "ink";
import { RISK } from "../term/palette.js";
import type { OverlayView } from "./use-overlay.js";

type SettingsCommand = "/config" | "/sandbox";
export type SettingsRecoveryView = { kind: "settingsRecovery"; command: SettingsCommand; error?: string };

export function settingsErrorMessage(error: unknown): string {
  // A failed reload does not prove that a preceding save did nothing.
  return error instanceof Error ? error.message.replace(/; nothing was written\.$/, ".") : "Check the settings file before trying again.";
}

/** Keep a pending settings load from reopening an overlay after navigation. */
export function openSettingsView(
  command: SettingsCommand,
  build: (update: (view: OverlayView) => void) => Promise<OverlayView>,
  publish: Dispatch<SetStateAction<OverlayView | null>>,
): void {
  const pending: SettingsRecoveryView = { kind: "settingsRecovery", command };
  let shown: OverlayView = pending;
  const update = (view: OverlayView): void => {
    const expected = shown; shown = view;
    publish((current) => current === expected ? view : current);
  };
  publish(pending);
  void build(update).then(update)
    .catch((error: unknown) => update({ ...pending, error: settingsErrorMessage(error) }));
}

export function SettingsChangeError(props: { error?: string; command: SettingsCommand }): ReactElement | null {
  if (!props.error) return null;
  return <Box flexDirection="column">
    <Text color={RISK}>Couldn't confirm the change. Previous values are still shown.</Text>
    <Text>{props.error}</Text>
    <Text>Close with Esc, repair the settings file, then reopen {props.command}.</Text>
  </Box>;
}

export function SettingsRecoveryPanel(props: SettingsRecoveryView & { onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape) props.onClose(); });
  return <Box flexDirection="column" marginBottom={1}>
    <Text bold color={props.error ? RISK : undefined}>{props.error ? "Couldn't open settings" : "Opening settings…"}</Text>
    {props.error ? <>
      <Text>{props.error}</Text>
      <Text>No settings were changed. Close with Esc, repair the settings file, then reopen {props.command}.</Text>
    </> : <Text>Esc close</Text>}
  </Box>;
}
