import { type ProviderModelSettings } from "../providers/model-settings.js";
import { type DesktopState } from "./handler-state.js";

export function currentDesktopModelSettings(state: DesktopState): ProviderModelSettings {
  return {
    ...(state.effortLevel ? { effortLevel: state.effortLevel } : {}),
    ...(state.providerSpeed ? { speed: state.providerSpeed } : {}),
  };
}
