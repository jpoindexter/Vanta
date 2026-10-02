import type { ConnectTarget } from "./classic-shell-state.js";
import type { useContinuity } from "./continuity-state.js";
import { ContinuityView } from "./continuity-view.js";
import type { useDesktopMcp } from "./mcp-state.js";
import { ArtifactsView,ConnectView,PluginsView,ScheduledView } from "./operator-views.js";
import type { useConversation,useDesktopData } from "./state.js";
import type { DesktopView } from "./types.js";

type DesktopData = ReturnType<typeof useDesktopData>;
type DesktopMcp = ReturnType<typeof useDesktopMcp>;
type Continuity = ReturnType<typeof useContinuity>;

export function OperatorWorkspace(props: {
  view: DesktopView;
  data: DesktopData;
  mcp: DesktopMcp;
  events: ReturnType<typeof useConversation>["events"];
  connectTarget: ConnectTarget | null;
  onOpenSession: (id: string) => void;
  onCreateSchedule: () => void;
  onConnect: () => void;
  continuity: Continuity;
}) {
  if (props.view === "operate") return <ContinuityView snapshot={props.continuity.snapshot} busy={props.continuity.busy} error={props.continuity.error} onCapture={props.continuity.capture} onAction={props.continuity.act} />;
  if (props.view === "outputs") return <ArtifactsView artifacts={props.data.artifacts} onOpenSession={props.onOpenSession} onRefresh={() => { void props.data.refresh(); }} />;
  if (props.view === "scheduled") return <ScheduledView items={props.data.schedules} onCreate={props.onCreateSchedule} />;
  if (props.view === "plugins") return <PluginsView items={props.data.capabilities} onConnect={props.onConnect} />;
  return <ConnectView key={props.connectTarget?.key ?? "connect"} capabilities={props.data.capabilities} platforms={props.data.messaging} models={props.data.models} status={props.data.status} google={props.data.google} releaseProofs={props.data.releaseProofs} mcp={props.mcp} initialSection={props.connectTarget?.section} messagingId={props.connectTarget?.messagingId} onSaveMessaging={props.data.saveMessaging} onTest={props.data.testConnection} onStartGateway={props.data.startGateway} onGoogleConnect={props.data.googleConnect} onOpenModel={props.data.openModelPicker} onOpenSetup={props.data.openSetup} />;
}

export function viewLabel(view: Exclude<DesktopView, "work">): string {
  if (view === "operate") return "Today";
  if (view === "outputs") return "Outputs";
  if (view === "scheduled") return "Scheduled";
  if (view === "plugins") return "Plugins";
  return "Connect";
}
