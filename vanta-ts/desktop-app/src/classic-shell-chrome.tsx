import { Bell,Command,FolderKanban,ListOrdered,MessageSquarePlus,PanelLeft,RefreshCw } from "lucide-react";
import { useRef } from "react";
import { clamp } from "./classic-shell-state.js";
import { connectionRecovery } from "./connection-recovery.js";
import { LoadingIndicator } from "./form-controls.js";

export function PaneResizeHandle(props: {
  className: string;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  direction: "left" | "right";
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);
  const update = (value: number) => props.onChange(clamp(Math.round(value), props.minimum, props.maximum));
  const deltaFor = (movement: number) => props.direction === "right" ? movement : -movement;

  return <div
    className={`pane-resize-handle ${props.className}`}
    role="separator"
    aria-orientation="vertical"
    aria-label={props.label}
    aria-valuemin={props.minimum}
    aria-valuemax={props.maximum}
    aria-valuenow={props.value}
    tabIndex={0}
    title={`${props.label}. Use the arrow keys for precise adjustment.`}
    onPointerDown={(event) => {
      if (window.matchMedia("(max-width: 1080px)").matches) return;
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startValue: props.value };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
    onPointerMove={(event) => {
      if (!drag.current || drag.current.pointerId !== event.pointerId) return;
      update(drag.current.startValue + deltaFor(event.clientX - drag.current.startX));
    }}
    onPointerUp={(event) => {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
    }}
    onPointerCancel={() => { drag.current = null; }}
    onKeyDown={(event) => {
      const step = event.shiftKey ? 32 : 16;
      if (event.key === "Home") { event.preventDefault(); update(props.minimum); return; }
      if (event.key === "End") { event.preventDefault(); update(props.maximum); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); update(props.value + deltaFor(step)); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); update(props.value + deltaFor(-step)); }
    }}
  ><span className="sr-only">{props.label}</span></div>;
}

export function DesktopHeader(props: {
  title: string;
  reviewCount: number;
  queueCount: number;
  inspectorOpen: boolean;
  sidebarCollapsed: boolean;
  onNew: () => void;
  onSidebar: () => void;
  onInspector: () => void;
  onQueue: () => void;
  onCommand: () => void;
}) {
  return (
    <header className="app-titlebar" aria-label="Application chrome">
      <div className="titlebar-identity">
        <div className="titlebar-leading-actions"><button className={props.sidebarCollapsed ? "" : "active"} type="button" title="Toggle threads" aria-label="Toggle threads" aria-pressed={!props.sidebarCollapsed} onClick={props.onSidebar}><PanelLeft size={16} /></button><button type="button" title="New task" aria-label="New task" onClick={props.onNew}><MessageSquarePlus size={16} /></button></div>
      </div>
      <div className="titlebar-agent-context">
        <div className="titlebar-task"><FolderKanban size={14} /><div className="title-block"><h1>{props.title}</h1></div></div>
        <div className="titlebar-actions">
          {props.queueCount ? <button className="titlebar-queue" type="button" aria-label={`Open queue, ${props.queueCount} next`} onClick={props.onQueue}><ListOrdered size={14} /><span>{props.queueCount}</span></button> : null}
          <button className={`review-button ${props.inspectorOpen ? "active" : ""}`} type="button" aria-label="Review" aria-expanded={props.inspectorOpen} aria-controls="review-drawer" onClick={props.onInspector}><span>Review</span>{props.reviewCount ? <strong aria-label={`${props.reviewCount} review items`}>{props.reviewCount}</strong> : null}</button>
          <button className="icon-button" type="button" title="Commands (Command K)" onClick={props.onCommand} aria-label="Open commands"><Command size={16} /></button>
        </div>
      </div>
    </header>
  );
}

export function LoadingState() {
  return <section className="loading-state"><LoadingIndicator label="Connecting to Vanta" /><h2>Connecting to Vanta</h2><p>Loading the kernel, project context, and sessions.</p></section>;
}

export function ConnectionError(props: { message: string; onRetry: () => void; onSetup: () => void }) {
  const recovery = connectionRecovery(props.message);
  const guidance = recovery === "project" ? "Check the project path, file permissions, or local catalog, then retry." : recovery === "service" ? "Retry the local runtime without changing provider credentials." : "Connect or repair the model provider for this project.";
  return <section className="connection-error" role="alert"><Bell size={18} /><div><strong>{recovery === "provider" ? "Model setup needed" : recovery === "project" ? "Project context needs attention" : "Vanta needs attention"}</strong><p>{props.message}</p><p>{guidance}</p></div><div>{recovery === "provider" ? <button type="button" onClick={props.onSetup}>Configure model</button> : null}<button type="button" onClick={props.onRetry}><RefreshCw size={15} />Retry</button></div></section>;
}
