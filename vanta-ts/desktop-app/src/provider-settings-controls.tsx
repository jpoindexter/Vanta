import { useEffect,useState } from "react";
import { StyledSelect } from "./form-controls.js";
import type { ModelEffort,Provider,ProviderModelSettings,ProviderSpeed,Status } from "./types.js";

const EFFORT_LABELS: Record<ModelEffort, string> = {
  low: "Light",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

const SPEED_LABELS: Record<ProviderSpeed, string> = {
  standard: "Standard",
  fast: "Fast",
};

/** The fast-tier tradeoff differs by provider: Anthropic documents up to 2.5×
 *  output tokens/sec for Opus fast mode, Codex 1.5× for its fast service tier. */
export function fastSpeedHint(providerId: string): string {
  return /^(anthropic|claude-code|claude-cli)$/.test(providerId.trim().toLowerCase())
    ? "Up to 2.5× output speed, premium rate"
    : "1.5× speed, increased usage";
}

function settingsForProvider(provider: Provider, status: Status | null): ProviderModelSettings {
  const current = status?.provider === provider.id ? status.modelSettings : undefined;
  return {
    ...(provider.modelSettings?.effort ? { effortLevel: current?.effortLevel ?? provider.modelSettings.effort.defaultValue } : {}),
    ...(provider.modelSettings?.speed ? { speed: current?.speed ?? provider.modelSettings.speed.defaultValue } : {}),
  };
}

type Props = { compact?: boolean; provider: Provider; status: Status | null; onSettings: (settings: ProviderModelSettings, scope?: "session" | "global") => Promise<void> };

export function ProviderSettingsControls(props: Props) {
  const controls = useProviderSettings(props);
  const { draft, busy, message, save } = controls;
  const capabilities = props.provider.modelSettings;
  if (!capabilities?.effort && !capabilities?.speed) return null;
  if (props.status?.provider !== props.provider.id) return <section className="provider-settings provider-settings-inactive" aria-label={`${props.provider.label} settings unavailable`}><p>Select a {props.provider.short || props.provider.label} model for this task before tuning its provider controls.</p></section>;


  return <section className={`provider-settings${props.compact ? " provider-settings-compact" : ""}`} {...(props.compact ? { "aria-label": `${props.provider.short || props.provider.label} controls` } : { "aria-labelledby": "provider-settings-title" })}>
    <ProviderSettingsHeading props={props} busy={busy} />
    <ProviderSettingInputs props={props} controls={controls} />
    <details className="provider-settings-advanced"><summary>Advanced</summary><div><p>Save the selected effort{capabilities.speed ? " and speed" : ""} for new tasks in this project.</p><button type="button" disabled={busy} onClick={() => void save(draft, "global")}>Save as project defaults</button></div></details>
    <p className="provider-settings-message" role="status" aria-live="polite">{message}</p>
  </section>;
}


function ProviderSettingsHeading({ props, busy }: { props: Props; busy: boolean }) {
  if (props.compact) return null;
  return <div className="provider-settings-heading"><div><p className="eyebrow">Provider controls</p><h4 id="provider-settings-title">Tune {props.provider.short || props.provider.label}</h4></div><span>{busy ? "Saving…" : "This task"}</span></div>;
}

function useProviderSettings(props: Props) {
  const [draft, setDraft] = useState<ProviderModelSettings>(() => settingsForProvider(props.provider, props.status));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(settingsForProvider(props.provider, props.status));
    setMessage("");
  }, [props.provider.id, props.status?.provider, props.status?.model]);
  async function save(next: ProviderModelSettings, scope: "session" | "global") {
    setDraft(next);
    setBusy(true);
    setMessage("");
    try {
      await props.onSettings(next, scope);
      setMessage(scope === "global" ? "Saved as project defaults." : "Applies to the next request.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save model settings.");
    } finally {
      setBusy(false);
    }
  }

  return { draft, busy, message, save };
}

function ProviderSettingInputs({ props, controls }: { props: Props; controls: ReturnType<typeof useProviderSettings> }) {
  const capabilities = props.provider.modelSettings;
  const { draft, busy, save } = controls;
  if (!capabilities) return null;
  return (
    <div className="provider-setting-grid">
      {capabilities.effort ? <label className="provider-setting"><span>Effort</span><StyledSelect aria-label={`${props.provider.label} effort`} value={draft.effortLevel ?? capabilities.effort.defaultValue} disabled={busy} onChange={(event) => void save({ ...draft, effortLevel: event.target.value as ModelEffort }, "session")}>
        {capabilities.effort.options.map((option) => <option key={option} value={option}>{EFFORT_LABELS[option]}</option>)}
      </StyledSelect><small>{draft.effortLevel === "ultra" ? "Uses allowance fastest" : "Reasoning depth"}</small></label> : null}
      {capabilities.speed ? <label className="provider-setting"><span>Speed</span><StyledSelect aria-label={`${props.provider.label} speed`} value={draft.speed ?? capabilities.speed.defaultValue} disabled={busy} onChange={(event) => void save({ ...draft, speed: event.target.value as ProviderSpeed }, "session")}>
        {capabilities.speed.options.map((option) => <option key={option} value={option}>{SPEED_LABELS[option]}</option>)}
      </StyledSelect><small>{draft.speed === "fast" ? fastSpeedHint(props.provider.id) : "Default speed"}</small></label> : null}
    </div>
  );
}
