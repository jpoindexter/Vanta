import { useEffect,useState,type FormEvent,type KeyboardEvent as ReactKeyboardEvent } from "react";
import { filterModels,filterProviders } from "./model-picker-catalog.js";
import type { ModelPickerProps } from "./model-picker.js";

export function useModelPicker(props: ModelPickerProps) {
  const currentProvider = props.models.find((provider) => provider.id === props.status?.provider);
  const [view, setView] = useState<"settings" | "browser">(() => currentProvider ? "settings" : "browser");
  const [query, setQuery] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    const providerId = props.status?.provider ?? props.models.find((provider) => provider.current)?.id ?? props.models[0]?.id ?? "";
    setQuery("");
    setCustomModel("");
    setSelectedProviderId(providerId);
    setView(currentProvider ? "settings" : "browser");
    if (!currentProvider && providerId) {
      setRefreshing(true);
      void props.onRefresh(providerId).finally(() => setRefreshing(false));
    }
  }, [props.open]);
  function close() {
    setView(currentProvider ? "settings" : "browser");
    props.onClose();
  }
  const matchingProviders = filterProviders(props.models, query);
  const activeProvider = matchingProviders.find((provider) => provider.id === selectedProviderId)
    ?? matchingProviders.find((provider) => provider.id === props.status?.provider)
    ?? matchingProviders[0];
  const visibleModels = activeProvider ? filterModels(activeProvider, query) : [];
  const state = { view, setView, currentProvider, query, setQuery, selectedProviderId, setSelectedProviderId, customModel, setCustomModel,
    refreshing, setRefreshing, matchingProviders, activeProvider, visibleModels, close };
  return { ...state, ...modelPickerActions(props, state) };
}

type PickerState = { setView: (view: "settings" | "browser") => void; activeProvider: ModelPickerProps["models"][number] | undefined;
  setRefreshing: (value: boolean) => void; setSelectedProviderId: (value: string) => void; customModel: string; close: () => void };

function modelPickerActions(props: ModelPickerProps, state: PickerState) {
  const { setView, activeProvider, setRefreshing, setSelectedProviderId, customModel, close } = state;
  // Claude-CLI style: after picking a model, drill into its settings view (effort /
  // speed) instead of closing. A model with no tunable controls has nothing to
  // tune, so close the picker as before. A "global" pick (Set as default) also
  // just applies and closes.
  async function selectModel(provider: string, model: string, scope?: "session" | "global") {
    props.onSelect(provider, model, scope);
    const picked = props.models.find((entry) => entry.id === provider);
    const tunable = Boolean(picked?.modelSettings?.effort || picked?.modelSettings?.speed);
    if (scope === "session" && tunable) setView("settings");
    else close();
  }
  async function refreshSelected() {
    if (!activeProvider || !activeProvider.discoveryAvailable) return;
    setRefreshing(true);
    try { await props.onRefresh(activeProvider.id); }
    finally { setRefreshing(false); }
  }
  function chooseCustom(event: FormEvent) {
    event.preventDefault();
    const model = customModel.trim();
    if (activeProvider && model) void selectModel(activeProvider.id, model, "session");
  }
  function navigateProviders(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-provider-id]")];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = buttons[(Math.max(0, current) + delta + buttons.length) % buttons.length];
    if (!next) return;
    event.preventDefault();
    setSelectedProviderId(next.dataset.providerId ?? "");
    next.focus();
  }
  return { selectModel, refreshSelected, chooseCustom, navigateProviders };
}
