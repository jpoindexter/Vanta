import { useCallback,useEffect,useRef,useState } from "react";
import { api } from "./api.js";
import {
createCompletionSoundPlayer,
loadCompletionSoundSettings,
saveCompletionSoundSettings,
type CompletionSoundPlayer,
type CompletionSoundSettings,
} from "./completion-sound.js";
import { refreshActiveConversation } from "./conversation-refresh.js";
import { desktopDataActions } from "./desktop-data-actions.js";
import { refreshDesktopInventory } from "./desktop-inventory-refresh.js";
import { useDesktopInventory } from "./desktop-inventory.js";
import { jsonHeaders } from "./request-json.js";
import type { Approval,ApprovalDecision,RailTab,Status } from "./types.js";

export function useDesktopData() {
  const refreshVersion = useRef(0);
  const inventory = useDesktopInventory();
  const { setStatus, setError, setPhase } = inventory;
  const [tab, setTab] = useState<RailTab>("activity");
  const overlays = useDesktopOverlays();
  const refresh = useCallback(() => refreshDesktopInventory(inventory, refreshVersion), []);
  const refreshConversation = useCallback(() => refreshActiveConversation({
    version: refreshVersion, readStatus: () => api<Status>("/api/status"),
    accept: (current) => { setStatus(current); setError(""); setPhase("ready"); },
    reject: (message) => { setError(message); setPhase("error"); },
    refreshInventory: refresh,
  }), [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { ...inventory.values, tab, setTab, refresh, refreshConversation, ...overlays,
    ...desktopDataActions({ inventory, version: refreshVersion, refresh, closeSetup: overlays.closeSetup }) };
}

function useDesktopOverlays() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  return {
    paletteOpen, modelOpen, soundOpen, setupOpen, settingsOpen, shortcutsOpen,
    openPalette: () => setPaletteOpen(true), closePalette: () => setPaletteOpen(false),
    openModelPicker: () => setModelOpen(true), closeModelPicker: () => setModelOpen(false),
    openSoundSettings: () => setSoundOpen(true), closeSoundSettings: () => setSoundOpen(false),
    openSetup: () => setSetupOpen(true), closeSetup: () => setSetupOpen(false),
    openSettings: () => setSettingsOpen(true), closeSettings: () => setSettingsOpen(false),
    openShortcuts: () => setShortcutsOpen(true), closeShortcuts: () => setShortcutsOpen(false),
  };
}

export function useCompletionSound() {
  const [settings, setSettings] = useState<CompletionSoundSettings>(() => loadCompletionSoundSettings(window.localStorage));
  const player = useRef<CompletionSoundPlayer | null>(null);
  const getPlayer = useCallback(() => {
    const prefixed = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const AudioContextImpl = window.AudioContext ?? prefixed;
    player.current ??= createCompletionSoundPlayer(AudioContextImpl ? () => new AudioContextImpl() : undefined);
    return player.current;
  }, []);
  const update = useCallback((next: CompletionSoundSettings) => {
    setSettings(next);
    saveCompletionSoundSettings(window.localStorage, next);
  }, []);
  const prime = useCallback(() => {
    if (settings.enabled) getPlayer().prime();
  }, [getPlayer, settings.enabled]);
  const play = useCallback(() => getPlayer().play(settings), [getPlayer, settings]);
  useEffect(() => () => { void player.current?.dispose(); }, []);
  return { settings, update, prime, play, preview: play };
}

export function useApproval() {
  const [approval, setApproval] = useState<Approval | null>(null);
  async function pollApproval() {
    const next = await api<Approval | null>("/api/approval").catch(() => null);
    setApproval((previous) => next ?? (previous?.error ? previous : null));
  }
  async function answerApproval(decision: ApprovalDecision) {
    if (!approval) return;
    if (approval.error) { setApproval(null); return; }
    try {
      await api("/api/approval", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ id: approval.id, decision }) });
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "Approval failed. The action was not approved.";
      setApproval({ ...approval, error }); throw cause;
    }
    setApproval(null);
  }
  useEffect(() => {
    const id = window.setInterval(() => void pollApproval(), 900);
    return () => window.clearInterval(id);
  }, []);
  return { approval, answerApproval };
}
export { conversationHandlers } from "./conversation-actions.js";
export { latestRecoverableRun,submitMessage } from "./conversation-submit.js";
export { useConversation } from "./use-conversation.js";
