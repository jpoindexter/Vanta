import { FolderOpen,X } from "lucide-react";
import { useEffect,useState,type FormEvent } from "react";
import { StyledSelect } from "./form-controls.js";
import { pickDesktopProjectFolder } from "./project-folder-picker.js";

export type NewTaskDraft = { agent: string; host: string; folder: string; branch: string; model: string; prompt: string; worktree: boolean; approvals: boolean };

type Props = { open: boolean; root?: string; model?: string; initialDraft?: NewTaskDraft; initialError?: string; onClose: () => void; onCreate: (draft: NewTaskDraft) => void | Promise<void> };

export function NewTaskDialog(props: Props) {
  const { draft, set, choosingFolder, folderError, submitting, submitError, chooseFolder, submit } = useNewTaskDraft(props);
  if (!props.open) return null;
  return <div className="overlay" onClick={() => { if (!submitting) props.onClose(); }}><form className="new-task-dialog" role="dialog" aria-modal="true" aria-labelledby="new-task-title" aria-busy={submitting} onSubmit={(event) => { void submit(event); }} onClick={(event) => event.stopPropagation()}>
    <div className="dialog-heading"><div><p className="eyebrow">Work contract</p><h2 id="new-task-title">Start a new task</h2></div><button className="icon-button" type="button" aria-label="Close new task" onClick={props.onClose} disabled={submitting}><X size={16} /></button></div>
    <p className="dialog-copy">Choose where the work runs before the first message. The session starts only when you create it.</p>
    <div className="new-task-grid">
      <label>Agent<StyledSelect value={draft.agent} onChange={(event) => set("agent", event.target.value)}><option>Operator</option><option>Researcher</option><option>Verifier</option><option>Sentinel</option></StyledSelect></label>
      <label>Execution host<StyledSelect value={draft.host} onChange={(event) => set("host", event.target.value)}><option>Local Mac</option><option>Gateway</option><option>Remote worker</option></StyledSelect></label>
      <div className="wide form-field">
        <label htmlFor="new-task-folder">Project folder</label>
        <div className="folder-picker-control">
          <input id="new-task-folder" value={draft.folder} readOnly aria-describedby={folderError ? "new-task-folder-error" : undefined} />
          <button type="button" onClick={() => void chooseFolder()} disabled={choosingFolder || submitting} aria-label="Choose project folder">
            <FolderOpen size={15} aria-hidden="true" />{choosingFolder ? "Opening…" : "Choose…"}
          </button>
        </div>
        {folderError ? <small id="new-task-folder-error" className="form-error" role="alert">{folderError}</small> : null}
      </div>
      <label>Base branch<input value={draft.branch} onChange={(event) => set("branch", event.target.value)} /></label>
      <label>Model<input value={draft.model} onChange={(event) => set("model", event.target.value)} /></label>
      <label className="wide">First instruction<textarea autoFocus value={draft.prompt} onChange={(event) => set("prompt", event.target.value)} placeholder="What should Vanta handle?" /></label>
    </div>
    <label className="task-toggle"><input type="checkbox" checked={draft.worktree} onChange={(event) => set("worktree", event.target.checked)} /><span><strong>Use isolated worktree</strong><small>Create a reversible branch for this task.</small></span></label>
    <label className="task-toggle"><input type="checkbox" checked={draft.approvals} onChange={(event) => set("approvals", event.target.checked)} /><span><strong>Ask before consequential actions</strong><small>Show the exact command or diff before execution.</small></span></label>
    {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
    <div className="dialog-actions"><button type="button" onClick={props.onClose} disabled={submitting}>Cancel</button><button className="primary" type="submit" disabled={submitting}>{submitting ? "Switching project…" : "Create and run"}</button></div>
  </form></div>;
}


function useNewTaskDraft(props: Props) {
  const [draft, setDraft] = useState<NewTaskDraft>(() => ({ agent: "Operator", host: "Local Mac", folder: props.root ?? "", branch: "main", model: props.model ?? "", prompt: "", worktree: true, approvals: true }));
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  useEffect(() => {
    if (!props.open) return;
    setDraft((current) => props.initialDraft ?? ({ ...current, folder: props.root ?? current.folder, model: props.model ?? current.model }));
    setFolderError("");
    setSubmitError(props.initialError ?? "");
  }, [props.initialDraft, props.initialError, props.model, props.open, props.root]);
  const set = <K extends keyof NewTaskDraft>(key: K, value: NewTaskDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function chooseFolder() {
    setChoosingFolder(true);
    setFolderError("");
    try {
      const folder = await pickDesktopProjectFolder(draft.folder);
      if (folder) set("folder", folder);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Vanta could not open the folder picker.");
    } finally {
      setChoosingFolder(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await props.onCreate(draft);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Vanta could not create the task.");
      setSubmitting(false);
    }
  }
  return { draft, set, choosingFolder, folderError, submitting, submitError, chooseFolder, submit };
}
