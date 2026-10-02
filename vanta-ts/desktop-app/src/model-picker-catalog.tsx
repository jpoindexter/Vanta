import { Check,Star } from "lucide-react";
import type { Provider,Status } from "./types.js";

export function filterModels(provider: Provider, query: string): string[] {
  const normalized = query.trim().toLowerCase();
  return provider.models.filter((model) => !normalized || `${provider.label} ${provider.short} ${model}`.toLowerCase().includes(normalized));
}

export function filterProviders(providers: Provider[], query: string): Provider[] {
  const normalized = query.trim().toLowerCase();
  return providers.filter((provider) => filterModels(provider, query).length > 0 || `${provider.label} ${provider.short}`.toLowerCase().includes(normalized));
}

export function ModelRow(props: { provider: Provider; model: string; status: Status | null; onSelect: (provider: string, model: string, scope?: "session" | "global") => void }) {
  const selected = props.status?.provider === props.provider.id && props.status?.model === props.model;
  const savedDefault = props.provider.current && props.provider.savedDefaultModel === props.model;
  return <div className={`model-row${selected ? " selected" : ""}`}>
    <button className="model-select" type="button" onClick={() => props.onSelect(props.provider.id, props.model, "session")} aria-pressed={selected}>
      <strong className="model-name">{props.model}</strong>
      <span className="model-badges">{selected ? <span className="model-active"><Check size={14} />This task</span> : null}{savedDefault ? <span className="model-saved"><Star size={12} fill="currentColor" />Default</span> : null}</span>
    </button>
    <button className={`icon-button model-default${savedDefault ? " saved" : ""}`} type="button" onClick={() => props.onSelect(props.provider.id, props.model, "global")} aria-label={savedDefault ? `${props.provider.label} ${props.model} is the default` : `Set ${props.provider.label} ${props.model} as default`} title={savedDefault ? "Default for new sessions" : "Set as default"}><Star size={15} fill={savedDefault ? "currentColor" : "none"} /></button>
  </div>;
}
