import { useEffect, useState, type ReactNode } from "react";
import { DocumentLinkContext } from "./document-link-context.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { DesktopSurfaceMode } from "./desktop-surface.js";

type Request = { root: string; path: string };
type Props = { state: ChatFirstState; children: ReactNode;
  surface: { mode: DesktopSurfaceMode; expand: () => Promise<boolean> } };

/** Reuse the same bounded document workbench from chat, including mini mode. */
export function ChatDocumentLinks({ state, surface, children }: Props) {
  const [pending, setPending] = useState<Request | null>(null);
  const root = state.data.status?.root ?? "";
  useEffect(() => {
    if (!pending) return;
    if (pending.root !== root) { setPending(null); return; }
    if (surface.mode !== "full") return;
    state.documents.open(pending.path);
    state.setView("work"); state.setContextTab("files"); state.setInspector(true); setPending(null);
  }, [pending, root, surface.mode, state]);
  const open = (path: string) => {
    const request = { root, path };
    setPending(request);
    if (surface.mode === "mini") void surface.expand().then((expanded) => {
      if (!expanded) setPending((current) => current === request ? null : current);
    });
  };
  return <DocumentLinkContext.Provider value={{ root, open }}>{children}</DocumentLinkContext.Provider>;
}
