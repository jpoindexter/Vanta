import { useEffect,useMemo,useRef,useState } from "react";
import { partitionSessions } from "./session-pinning.js";
import { useSessionSafeOps } from "./session-safe-ops.js";
import type { SessionSidebarProps } from "./session-sidebar-types.js";
import type { Session } from "./types.js";

export function useSessionSidebar(props: SessionSidebarProps) {
  const [section, setSection] = useState<"threads" | "runs">("threads");
  const [query, setQuery] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sessions = useMemo(() => props.sessions.filter((session) => session.title.toLowerCase().includes(query.toLowerCase())), [props.sessions, query]);
  const groups = useMemo(() => partitionSessions(sessions), [sessions]);
  const { pinned, project: projectSessions, recent: recentSessions, archived, trashed } = groups;
  const visibleSessions = useMemo(() => [...pinned, ...projectSessions, ...recentSessions, ...(archivedOpen ? archived : []), ...(trashOpen ? trashed : [])], [pinned, projectSessions, recentSessions, archived, archivedOpen, trashOpen, trashed]);
  const projectName = props.root?.split("/").filter(Boolean).at(-1) ?? "Current project";
  const safe = useSessionSafeOps({ rename: props.onRename, archive: props.onArchive, archiveMany: props.onBulkArchive, remove: props.onDelete, removeMany: props.onBulkDelete, pin: props.onPin, reorderPins: props.onReorderPins });

  useEffect(() => { if (!archived.length) setArchivedOpen(false); }, [archived.length]);
  useEffect(() => { if (!trashed.length) setTrashOpen(false); }, [trashed.length]);

  const selection = useSidebarSelection(props.sessions, visibleSessions);
  const bulk = useSidebarBulk(selection.selectedSessions, safe, selection.stopSelecting);
  return { section, setSection, query, setQuery, archivedOpen, setArchivedOpen, trashOpen, setTrashOpen,
    searchRef, groups, visibleSessions, projectName, safe, ...selection, ...bulk };
}

function useSidebarSelection(sessions: Session[], visibleSessions: Session[]) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const selectedSessions = useMemo(() => sessions.filter((session) => selected.has(session.id)), [sessions, selected]);
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(sessions.map((session) => session.id));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [sessions]);
  return { selecting, selected, selectedSessions,
    ...selectionActions({ visibleSessions, lastSelectedId, setLastSelectedId, setSelecting, setSelected }) };
}

type SelectionTarget = {
  visibleSessions: Session[]; lastSelectedId: string | null;
  setLastSelectedId: (id: string | null) => void; setSelecting: (value: boolean) => void;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
};

function selectionActions({ visibleSessions, lastSelectedId, setLastSelectedId, setSelecting, setSelected }: SelectionTarget) {
  function toggleSelected(id: string, range = false) {
    setSelected((current) => {
      const next = new Set(current);
      if (range && lastSelectedId) {
        const anchor = visibleSessions.findIndex((session) => session.id === lastSelectedId);
        const target = visibleSessions.findIndex((session) => session.id === id);
        if (anchor >= 0 && target >= 0) {
          const start = Math.min(anchor, target);
          const end = Math.max(anchor, target);
          for (const session of visibleSessions.slice(start, end + 1)) next.add(session.id);
          return next;
        }
      }
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setLastSelectedId(id);
  }
  function startSelecting() {
    setSelecting(true);
  }
  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setLastSelectedId(null);
  }
  function clearSelected() {
    setSelected(new Set());
    setLastSelectedId(null);
  }
  function selectAllVisible() {
    const ids = visibleSessions.map((session) => session.id);
    setSelecting(true);
    setSelected(new Set(ids));
    setLastSelectedId(ids.at(-1) ?? null);
  }
  return { toggleSelected, startSelecting, stopSelecting, clearSelected, selectAllVisible };
}

function useSidebarBulk(selectedSessions: Session[], safe: ReturnType<typeof useSessionSafeOps>, stopSelecting: () => void) {
  const [bulkProgress, setBulkProgress] = useState("");
  async function archiveSelected(archivedState: boolean) {
    const targets = selectedSessions.filter((session) => !session.trashed);
    if (!targets.length || bulkProgress) return;
    setBulkProgress(`${archivedState ? "Archiving" : "Restoring"} ${targets.length}…`);
    try { if (await safe.archive(targets, archivedState)) stopSelecting(); }
    finally { setBulkProgress(""); }
  }
  async function deleteSelected() {
    const targets = [...selectedSessions];
    if (!targets.length || bulkProgress) return;
    const allTrashed = targets.every((session) => session.trashed);
    if (allTrashed && !window.confirm(`Delete ${targets.length} selected session${targets.length === 1 ? "" : "s"} forever? This cannot be undone.`)) return;
    setBulkProgress(`${allTrashed ? "Deleting permanently" : "Moving to Trash"} ${targets.length}…`);
    try { if (await safe.remove(targets, allTrashed ? "permanent" : "trash")) stopSelecting(); }
    finally { setBulkProgress(""); }
  }
  return { bulkProgress, archiveSelected, deleteSelected };
}
