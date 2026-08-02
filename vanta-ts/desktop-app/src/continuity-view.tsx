import { useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, CirclePause, Eye, Inbox, Pause, Play, RotateCcw, X } from "lucide-react";
import { StyledSelect } from "./form-controls.js";
import type { CapacityDimensions, ContinuityItem, ContinuitySnapshot } from "./types.js";
import "./continuity.css";

type ViewProps = {
  snapshot: ContinuitySnapshot | null;
  busy: boolean;
  error?: string;
  onCapture: (input: { text: string }) => Promise<void>;
  onAction: (
    id: string | undefined,
    action: "do_it" | "show_me" | "snooze" | "skip" | "off",
    options?: { until?: string; scope?: "session" | "pattern" | "global" },
  ) => Promise<void>;
};

const dimensionLabels: Array<[keyof CapacityDimensions, string]> = [
  ["cognitive", "Cognitive"], ["attentional", "Attentional"], ["sensory", "Sensory"],
  ["social", "Social"], ["emotional", "Emotional"], ["physical", "Physical"], ["time", "Time"],
];

export function ContinuityView(props: ViewProps) {
  const [tab, setTab] = useState<"today" | "inbox" | "projects">("today");
  const [capture, setCapture] = useState("");
  const [offScope, setOffScope] = useState<"session" | "pattern" | "global">("session");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!capture.trim()) return;
    await props.onCapture({ text: capture.trim() });
    setCapture("");
  }
  const snapshot = props.snapshot;
  const reducedMotion = snapshot?.support.interaction.reducedMotion === true;
  return <section className={`continuity-workspace${reducedMotion ? " reduced-motion" : ""}`} aria-labelledby="continuity-title">
    <header className="continuity-header">
      <div><p className="eyebrow">Continuity</p><h1 id="continuity-title">Today</h1><p>One thread to pick up without reconstructing everything.</p></div>
      <SupportSummary snapshot={snapshot} />
    </header>
    <div className="continuity-tabs" role="tablist" aria-label="Continuity views">
      <button type="button" role="tab" aria-selected={tab === "today"} className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>Today</button>
      <button type="button" role="tab" aria-selected={tab === "inbox"} className={tab === "inbox" ? "active" : ""} onClick={() => setTab("inbox")}>Inbox <span>{snapshot?.inbox.length ?? 0}</span></button>
      <button type="button" role="tab" aria-selected={tab === "projects"} className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>Projects</button>
    </div>
    {snapshot?.integrity === "degraded" ? <IntegrityNotice snapshot={snapshot} /> : null}
    {props.error ? <p className="continuity-error" role="alert">{props.error}</p> : null}
    {tab === "today" ? <TodayPanel snapshot={snapshot} busy={props.busy} onAction={props.onAction} /> : null}
    {tab === "inbox" ? <InboxPanel items={snapshot?.inbox ?? []} /> : null}
    {tab === "projects" ? <ProjectsPanel snapshot={snapshot} /> : null}
    <form className="continuity-capture" onSubmit={(event) => { void submit(event); }}>
      <label htmlFor="continuity-capture">What do you want off your mind?</label>
      <div><textarea id="continuity-capture" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="Drop the messy version here. No category or priority needed." rows={2} /><button type="submit" disabled={props.busy || !capture.trim()}>Capture</button></div>
    </form>
    <footer className="continuity-footer">
      <p><strong>No guilt, no reconstruction.</strong> Skip or turn support off whenever it is not useful.</p>
      <div><StyledSelect aria-label="Off scope" value={offScope} onChange={(event) => setOffScope(event.target.value as typeof offScope)}><option value="session">This session</option><option value="pattern">This pattern</option><option value="global">Everywhere</option></StyledSelect><button type="button" disabled={props.busy} onClick={() => void props.onAction(undefined, "off", { scope: offScope })}><Pause size={14} />Off</button></div>
    </footer>
  </section>;
}

