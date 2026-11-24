import type { RunLibraryController } from "./run-library.js";
import type { SessionDeleteAction } from "./session-safe-ops.js";
import type { DesktopView,PreparedRun,Session } from "./types.js";

export type SessionSidebarProps = {
  sessions: Session[];
  root?: string;
  activeId?: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onArchive: (id: string, archived: boolean) => void | Promise<void>;
  onDelete: (id: string, action: SessionDeleteAction) => void | Promise<void>;
  onBulkArchive: (ids: string[], archived: boolean) => void | Promise<void>;
  onBulkDelete: (ids: string[], action: SessionDeleteAction) => void | Promise<void>;
  onPin: (id: string, pinned: boolean) => void | Promise<void>;
  onReorderPins: (orderedIds: string[]) => void | Promise<void>;
  view: DesktopView;
  onView: (view: DesktopView) => void;
  onSettings: () => void;
  onShortcuts: () => void;
  onDismiss?: () => void;
  runLibrary?: RunLibraryController;
  onRunPrepared?: (prepared: PreparedRun) => void | Promise<void>;
};
