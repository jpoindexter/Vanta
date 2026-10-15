import { useEffect, useState, type FormEvent } from "react";
import { FolderOpen, X } from "lucide-react";
import { pickDesktopProjectFolder } from "./project-folder-picker.js";
import type { NewTaskDraft } from "./overlays.js";

type Props = {
  open: boolean; root?: string; model?: string; initialDraft?: NewTaskDraft; initialError?: string;
  onClose: () => void; onCreate: (draft: NewTaskDraft) => Promise<void>;
};

export function projectTaskDraft(root = "", model = ""): NewTaskDraft {
  return { agent: "Operator", host: "Local Mac", folder: root, branch: "main", model, prompt: "", worktree: true, approvals: true };
}

export function ChatProjectDialog(props: Props) {
  const [draft, setDraft] = useState(() => projectTaskDraft(props.root, props.model));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!props.open) return;
    setDraft(props.initialDraft ?? projectTaskDraft(props.root, props.model));
    setError(props.initialError ?? "");
  }, [props.open, props.root, props.model, props.initialDraft, props.initialError]);
  async function selectFolder() {
    setBusy(true); setError("");
    try { const folder = await pickDesktopProjectFolder(draft.folder); if (folder) setDraft((value) => ({ ...value, folder })); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await props.onCreate(draft); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  if (!props.open) return null;
  return <div className="overlay" onClick={() => { if (!busy) props.onClose(); }}>
    <form className="new-task-dialog chat-project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-task-title" aria-busy={busy}
      onClick={(event) => event.stopPropagation()} onSubmit={(event) => void create(event)}>
      <header className="dialog-heading"><h2 id="project-task-title">New project task</h2><button className="chat-icon" aria-label="Close project task" type="button" disabled={busy} onClick={props.onClose}><X size={18} /></button></header>
      <p className="dialog-copy">Save an instruction with project context. Nothing runs until you send the draft.</p>
      <div className="new-task-grid">
        <div className="wide form-field"><label htmlFor="chat-project-folder">Project folder</label><div className="folder-picker-control">
          <input id="chat-project-folder" value={draft.folder} readOnly />
          <button type="button" disabled={busy} aria-label="Choose project folder" onClick={() => void selectFolder()}><FolderOpen size={16} />Choose…</button>
        </div></div>
        <label>Base branch<input value={draft.branch} disabled={busy} onChange={(event) => setDraft({ ...draft, branch: event.target.value })} /></label>
        <label>Current model<input value={draft.model} readOnly /></label>
        <label className="wide">First instruction<textarea autoFocus value={draft.prompt} disabled={busy} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></label>
      </div>
      <label className="task-toggle"><input type="checkbox" checked={draft.worktree} disabled={busy} onChange={(event) => setDraft({ ...draft, worktree: event.target.checked })} /><span>Request an isolated worktree</span></label>
      <label className="task-toggle"><input type="checkbox" checked={draft.approvals} disabled={busy} onChange={(event) => setDraft({ ...draft, approvals: event.target.checked })} /><span>Request approval before consequential actions</span></label>
      <p className="dialog-copy">These are instructions for the next turn. Your configured approval policy still applies.</p>
      {error ? <p role="alert">{error}</p> : null}
      <footer className="dialog-actions"><button type="button" disabled={busy} onClick={props.onClose}>Cancel</button><button className="primary" type="submit" disabled={busy || !draft.folder || !draft.prompt.trim()}>{busy ? "Preparing…" : "Create draft"}</button></footer>
    </form>
  </div>;
}
