import { ArtifactsView, CapabilitiesView, ConnectView, ScheduledView } from "./operator-views.js";
import { ContinuityView } from "./continuity-view.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";
import { ChatFirstLibrary } from "./chat-first-library.js";

export function ChatFirstWorkspace({ state, actions }: { state: ChatFirstState; actions: ChatFirstActions }) {
  if (state.view === "history") return <ChatFirstLibrary state={state} actions={actions} />;
  const { data, continuity } = state;
  if (state.view === "operate") return <ContinuityView snapshot={continuity.snapshot} busy={continuity.busy} error={continuity.error} onCapture={continuity.capture} onAction={continuity.act} />;
  if (state.view === "outputs") return <ArtifactsView artifacts={data.artifacts} onOpenSession={(id) => void actions.navigate(id)} onRefresh={() => void data.refresh()} />;
  if (state.view === "scheduled") return <ScheduledView items={data.schedules} onCreate={() => { state.setView("work"); state.convo.setDraft("Schedule a recurring task: "); }} />;
  if (state.view === "plugins") return <CapabilitiesView items={data.capabilities} />;
  return <ConnectView key={state.connectTarget.key} initialSection={state.connectTarget.section} messagingId={state.connectTarget.messagingId}
    capabilities={data.capabilities} platforms={data.messaging} models={data.models} status={data.status}
    google={data.google} releaseProofs={data.releaseProofs} mcp={state.mcp} onSaveMessaging={data.saveMessaging}
    onTest={data.testConnection} onStartGateway={data.startGateway} onGoogleConnect={data.googleConnect}
    onOpenModel={data.openModelPicker} onOpenSetup={data.openSetup} />;
}
