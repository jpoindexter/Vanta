import { useState } from "react";
import type { Artifact,CanvasArtifact,Capability,DesktopRuntime,GoogleConnectStatus,MessagingPlatform,Provider,ReleaseProofReport,ScheduledTask,Session,Status,Tool } from "./types.js";

export function useDesktopInventory() {
  const [status, setStatus] = useState<Status | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [models, setModels] = useState<Provider[]>([]);
  const [canvas, setCanvas] = useState<CanvasArtifact | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [messaging, setMessaging] = useState<MessagingPlatform[]>([]);
  const [google, setGoogle] = useState<GoogleConnectStatus>({ status: "needs_setup", clientConfigured: false, authorized: false, message: "Checking Google Workspace..." });
  const [releaseProofs, setReleaseProofs] = useState<ReleaseProofReport | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [runtime, setRuntime] = useState<DesktopRuntime>({ selectedHostId: "local", hosts: [] });
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  return { values: { status, sessions, tools, files, models, canvas, capabilities, messaging, google, releaseProofs, artifacts, schedules, runtime, phase, error }, setStatus, setSessions, setTools, setFiles, setModels, setCanvas, setCapabilities, setMessaging, setGoogle, setReleaseProofs, setArtifacts, setSchedules, setRuntime, setPhase, setError };
}

export type DesktopInventory = ReturnType<typeof useDesktopInventory>;
