import { api } from "./api.js";
import type { DesktopInventory } from "./desktop-inventory.js";
import type { Artifact,CanvasArtifact,Capability,DesktopRuntime,GoogleConnectStatus,MessagingPlatform,Provider,ReleaseProofReport,ScheduledTask,Session,Status,Tool } from "./types.js";

type Critical = [Status, Session[], Tool[], string[], Provider[]];
type Optional = [CanvasArtifact | null, Capability[], MessagingPlatform[], Artifact[], DesktopRuntime, GoogleConnectStatus, ReleaseProofReport | null, ScheduledTask[]];
type Settled<T extends unknown[]> = { [K in keyof T]: PromiseSettledResult<T[K]> };

export async function refreshDesktopInventory(inventory: DesktopInventory, versionRef: { current: number }) {
  const { setModels, setError, setPhase } = inventory;
  const version = ++versionRef.current;
  const critical = Promise.allSettled([
    api<Status>("/api/status"), api<Session[]>("/api/sessions"), api<Tool[]>("/api/tools"),
    api<string[]>("/api/files"), api<Provider[]>("/api/models"),
  ]);
  const optional = Promise.allSettled([
    api<CanvasArtifact | null>("/api/canvas").catch(() => null),
    api<Capability[]>("/api/capabilities").catch(() => []), api<MessagingPlatform[]>("/api/messaging").catch(() => []), api<Artifact[]>("/api/artifacts").catch(() => []),
    api<DesktopRuntime>("/api/runtime").catch(() => ({ selectedHostId: "local", hosts: [] })),
    api<GoogleConnectStatus>("/api/connect/google").catch(() => ({ status: "needs_setup", clientConfigured: false, authorized: false, message: "Google Workspace status is unavailable." } as GoogleConnectStatus)),
    api<ReleaseProofReport>("/api/release-proofs").catch(() => null),
    api<ScheduledTask[]>("/api/schedules").catch(() => []),
  ]);
  const [statusResult, sessionsResult, toolsResult, filesResult, modelsResult] = await critical;
  // A mutation can invalidate an older aggregate refresh while its requests
  // are still in flight. Never let stale status overwrite the saved mode.
  if (version !== versionRef.current) return;
  applyCritical(inventory, [statusResult, sessionsResult, toolsResult, filesResult, modelsResult]);

  const failure = [statusResult, sessionsResult, toolsResult, filesResult, modelsResult]
    .find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) {
    setError(failure.reason instanceof Error ? failure.reason.message : String(failure.reason));
    setPhase("error");
    void api<Provider[]>("/api/setup").then(setModels).catch(() => undefined);
    return;
  }
  setError(""); setPhase("ready");

  const [canvasResult, capabilitiesResult, messagingResult, artifactsResult, runtimeResult, googleResult, releaseProofsResult, schedulesResult] = await optional;
  if (version !== versionRef.current) return;
  applyOptional(inventory, [canvasResult, capabilitiesResult, messagingResult, artifactsResult, runtimeResult, googleResult, releaseProofsResult, schedulesResult]);
}

function applyCritical(inventory: DesktopInventory, results: Settled<Critical>) {
  const { setStatus, setSessions, setTools, setFiles, setModels } = inventory;
  const [statusResult, sessionsResult, toolsResult, filesResult, modelsResult] = results;
  if (statusResult.status === "fulfilled") setStatus(statusResult.value);
  if (sessionsResult.status === "fulfilled") setSessions(sessionsResult.value);
  if (toolsResult.status === "fulfilled") setTools(toolsResult.value);
  if (filesResult.status === "fulfilled") setFiles(filesResult.value);
  if (modelsResult.status === "fulfilled") setModels(modelsResult.value);

}

function applyOptional(inventory: DesktopInventory, results: Settled<Optional>) {
  const { setCanvas, setCapabilities, setMessaging, setArtifacts, setRuntime, setGoogle, setReleaseProofs, setSchedules } = inventory;
  const [canvasResult, capabilitiesResult, messagingResult, artifactsResult, runtimeResult, googleResult, releaseProofsResult, schedulesResult] = results;
  setCanvas(canvasResult.status === "fulfilled" ? canvasResult.value : null);
  setCapabilities(capabilitiesResult.status === "fulfilled" ? capabilitiesResult.value : []);
  setMessaging(messagingResult.status === "fulfilled" ? messagingResult.value : []);
  setArtifacts(artifactsResult.status === "fulfilled" ? artifactsResult.value : []);
  setRuntime(runtimeResult.status === "fulfilled" ? runtimeResult.value : { selectedHostId: "local", hosts: [] });
  setGoogle(googleResult.status === "fulfilled" ? googleResult.value : { status: "needs_setup", clientConfigured: false, authorized: false, message: "Google Workspace status is unavailable." });
  setReleaseProofs(releaseProofsResult.status === "fulfilled" ? releaseProofsResult.value : null);
  setSchedules(schedulesResult.status === "fulfilled" ? schedulesResult.value : []);
}
