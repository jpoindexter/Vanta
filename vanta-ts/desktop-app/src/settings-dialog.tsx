import { Bot,KeyRound,MonitorCog,ShieldCheck,X } from "lucide-react";
import { useState } from "react";
import type { DesktopTheme,Provider,Status } from "./types.js";

type Props = { open: boolean; models: Provider[]; status: Status | null; theme: DesktopTheme; fullAccessWarningAcknowledged: boolean; onResetFullAccessWarning: () => void; onTheme: (theme: DesktopTheme) => void; onClose: () => void; onModel: () => void; onSetup: () => void };

export function SettingsDialog(props: Props) {
  const [section, setSection] = useState<"model" | "appearance" | "safety" | "workspace">("model");
  if (!props.open) return null;
  return <div className="overlay" onClick={props.onClose}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
    <header className="dialog-heading"><div><p className="eyebrow">Vanta desktop</p><h2 id="settings-title">Settings</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></header>
    <nav className="settings-nav" aria-label="Settings sections"><button className={section === "model" ? "active" : ""} type="button" onClick={() => setSection("model")}><Bot size={16} />Model</button><button className={section === "appearance" ? "active" : ""} type="button" onClick={() => setSection("appearance")}><MonitorCog size={16} />Appearance</button><button className={section === "safety" ? "active" : ""} type="button" onClick={() => setSection("safety")}><ShieldCheck size={16} />Safety</button><button className={section === "workspace" ? "active" : ""} type="button" onClick={() => setSection("workspace")}><KeyRound size={16} />Workspace</button></nav>
    <SettingsContent section={section} props={props} />
  </section></div>;
}

function SafetySettings(props: { status: Status | null; warningAcknowledged: boolean; onResetWarning: () => void }) {
  return <section><p className="eyebrow">Safety</p><h3>Kernel {props.status?.kernel ?? "checking"}</h3><p>Requests that cross Vanta’s kernel boundary still require the configured approval policy.</p>
    <div className="safety-warning-control"><strong>Full access warning</strong><p>{props.warningAcknowledged ? "Acknowledged for this project and risk version." : "Shown when Full access is selected."}</p>{props.warningAcknowledged ? <button type="button" onClick={props.onResetWarning}>Show warning again</button> : null}</div>
  </section>;
}


function SettingsContent({ section, props }: { section: string; props: Props }) {
  return <div className="settings-content">
    {section === "model" ? <ModelSettings props={props} /> : null}
    {section === "appearance" ? <AppearanceSettings props={props} /> : null}
    {section === "safety" ? <SafetySettings status={props.status} warningAcknowledged={props.fullAccessWarningAcknowledged} onResetWarning={props.onResetFullAccessWarning} /> : null}
    {section === "workspace" ? <WorkspaceSettings props={props} /> : null}
  </div>;
}

function ModelSettings({ props }: { props: Props }) {
  const current = props.models.find((provider) => provider.id === props.status?.provider);
  return <><section><p className="eyebrow">Model</p><h3>{props.status?.model ?? "No model selected"}</h3><p>{current?.label ?? "Choose a provider"} · applies to the active session unless you set a default in the picker.</p><button type="button" onClick={props.onModel}>Change model</button></section><section><p className="eyebrow">Providers</p><h3>{props.models.length} available providers</h3><p>Connect or change a provider through Vanta’s local setup flow. Keys are stored in the project’s local configuration.</p><button type="button" onClick={props.onSetup}>Connect provider</button></section></>;
}

function AppearanceSettings({ props }: { props: Props }) {
  return <section><p className="eyebrow">Appearance</p><h3>Desktop theme</h3><p>White and neutral grey surfaces with Vanta violet accents. Your choice is remembered on this Mac.</p><div className="theme-picker" role="group" aria-label="Desktop theme"><button className={props.theme === "light" ? "active" : ""} aria-pressed={props.theme === "light"} type="button" onClick={() => props.onTheme("light")}>Light</button><button className={props.theme === "dark" ? "active" : ""} aria-pressed={props.theme === "dark"} type="button" onClick={() => props.onTheme("dark")}>Dark</button></div></section>;
}

function WorkspaceSettings({ props }: { props: Props }) {
  return <section><p className="eyebrow">Workspace</p><h3>{props.status?.root?.split("/").filter(Boolean).at(-1) ?? "Current project"}</h3><p>{props.status?.root ?? "Project path unavailable"}</p></section>;
}
