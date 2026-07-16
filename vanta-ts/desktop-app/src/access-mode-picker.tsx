import { useEffect, useRef, useState } from "react";
import { Check, Hand, ShieldAlert, ShieldCheck, X } from "lucide-react";
import type { AccessMode } from "./types.js";

const OPTIONS: { mode: AccessMode; label: string; short: string; description: string }[] = [
  { mode: "ask", label: "Ask for approval", short: "Ask", description: "Ask before edits, commands, network access, and other consequential actions." },
  { mode: "approve", label: "Approve for me", short: "Approve", description: "Apply project file changes without stopping; shell, network, and risky actions still ask." },
  { mode: "full", label: "Full access", short: "Full access", description: "Run within this project without repeated prompts. Kernel and explicit blocks remain enforced." },
];

export function AccessModePicker(props: { mode: AccessMode; onChange: (mode: AccessMode) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = OPTIONS.find((option) => option.mode === props.mode) ?? OPTIONS[1]!;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  async function select(mode: AccessMode) {
    if (mode === props.mode) { setOpen(false); return; }
    setPending(true); setError("");
    try {
      await props.onChange(mode);
      setOpen(false);
      trigger.current?.focus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  }

  return <div className="access-mode-picker" ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} className={`approval-mode mode-${props.mode}`} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {props.mode === "full" ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}<span>{current.short}</span>
    </button>
    {open ? <AccessModeMenu mode={props.mode} pending={pending} error={error} onSelect={(mode) => { void select(mode); }} onClose={() => { setOpen(false); trigger.current?.focus(); }} /> : null}
  </div>;
}

export function AccessModeMenu(props: { mode: AccessMode; pending: boolean; error?: string; onSelect: (mode: AccessMode) => void; onClose: () => void }) {
  return <section className="access-mode-menu" role="dialog" aria-label="Action approval mode">
    <header><div><strong>Action approval</strong><span>Project setting</span></div><button type="button" aria-label="Close access menu" onClick={props.onClose}><X size={16} /></button></header>
    <fieldset disabled={props.pending}>
      <legend className="sr-only">How should Vanta actions be approved?</legend>
      {OPTIONS.map((option) => <label key={option.mode} className={option.mode === props.mode ? "active" : ""}>
        <input type="radio" name="desktop-access-mode" value={option.mode} checked={option.mode === props.mode} aria-checked={option.mode === props.mode} onChange={() => props.onSelect(option.mode)} />
        <span className="mode-icon">{option.mode === "ask" ? <Hand size={19} /> : option.mode === "full" ? <ShieldAlert size={19} /> : <ShieldCheck size={19} />}</span>
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
        {option.mode === props.mode ? <Check className="mode-check" size={18} aria-hidden="true" /> : null}
      </label>)}
    </fieldset>
    {props.error ? <p className="access-mode-error" role="alert">{props.error}</p> : null}
    <details><summary>Learn more</summary><p>Vanta always evaluates actions through the local kernel. Full access removes Ask prompts inside the project boundary; kernel and configured Block decisions cannot be overridden here.</p></details>
  </section>;
}
