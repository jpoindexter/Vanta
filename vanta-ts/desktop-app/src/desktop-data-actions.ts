import { api } from "./api.js";
import type { DesktopInventory } from "./desktop-inventory.js";
import { jsonHeaders } from "./request-json.js";
import type { AccessMode,ConnectTestResult,DesktopRuntime,GatewayStartResult,GoogleConnectStatus,MessagingPlatform,Provider,ProviderModelSettings,RuntimeAction,TelegramSetupStatus } from "./types.js";

type Target = { inventory: DesktopInventory; version: { current: number }; refresh: () => Promise<void>; closeSetup: () => void };

export function desktopDataActions(target: Target) {
  return { ...modelActions(target), ...runtimeActions(target.inventory), ...connectionActions(target) };
}

function modelActions(target: Target) {
  const { setStatus, setModels } = target.inventory;
  const { refresh } = target;
  async function setModel(provider: string, model: string, scope: "session" | "global" = "session") {
    // Note: the picker stays OPEN so it can drill into the model's effort/speed
    // settings (Claude-CLI style: pick model → pick effort). ModelPicker decides
    // when to switch views or close after this resolves.
    await api("/api/model", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ provider, model, scope }) });
    await refresh();
  }
  async function setModelSettings(settings: ProviderModelSettings, scope: "session" | "global" = "session") {
    const saved = await api<{ modelSettings: ProviderModelSettings }>("/api/model-settings", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...settings, scope }),
    });
    target.version.current += 1;
    setStatus((current) => current ? { ...current, modelSettings: saved.modelSettings } : current);
  }
  async function refreshProviderModels(providerId: string) {
    const refreshed = await api<Provider[]>(`/api/models/${encodeURIComponent(providerId)}`);
    setModels(refreshed);
  }
  async function setAccessMode(mode: AccessMode) {
    const saved = await api<{ mode: AccessMode; scope: "project" }>("/api/access-mode", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ mode }),
    });
    target.version.current += 1;
    setStatus((current) => current ? { ...current, accessMode: saved.mode, accessScope: saved.scope } : current);
  }

  return { setModel, setModelSettings, refreshProviderModels, setAccessMode };
}

function runtimeActions({ setRuntime }: DesktopInventory) {
  async function updateRuntime(hostId: string, action?: RuntimeAction) {
    const saved = await api<DesktopRuntime>("/api/runtime", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ hostId, ...(action ? { action } : {}) }),
    });
    setRuntime(saved);
  }

  return { setRuntimeHost: (hostId: string) => updateRuntime(hostId),
    runRuntimeAction: (hostId: string, action: RuntimeAction) => updateRuntime(hostId, action) };
}

function connectionActions(target: Target) {
  const { setGoogle, setPhase } = target.inventory;
  const { refresh } = target;
  return {
    saveMessaging: async (id: string, values: Record<string, string>) => {
      await api<MessagingPlatform>("/api/messaging", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ id, values }) });
      await refresh();
    },
    testConnection: (kind: "provider" | "messaging", id?: string) => api<ConnectTestResult>("/api/connect/test", {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ kind, ...(id ? { id } : {}) }),
    }),
    startGateway: () => api<GatewayStartResult>("/api/gateway/start", { method: "POST" }),
    googleConnect: async (action: "ingest_client" | "start" | "complete", clientPath?: string) => {
      const result = await api<GoogleConnectStatus>("/api/connect/google", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ action, ...(clientPath ? { clientPath } : {}) }),
      });
      setGoogle(result);
      return result;
    },
    telegramSetupStatus: () => api<TelegramSetupStatus>("/api/setup/messaging/telegram"),
    saveSetup: async (provider: string, model: string, apiKey: string) => {
      await api("/api/setup", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ provider, model, apiKey }) });
      target.closeSetup(); setPhase("loading"); await refresh();
    },
  };
}
