import type { ReactElement } from "react";
import { Box, Text } from "ink";
import { FOCUS, HEALTH, RISK } from "../term/palette.js";
import type { Settings } from "../settings/store.js";
import type { StatusReport } from "../status.js";
import { formatSessionCost, type SessionCost } from "../pricing.js";

// In-TUI settings panel (inline overlay) with three tabs:
//   Config  → the merged settings.json values, as key/value rows.
//   Status  → provider / kernel / store health lines.
//   Usage   → the session cost split (frontier $ vs local free).
// PURE RENDER: props in → frame out. No useInput/useState/I/O — the parent owns
// the live data read and the key that cycles the tab (see nextSettingsTab + the
// mount note at the bottom of this file). Literal Ink colors, no theme system.

export type SettingsTab = "config" | "status" | "usage";

const TABS: readonly SettingsTab[] = ["config", "status", "usage"];
const TAB_LABELS: Record<SettingsTab, string> = { config: "Config", status: "Status", usage: "Usage" };

/** Pure tab cycle: config → status → usage → config. The wire's key handler calls this. */
export function nextSettingsTab(tab: SettingsTab): SettingsTab {
  const i = TABS.indexOf(tab);
  return TABS[(i + 1) % TABS.length] as SettingsTab;
}

/** An unknown/garbage tab value falls back to config rather than rendering nothing. */
function normalizeTab(tab: SettingsTab): SettingsTab {
  return TABS.includes(tab) ? tab : "config";
}

export function SettingsPanel(props: {
  tab: SettingsTab;
  config: Settings;
  status: StatusReport;
  usage: SessionCost | undefined;
}): ReactElement {
  const active = normalizeTab(props.tab);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <TabHeader active={active} />
      <Text> </Text>
      <TabBody active={active} config={props.config} status={props.status} usage={props.usage} />
      <Text> </Text>
      <Text>  Tab switch tab · Esc close</Text>
    </Box>
  );
}

/** The 3 tab names in a row; the active one is marked with ▸ and the FOCUS accent. */
function TabHeader(props: { active: SettingsTab }): ReactElement {
  return (
    <Box>
      <Text bold>Settings  </Text>
      {TABS.map((t) => {
        const on = t === props.active;
        return (
          <Text key={t} color={on ? FOCUS : undefined} bold={on}>
            {on ? "▸ " : "  "}{TAB_LABELS[t]}{"  "}
          </Text>
        );
      })}
    </Box>
  );
}

function TabBody(props: {
  active: SettingsTab;
  config: Settings;
  status: StatusReport;
  usage: SessionCost | undefined;
}): ReactElement {
  if (props.active === "status") return <StatusBody status={props.status} />;
  if (props.active === "usage") return <UsageBody usage={props.usage} />;
  return <ConfigBody config={props.config} />;
}

/** A leaf settings value → a one-line string (objects/arrays compact-JSON'd). */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ConfigBody(props: { config: Settings }): ReactElement {
  const entries = Object.entries(props.config);
  if (entries.length === 0) {
    return <Text dimColor>  (no settings configured)</Text>;
  }
  return (
    <Box flexDirection="column">
      {entries.map(([key, value]) => (
        <Box key={key}>
          <Text>  {key.padEnd(22)}</Text>
          <Text color={FOCUS}>{valueText(value)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function StatusBody(props: { status: StatusReport }): ReactElement {
  const { status } = props;
  const present = status.keys.filter((k) => k.present).length;
  const goals = "error" in status.goals
    ? status.goals.error
    : `${status.goals.active} active / ${status.goals.total} total`;
  return (
    <Box flexDirection="column">
      <HealthLine label="kernel" ok={status.kernel.up} text={`${status.kernel.up ? "up" : "down"}  ${status.kernel.url}`} />
      <HealthLine
        label="provider"
        ok={status.provider.ok}
        text={status.provider.ok
          ? `${status.provider.id} · ${status.provider.model ?? "?"}`
          : `${status.provider.id} — ${status.provider.error ?? "unavailable"}`}
      />
      <HealthLine label="api keys" ok={present > 0} text={`${present}/${status.keys.length} present`} />
      <Box>
        <Text>  {"store".padEnd(10)}</Text>
        <Text>{status.store.skills} skill(s) · {status.store.memories} memory file(s)</Text>
      </Box>
      <Box>
        <Text>  {"goals".padEnd(10)}</Text>
        <Text>{goals}</Text>
      </Box>
    </Box>
  );
}

function HealthLine(props: { label: string; ok: boolean; text: string }): ReactElement {
  return (
    <Box>
      <Text color={props.ok ? HEALTH : RISK}>{props.ok ? "✓" : "✗"} </Text>
      <Text>{props.label.padEnd(10)}</Text>
      <Text>{props.text}</Text>
    </Box>
  );
}

function UsageBody(props: { usage: SessionCost | undefined }): ReactElement {
  const c = props.usage;
  if (!c || (c.localTurns === 0 && c.frontierTurns === 0)) {
    return <Text dimColor>  (no turns yet)</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text>  {formatSessionCost(c).replace(/^session cost: /, "")}</Text>
      <Box>
        <Text>  {"frontier".padEnd(10)}</Text>
        <Text color={FOCUS}>{c.frontierTurns} turn(s) metered</Text>
      </Box>
      <Box>
        <Text>  {"local".padEnd(10)}</Text>
        <Text color={HEALTH}>{c.localTurns} turn(s) free</Text>
      </Box>
    </Box>
  );
}

// WIRE (not done this round — the live data + cycle key):
//   ui/app.tsx mounts the existing inline overlays (McpPanel/ConfigPanel/…) by
//   gating on an overlay tag in its reducer state and rendering the component in
//   the live bottom rows. SettingsPanel mounts the same way:
//     <SettingsPanel
//        tab={settingsTab}                       // ui state: SettingsTab
//        config={await loadSettings(repoRoot)}   // settings/store.ts
//        status={await gatherStatus(process.env)}// status.ts
//        usage={replState.sessionCost}           // pricing.ts SessionCost
//     />
//   with a `/settings` slash command (repl/catalog.ts) to open it and a Tab
//   keypress in app.tsx's overlay key handler calling
//   `setSettingsTab(nextSettingsTab(settingsTab))` to cycle. This component stays
//   pure; all I/O + key handling live at the mount point, mirroring how
//   McpPanel/ConfigPanel take data + callbacks as props.