function TodayPanel(props: Pick<ViewProps, "busy" | "onAction"> & { snapshot: ContinuitySnapshot | null }) {
  const item = props.snapshot?.today[0];
  if (!item) return <div className="continuity-empty"><Inbox size={22} /><strong>Nothing is asking for attention</strong><p>Capture the messy version below. Vanta will offer one bounded next step.</p></div>;
  const until = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
  return <div className="today-stack" aria-live="polite">
    {props.snapshot?.reentry ? <section className="reentry-card"><RotateCcw size={17} /><div><span>Pick up here</span><strong>{props.snapshot.reentry.action}</strong><small>Last verified state restored from the continuity store.</small></div></section> : null}
    <article className="recommendation-card">
      <header><div><span className="state-label"><CirclePause size={14} />{stateLabel(item.state)}</span><h2>{item.outcome}</h2><p>{item.recommendation}</p></div><time>{item.timeCapacityFit.minutes} min</time></header>
      <section className="concrete-preview" aria-label="Exact action preview"><Eye size={16} /><div><strong>Show me</strong><p>{item.preparedAction.preview}</p></div></section>
      <CapacityList capacity={props.snapshot?.support.capacity ?? item.timeCapacityFit.capacity} />
      <div className="continuity-primary-actions">
        <button className="primary" type="button" disabled={props.busy} onClick={() => void props.onAction(item.id, "do_it")}><Play size={14} />Do it</button>
        <button type="button" disabled={props.busy} onClick={() => void props.onAction(item.id, "show_me")}><Eye size={14} />Show me</button>
        <button type="button" disabled={props.busy} onClick={() => void props.onAction(item.id, "snooze", { until })}><CalendarClock size={14} />Snooze</button>
      </div>
      <button className="continuity-skip" type="button" disabled={props.busy} onClick={() => void props.onAction(item.id, "skip")}><X size={13} />Skip</button>
    </article>
  </div>;
}

function CapacityList({ capacity }: { capacity: CapacityDimensions }) {
  return <dl className="capacity-list" aria-label="Current effective capacity, explicitly set or unknown">{dimensionLabels.map(([key, label]) => <div key={key} aria-label={`${label}: ${capacity[key]}`}><dt>{label}</dt><dd>{capacity[key]}</dd></div>)}</dl>;
}

function InboxPanel({ items }: { items: ContinuityItem[] }) {
  return <section className="continuity-list" aria-live="polite">{items.map((item) => <article key={item.id}><Inbox size={15} /><div><strong>{item.outcome}</strong><small>{stateLabel(item.state)} · {item.nextAction}</small></div></article>)}{items.length === 0 ? <p>No captured threads.</p> : null}</section>;
}

function ProjectsPanel({ snapshot }: { snapshot: ContinuitySnapshot | null }) {
  return <section className="continuity-list">{snapshot?.projects.map((project) => <article key={project.id}><CheckCircle2 size={15} /><div><strong>{project.label}</strong><small>{project.itemCount} continuity item{project.itemCount === 1 ? "" : "s"}</small></div></article>)}</section>;
}

function SupportSummary({ snapshot }: { snapshot: ContinuitySnapshot | null }) {
  if (!snapshot) return <span className="support-summary">Loading support state…</span>;
  const quiet = snapshot.support.quietHours.enabled ? `${snapshot.support.quietHours.start}–${snapshot.support.quietHours.end}` : "off";
  const streaming = snapshot.support.interaction.streaming ? "live" : "buffered";
  const scroll = snapshot.support.interaction.autoScroll ? "automatic" : "manual";
  return <span className="support-summary">Quiet hours {quiet} · interruptions {snapshot.support.interruptionBudget.remaining}/{snapshot.support.interruptionBudget.daily} · motion {snapshot.support.interaction.reducedMotion ? "reduced" : "standard"} · streaming {streaming} · scroll {scroll}</span>;
}

function IntegrityNotice({ snapshot }: { snapshot: ContinuitySnapshot }) {
  return <div className="continuity-integrity" role="alert"><strong>Continuity needs repair</strong><p>{snapshot.diagnostics[0]?.recovery}</p></div>;
}

function stateLabel(state: ContinuityItem["state"]): string {
  return state.split(" ").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}
