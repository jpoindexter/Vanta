import {
  disableWakeService,
  enableWakeService,
  wakeServiceStatus,
  type WakeServiceStatus,
} from "../voice/wake-service.js";
import { assertWakeReady } from "../voice/wake-readiness.js";

export type WakeApiPayload = {
  enabled: boolean;
  running: boolean;
  phrase: string;
  detection: "local Whisper";
};

export type WakeApiDeps = {
  status?: () => Promise<WakeServiceStatus>;
  enable?: (root: string) => Promise<WakeServiceStatus>;
  disable?: () => Promise<WakeServiceStatus>;
  phrase?: string;
  ready?: () => Promise<void>;
};

function payload(status: WakeServiceStatus, phrase?: string): WakeApiPayload {
  return {
    enabled: status.enabled,
    running: status.running,
    phrase: phrase?.trim() || process.env.VANTA_WAKE_PHRASE?.trim() || "Hey Vanta",
    detection: "local Whisper",
  };
}

export async function getWakeApi(deps: WakeApiDeps = {}): Promise<WakeApiPayload> {
  return payload(await (deps.status ?? wakeServiceStatus)(), deps.phrase);
}

export async function setWakeApi(root: string, enabled: boolean, deps: WakeApiDeps = {}): Promise<WakeApiPayload> {
  if (enabled) await (deps.ready ?? assertWakeReady)();
  const status = enabled
    ? await (deps.enable ?? enableWakeService)(root)
    : await (deps.disable ?? disableWakeService)();
  return payload(status, deps.phrase);
}
