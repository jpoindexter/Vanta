import { type ReactElement } from "react";
import { Box } from "ink";
import { Composer } from "./composer.js";
import { type SlackChannel } from "../repl/slack-suggest.js";
import { TodoPanel } from "./todo-panel.js";
import { type Pending } from "./use-agent.js";
import { type OverlayView } from "./use-overlay.js";
import { OverlayList } from "./overlay-list.js";
import { CockpitPanel } from "./cockpit-panel.js";
import { StatsPanel } from "./stats-panel.js";
import { HelpPanel } from "./help-panel.js";
import { LoopsPanel } from "./loops-panel.js";
import { ReviewPanel } from "./review-panel.js";
import { ContextPanel } from "./context-panel.js";
import { McpPanel } from "./mcp-panel.js";
import { SandboxPanel } from "./sandbox-panel.js";
import { ConfigPanel } from "./config-panel.js";
import { HooksPanel } from "./hooks-panel.js";
import { TasksPanel } from "./tasks-panel.js";
import { type FocusTarget } from "./focus.js";
import { QuickOpen } from "./quick-open.js";
import { GlobalSearchDialog } from "./global-search-dialog.js";
import { MessageActionsPanel } from "./message-actions-panel.js";
import { type Mode, ModeLine } from "./mode-line.js";
import type { SlashMatch } from "./slash.js";
import type { OverlayRow } from "./overlays.js";
import type { TodoItem } from "../todo/store.js";
import type { SearchableSession, SessionSearchHit } from "../search/cross-session.js";
import type { Entry } from "./types.js";

// The App's bottom live region: todo panel + quick-open / overlay / composer,
// and the overlay-kind switch. Split from app.tsx so both stay under the size
// gate; presentational only — App owns the state, this renders it.

type LiveBodyProps = {
  quickOpen: boolean;
  globalSearch: boolean;
  messageActions: boolean;
  searchSessions: SearchableSession[];
  entries: Entry[];
  overlay: OverlayView | null;
  pending: Pending | null;
  mode: Mode;
  focus: FocusTarget;
  todos: TodoItem[];
  files: string[];
  history: string[];
  skills: SlashMatch[];
  channels: SlackChannel[];
  vim: boolean;
  onQuickActivate: (command: string) => void;
  onQuickClose: () => void;
  onSearchSelect: (hit: SessionSearchHit) => void;
  onSearchClose: () => void;
  onMessageRetry: (text: string) => void;
  onMessageBranch: () => void;
  onMessageNote: (text: string) => void;
  onMessageClose: () => void;
  onSubmit: (text: string) => void;
  onPaste: () => void;
  onSelect: (row: OverlayRow) => void;
  onClose: () => void;
};

/** The bottom live region: todo panel + either the quick-open picker or the
 * normal overlay/composer surface. Keeps the decision out of App's body. */
export function LiveBody(p: LiveBodyProps): ReactElement {
  return (
    <>
      {p.overlay || p.quickOpen || p.globalSearch || p.messageActions ? null : <TodoPanel todos={p.todos} />}
      {p.globalSearch
        ? <GlobalSearchDialog sessions={p.searchSessions} onSelect={p.onSearchSelect} onClose={p.onSearchClose} />
        : p.messageActions
        ? <MessageActionsPanel entries={p.entries} onRetry={p.onMessageRetry} onBranch={p.onMessageBranch} onNote={p.onMessageNote} onClose={p.onMessageClose} />
        : p.quickOpen
        ? <QuickOpen files={p.files} onActivate={p.onQuickActivate} onClose={p.onQuickClose} />
        : <BottomRegion focused={p.focus} overlay={p.overlay} pending={p.pending} mode={p.mode} files={p.files} history={p.history} skills={p.skills} channels={p.channels} vim={p.vim} onSubmit={p.onSubmit} onPaste={p.onPaste} onSelect={p.onSelect} onClose={p.onClose} />}
    </>
  );
}

function BottomRegion(props: {
  focused: FocusTarget;
  overlay: OverlayView | null;
  pending: Pending | null;
  mode: Mode;
  files: string[];
  history: string[];
  skills: SlashMatch[];
  channels: SlackChannel[];
  vim: boolean;
  onSubmit: (text: string) => void;
  onPaste: () => void;
  onSelect: (row: OverlayRow) => void;
  onClose: () => void;
}): ReactElement | null {
  const { overlay } = props;
  if (props.pending) return null;
  if (overlay) return <OverlayPanel overlay={overlay} focused={props.focused} onSelect={props.onSelect} onClose={props.onClose} />;
  return (
    <Box flexDirection="column">
      <ModeLine mode={props.mode} />
      <Composer focused={props.focused === "composer"} onSubmit={props.onSubmit} placeholder="Ask Vanta anything — /help for commands" files={props.files} history={props.history} skills={props.skills} channels={props.channels} onPaste={props.onPaste} vim={props.vim} />
    </Box>
  );
}

/** Renders the open overlay's panel. Split from BottomRegion so each stays under
 * the complexity gate; the switch is append-only (one branch per overlay kind). */
function OverlayPanel(props: { overlay: OverlayView; focused: FocusTarget; onSelect: (row: OverlayRow) => void; onClose: () => void }): ReactElement | null {
  const { overlay, onClose } = props;
  if (overlay.kind === "list") return <OverlayList focused={props.focused === "overlay-list"} title={overlay.title} rows={overlay.rows} onSelect={props.onSelect} onClose={onClose} />;
  if (overlay.kind === "cockpit") return <CockpitPanel data={overlay.data} onClose={onClose} />;
  if (overlay.kind === "stats") return <StatsPanel stats={overlay.stats} onClose={onClose} />;
  if (overlay.kind === "loops") return <LoopsPanel loops={overlay.loops} onClose={onClose} />;
  if (overlay.kind === "review") return <ReviewPanel files={overlay.files} cwd={overlay.cwd} onClose={onClose} />;
  return <OverlayPanelMore overlay={overlay} onClose={onClose} />;
}

/** The remaining overlay kinds — split from OverlayPanel so each stays under the
 * complexity gate (append-only; one branch per overlay kind). */
function OverlayPanelMore(props: { overlay: OverlayView; onClose: () => void }): ReactElement | null {
  const { overlay, onClose } = props;
  if (overlay.kind === "context") return <ContextPanel categories={overlay.categories} total={overlay.total} contextWindow={overlay.contextWindow} onClose={onClose} />;
  if (overlay.kind === "mcp") return <McpPanel servers={overlay.servers} elicitation={overlay.elicitation} onReconnect={overlay.reconnect} onElicitationDone={overlay.onElicitationDone} onClose={onClose} />;
  if (overlay.kind === "sandbox") return <SandboxPanel state={overlay.state} doctor={overlay.doctor} onToggle={overlay.onToggle} onCycleOverride={overlay.onCycleOverride} onClose={onClose} />;
  if (overlay.kind === "config") return <ConfigPanel state={overlay.state} onAction={overlay.onAction} onClose={onClose} />;
  if (overlay.kind === "hooks") return <HooksPanel config={overlay.config} onAction={overlay.onAction} onClose={onClose} />;
  if (overlay.kind === "tasks") return <TasksPanel tasks={overlay.tasks} onClose={onClose} />;
  return <HelpPanel onClose={onClose} />;
}
