import { ChevronRight,RefreshCw,Search,X } from "lucide-react";
import { filterModels,ModelRow } from "./model-picker-catalog.js";
import { useModelPicker } from "./model-picker-state.js";
import { useModelPopoverPosition } from "./model-popover-position.js";
import { ProviderSettingsControls } from "./provider-settings-controls.js";
import type { Provider,ProviderModelSettings,Status } from "./types.js";

export type ModelPickerProps = { open: boolean; models: Provider[]; status: Status | null; onClose: () => void; onRefresh: (provider: string) => Promise<void>; onSelect: (provider: string, model: string, scope?: "session" | "global") => void; onSettings: (settings: ProviderModelSettings, scope?: "session" | "global") => Promise<void> };
type ViewProps = { props: ModelPickerProps; state: ReturnType<typeof useModelPicker> };

export function ModelPicker(props: ModelPickerProps) {
  const state = useModelPicker(props);
  if (!props.open) return null;
  if (state.view === "settings" && state.currentProvider && props.status) return <ModelSettingsPopover props={props} state={state} />;
  return <ModelBrowser props={props} state={state} />;
}

function ModelSettingsPopover({ props, state }: ViewProps) {
  const { currentProvider, close, setView } = state;
  const panelRef = useModelPopoverPosition();
  if (!currentProvider || !props.status) return null;
    const providerName = currentProvider.short || currentProvider.label;
    return <div className="model-popover-layer" onClick={close}>
      <section ref={panelRef} className="model-settings-popover" role="dialog" aria-labelledby="model-settings-title" onClick={(event) => event.stopPropagation()}>
        <header className="model-settings-popover-heading"><div><p className="eyebrow">Current provider</p><h2 id="model-settings-title">{providerName} settings</h2></div><button className="icon-button" type="button" aria-label="Close model settings" onClick={close}><X size={16} /></button></header>
        <button className="model-settings-row" type="button" autoFocus onClick={() => setView("browser")}><span>Model</span><strong>{props.status.model}</strong><ChevronRight size={15} aria-hidden="true" /></button>
        <ProviderSettingsControls compact provider={currentProvider} status={props.status} onSettings={props.onSettings} />
        <button className="model-settings-browse" type="button" onClick={() => setView("browser")}>Browse providers and models<ChevronRight size={15} aria-hidden="true" /></button>
      </section>
    </div>;
}

function ModelBrowser({ props, state }: ViewProps) {
  const { currentProvider, close, setView, query, setQuery } = state;
  return (
    <div className="overlay" onClick={close}>
      <div className="palette model-picker" role="dialog" aria-modal="true" aria-labelledby="model-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-heading model-picker-heading"><div>{currentProvider ? <button className="model-picker-back" type="button" onClick={() => setView("settings")}>Back to {currentProvider.short || currentProvider.label} settings</button> : null}<h2 id="model-title">Choose a model</h2><p>Choose a model and tune the controls supported by its provider.</p></div><button className="icon-button" type="button" aria-label="Close model picker" onClick={close}><X size={16} /></button></div>
        <label className="palette-search model-search"><Search size={16} /><span className="sr-only">Search models and providers</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models and providers" /></label>
        <div className="model-picker-body">
          <ModelProviderNavigation state={state} />
          <section className="model-provider-detail" aria-live="polite">
            <ModelProviderDetail props={props} state={state} />
          </section>
        </div>
      </div>
    </div>
  );
}


function ModelProviderNavigation({ state }: Pick<ViewProps, "state">) {
  const { matchingProviders, activeProvider, setSelectedProviderId, query, navigateProviders } = state;
  return (
          <nav className="model-provider-nav" role="tablist" aria-label="Model providers" aria-orientation="vertical" onKeyDown={navigateProviders}>
            {matchingProviders.map((provider) => <button key={provider.id} role="tab" aria-selected={provider.id === activeProvider?.id} data-provider-id={provider.id} className={provider.id === activeProvider?.id ? "active" : ""} type="button" onClick={() => setSelectedProviderId(provider.id)}>
              <span><strong>{provider.short || provider.label}</strong>{provider.current ? <small>Default</small> : <small>{provider.modelSource === "live" ? "Live catalog" : "Catalog"}</small>}</span>
              <b>{filterModels(provider, query).length}</b>
            </button>)}
          </nav>
  );
}

function ModelProviderDetail({ props, state }: ViewProps) {
  const { activeProvider, visibleModels, refreshSelected, refreshing, selectModel, chooseCustom, customModel, setCustomModel } = state;
  if (!activeProvider) return <p className="muted model-empty">No matching providers or models.</p>;
  return <>

              <header className="model-detail-heading">
                <div><h3>{activeProvider.short || activeProvider.label}</h3><p>{visibleModels.length} models · {activeProvider.modelSource === "live" ? "Live provider catalog" : "Vanta catalog"}</p></div>
                <button className="icon-button" type="button" onClick={() => void refreshSelected()} disabled={!activeProvider.discoveryAvailable || refreshing} aria-label={`Refresh ${activeProvider.label} models`} title={activeProvider.discoveryAvailable ? "Refresh models from provider" : "Connect this provider to load live models"}><RefreshCw size={15} className={refreshing ? "spinning" : ""} /></button>
              </header>
              <ProviderSettingsControls provider={activeProvider} status={props.status} onSettings={props.onSettings} />
              {activeProvider.discoveryError ? <p className="model-discovery-error" role="status">{activeProvider.discoveryError} Showing the offline catalog.</p> : null}
              <div className="model-rows" aria-label={`${activeProvider.short || activeProvider.label} models`}>{visibleModels.map((model) => <ModelRow key={model} provider={activeProvider} model={model} status={props.status} onSelect={selectModel} />)}</div>
              {visibleModels.length === 0 ? <p className="muted model-empty">No matching models for this provider.</p> : null}
              <details className="custom-model-disclosure"><summary>Use a model ID that is not listed</summary><form className="custom-model" onSubmit={chooseCustom}><label htmlFor="custom-model-id">Model ID</label><div><input id="custom-model-id" value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="Enter the provider model ID" /><button type="submit" disabled={!customModel.trim()}>Use for task</button></div></form></details>

  </>;
}
