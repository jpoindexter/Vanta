import { useEffect, useRef, useState } from "react";
import { AppWindow, Monitor, ScanLine } from "lucide-react";
import type { DesktopLookMode } from "./types.js";

type LookCaptureButtonProps = {
  busy?: boolean;
  onCapture: (mode: DesktopLookMode) => unknown | Promise<unknown>;
};

const MODES: { mode: DesktopLookMode; label: string; detail: string; icon: typeof Monitor }[] = [
  { mode: "marquee", label: "Select area", detail: "Drag a rectangle", icon: ScanLine },
  { mode: "window", label: "Select window", detail: "Choose one app window", icon: AppWindow },
  { mode: "screen", label: "All displays", detail: "Capture every screen", icon: Monitor },
];

export function LookCaptureButton(props: LookCaptureButtonProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="look-capture-control" ref={root}>
    <button type="button" disabled={props.busy} aria-label="Capture screen context" title={props.busy ? "Capturing screen context" : "Capture screen context"} aria-expanded={open} onClick={() => setOpen((value) => !value)}><ScanLine size={16} /></button>
    {open ? <div className="look-capture-menu" role="menu" aria-label="Screen capture mode">
      {MODES.map((item) => <LookMode key={item.mode} {...item} onSelect={() => { setOpen(false); void props.onCapture(item.mode); }} />)}
    </div> : null}
  </div>;
}

export function desktopLookCommand(value: string): DesktopLookMode | undefined {
  const match = value.trim().toLowerCase().match(/^\/look(?:\s+(marquee|selection|window|screen|full))?$/);
  const mode = match?.[1];
  if (!match || mode === undefined || mode === "marquee" || mode === "selection") return match ? "marquee" : undefined;
  if (mode === "full") return "screen";
  return mode === "window" ? "window" : "screen";
}

function LookMode(props: { mode: DesktopLookMode; label: string; detail: string; icon: typeof Monitor; onSelect: () => void }) {
  const Icon = props.icon;
  return <button type="button" role="menuitem" onClick={props.onSelect}><Icon size={16} /><span><strong>{props.label}</strong><small>{props.detail}</small></span></button>;
}
