import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import type { AccessMode } from "./types.js";

export const FULL_ACCESS_WARNING_VERSION = "2026-07-17.v1";
export const FULL_ACCESS_WARNING_STORAGE_KEY = "vanta.desktop.full-access-warning";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Acknowledgement = { version: string; scope: string };

export function fullAccessScope(root?: string): string {
  return `project:${root || "unknown"}`;
}

export function warningAcknowledged(storage: StoragePort, scope: string): boolean {
  try {
    const value = JSON.parse(storage.getItem(FULL_ACCESS_WARNING_STORAGE_KEY) ?? "null") as Acknowledgement | null;
    return value?.version === FULL_ACCESS_WARNING_VERSION && value.scope === scope;
  } catch {
    return false;
  }
}

export function acknowledgeWarning(storage: StoragePort, scope: string): void {
  storage.setItem(FULL_ACCESS_WARNING_STORAGE_KEY, JSON.stringify({ version: FULL_ACCESS_WARNING_VERSION, scope }));
}

export function resetWarningAcknowledgement(storage: StoragePort): void {
  storage.removeItem(FULL_ACCESS_WARNING_STORAGE_KEY);
}

export function useFullAccessWarning(mode: AccessMode, scope: string) {
  const [closedScope, setClosedScope] = useState("");
  const [revision, setRevision] = useState(0);
  const acknowledged = warningAcknowledged(window.localStorage, scope);
  const visible = mode === "full" && closedScope !== scope && !acknowledged;
  return {
    visible,
    acknowledged,
    revision,
    close: () => setClosedScope(scope),
    acknowledge: () => { acknowledgeWarning(window.localStorage, scope); setRevision((value) => value + 1); },
    reset: () => { resetWarningAcknowledgement(window.localStorage); setClosedScope(""); setRevision((value) => value + 1); },
  };
}

export function FullAccessWarning(props: { visible: boolean; onClose: () => void; onAcknowledge: () => void }) {
  if (!props.visible) return null;
  return <section className="full-access-warning" role="alert" aria-live="assertive" aria-labelledby="full-access-warning-title">
    <ShieldAlert size={20} aria-hidden="true" />
    <div>
      <strong id="full-access-warning-title">Full access is on</strong>
      <p>Vanta may run commands, use the internet, and create, modify, upload, or delete files inside this project without asking each time. This can cause data loss or expose data through prompt injection. Kernel-blocked actions remain blocked.</p>
    </div>
    <div className="full-access-warning-actions">
      <button type="button" onClick={props.onAcknowledge}>Don&apos;t show again</button>
      <button className="full-access-warning-close" type="button" aria-label="Close full access warning" onClick={props.onClose}><X size={16} /></button>
    </div>
  </section>;
}
