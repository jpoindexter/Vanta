import { useEffect, useRef, useState } from "react";
import { Check, Hand, ListChecks, ShieldAlert, ShieldCheck, WandSparkles, X } from "lucide-react";
import type { AccessMode } from "./types.js";

const OPTIONS: { mode: AccessMode; label: string; short: string; description: string }[] = [
  { mode: "ask", label: "Manual mode", short: "Manual", description: "Ask before edits, commands, network access, and other consequential actions." },
  { mode: "approve", label: "Accept edits", short: "Accept edits", description: "Apply project file changes without stopping; shell, network, and risky actions still ask." },
  { mode: "plan", label: "Plan mode", short: "Plan", description: "Inspect and plan with read-only tools. Writes and commands stay blocked until you leave Plan." },
  { mode: "auto", label: "Auto mode", short: "Auto", description: "Automatically continue only when the current kernel and auto classifier agree the action is safe." },
  { mode: "full", label: "Full access", short: "Full access", description: "Run within this project without repeated prompts. Kernel and explicit blocks remain enforced." },
];

function ModeIcon(props: { mode: AccessMode; size: number }) {
  if (props.mode === "ask") return <Hand size={props.size} />;
  if (props.mode === "plan") return <ListChecks size={props.size} />;
  if (props.mode === "auto") return <WandSparkles size={props.size} />;
  if (props.mode === "full") return <ShieldAlert size={props.size} />;
  return <ShieldCheck size={props.size} />;
}

export function AccessModePicker(props: { mode: AccessMode; onChange: (mode: AccessMode) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [selectedMode, setSelectedMode] = useState(props.mode);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = OPTIONS.find((option) => option.mode === selectedMode) ?? OPTIONS[1]!;

  useEffect(() => { setSelectedMode(props.mode); }, [props.mode]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  async function select(mode: AccessMode) {
    if (mode === selectedMode) { setOpen(false); return; }
    const previous = selectedMode;
    setSelectedMode(mode);
    setPending(true); setError("");
    try {
      await props.onChange(mode);
      setOpen(false);
      trigger.current?.focus();
    } catch (reason) {
      setSelectedMode(previous);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  }

  return <div className="access-mode-picker" ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} className={`approval-mode mode-${selectedMode}`} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <ModeIcon mode={selectedMode} size={13} /><span>{current.short}</span>
    </button>
    {open ? <AccessModeMenu mode={selectedMode} pending={pending} error={error} onSelect={(mode) => { void select(mode); }} onClose={() => { setOpen(false); trigger.current?.focus(); }} /> : null}
  </div>;
}

export function AccessModeMenu(props: { mode: AccessMode; pending: boolean; error?: string; onSelect: (mode: AccessMode) => void; onClose: () => void }) {
  return <section className="access-mode-menu" role="dialog" aria-label="Action approval mode">
    <header><div><strong>Action approval</strong><span>Project setting</span></div><button type="button" aria-label="Close access menu" onClick={props.onClose}><X size={16} /></button></header>
    <fieldset disabled={props.pending}>
      <legend className="sr-only">How should Vanta actions be approved?</legend>
      {OPTIONS.map((option) => <label key={option.mode} className={option.mode === props.mode ? "active" : ""}>
        <input type="radio" name="desktop-access-mode" value={option.mode} checked={option.mode === props.mode} aria-checked={option.mode === props.mode} onChange={() => props.onSelect(option.mode)} />
        <span className="mode-icon"><ModeIcon mode={option.mode} size={19} /></span>
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
        {option.mode === props.mode ? <Check className="mode-check" size={18} aria-hidden="true" /> : null}
      </label>)}
    </fieldset>
    {props.error ? <p className="access-mode-error" role="alert">{props.error}</p> : null}
    <details><summary>Learn more</summary><p>Vanta always evaluates actions through the local kernel. Auto mode does not reuse old approvals, Plan is read-only, and configured Block decisions cannot be overridden here.</p></details>
  </section>;
}
