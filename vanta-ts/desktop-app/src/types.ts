export type Session = { id: string; title: string; turns: number; updated: string; archived?: boolean; trashed?: boolean; pinned?: boolean; pinOrder?: number };
export type Tool = { name: string; desc: string };
export type DesktopTheme = "dark" | "light";
export type DesktopView = "work" | "operate" | "outputs" | "connect";
export type Capability = { id: string; kind: "tool" | "skill"; name: string; description: string; tags: string[] };
export type MessagingPlatform = {
  id: string; label: string; status: ConnectStatus; configured: boolean; missing: string[]; prerequisite?: string; warning?: string;
  setupSteps: string[]; signupUrl?: string; fields: { key: string; label: string; secret: boolean }[];
};
export type ConnectStatus = "ready" | "needs_setup" | "unavailable";
export type ConnectTestResult = { status: ConnectStatus; message: string };
export type Artifact = { id: string; kind: "canvas" | "link" | "file"; label: string; value: string; sessionId?: string; sessionTitle?: string };
export type Goal = { text: string };
export type AccessMode = "ask" | "approve" | "full";
export type QueuedTurn = {
  id: string;
  instruction: string;
  intent: "next" | "steer";
  status: "queued" | "starting";
  target: { sessionId: string; root: string; controllerId: string; model: string; accessMode: AccessMode };
  position: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  ownerPid?: number;
};
export type TurnQueueSnapshot = { revision: number; items: QueuedTurn[] };
export type Status = { kernel: string; model: string; provider?: string; tools: number; sessionId: string; root?: string; goals: Goal[]; accessMode?: AccessMode; accessScope?: "project" };
export type RuntimeHostSnapshot = {
  host: { id: string; label: string; kind: "local" | "remote" };
  status: "offline" | "auth_required" | "idle" | "starting" | "running" | "stopping" | "failed" | "degraded";
  transport: "reachable" | "offline" | "auth_required";
  kernel: "ready" | "not_ready" | "unknown";
  engine: { id?: string; lifecycle: "idle" | "starting" | "running" | "stopping" | "failed"; model?: string };
  resources: { memoryUsedBytes?: number; memoryTotalBytes?: number; utilizationPercent?: number; throughputPerSecond?: number };
  queueDepth: number;
  observedAt: string;
  stale: boolean;
  detail: {
    controllerId: string;
    requestOwner: string;
    approval: "not_required" | "requested" | "approved" | "denied" | "blocked";
    command?: { executable: string; args: string[]; hash: string };
    resourceFit?: { estimatedMemoryBytes: number; availableMemoryBytes: number; headroomBytes: number; fits: boolean };
    benchmark?: { latencyMs?: number; outputTokens?: number; providerLatencyMs?: number };
    logs: Array<{ at: string; transition: string; code?: string }>;
    actions: RuntimeAction[];
  };
};
export type DesktopRuntime = { selectedHostId: string; hosts: RuntimeHostSnapshot[] };
export type RuntimeAction = "launch" | "stop" | "retry" | "reconnect";
export type RuntimeProfileRecord = {
  version: 2; id: string; name: string; backend: "mlx" | "llama_cpp" | "vllm" | "sglang";
  model: { path: string; bytes: number }; endpoint: { host: string; port: number; reviewedRemoteBind: boolean };
  resources: { contextTokens: number; availableMemoryBytes: number };
  performance: Record<string, number | boolean | undefined>;
  environment: Array<{ name: string; value?: string; secretRef?: string }>;
  extraArgs: Array<{ flag: string; value?: string; reviewed: boolean }>;
  policyScope: AccessMode; compatibility: { platforms: string[]; architectures: string[] };
};
export type RuntimeProfileIssue = { code: string; severity: "error" | "review"; field: string; message: string; recovery: string };
export type RuntimeProfileItem = {
  profile: RuntimeProfileRecord;
  validation: { valid: boolean; compatible: boolean; issues: RuntimeProfileIssue[]; resource?: RuntimeHostSnapshot["detail"]["resourceFit"] };
  preview: { command: string; args: string[]; environment?: Record<string, string>; commandHash: string; resource: NonNullable<RuntimeHostSnapshot["detail"]["resourceFit"]> };
  roundTrip: boolean;
};
export type RuntimeProfilePayload = {
  selectedId: string | null;
  host: { platform: string; architecture: string; memoryBytes: number };
  profiles: RuntimeProfileItem[];
  export?: string;
};
export type ModelDownloadJob = {
  version: 1; id: string; label: string;
  source: { kind: "hugging_face"; url: string; sha256: string; bytes: number; filename: string; authSecretRef?: string; manifestUrl?: string };
  storageRoot: string; destination: string; profileId?: string;
  status: "queued" | "downloading" | "paused" | "verifying" | "completed" | "failed";
  downloadedBytes: number; resumedAt?: number; failureCode?: string; recovery?: string;
  createdAt: string; updatedAt: string; completedAt?: string;
};
export type ModelDownloadReceipt = {
  version: 1; jobId: string; at: string;
  transition: ModelDownloadJob["status"] | "enqueued" | "duplicate" | "cleaned" | "profile_linked";
  downloadedBytes: number; destination: string; code?: string; profileId?: string;
};
export type ModelDownloadPayload = { jobs: ModelDownloadJob[]; receipts: ModelDownloadReceipt[] };
export type DesktopRunFailureKind = "setup" | "tool" | "model" | "model_mismatch" | "user_denied" | "interrupted" | "unknown";
export type DesktopRunReceipt = {
  status: "done" | "failed" | "interrupted";
  failureKind?: DesktopRunFailureKind;
  events: EventRow[];
  actions: ("retry_failed_step" | "edit_request" | "start_from_checkpoint")[];
  checkpoint?: { instruction: string; partialText?: string };
  counterexample?: { modelVersion: number; transition: string; path: string; predicted: string; observed: string; safeNextAction: string };
};
export type Message = {
  role: string;
  content?: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: { id: string; name: string; arguments?: Record<string, unknown> }[];
  desktopRun?: DesktopRunReceipt;
};
export type Provider = {
  id: string;
  label: string;
  short: string;
  models: string[];
  defaultModel?: string;
  current?: boolean;
  savedDefaultModel?: string;
  modelSource?: "catalog" | "live";
  discoveryAvailable?: boolean;
  discoveryError?: string;
  requiresKey?: boolean;
  signupUrl?: string;
  note?: string;
};
export type EventRow = { label: string; ok?: boolean };
export type CanvasScalar = string | number | boolean | null;
export type CanvasArtifact = {
  version: 1; id: string; title: string; subtitle?: string; createdAt: string; sessionId?: string;
  source: { tool: "render_canvas" };
} & (
  | { kind: "chart"; chart: { type: "bar" | "line"; categories: string[]; series: { name: string; color?: string; values: number[] }[]; xLabel?: string; yLabel?: string } }
  | { kind: "table"; table: { columns: { key: string; label: string; format?: "text" | "number" | "currency" | "percent" }[]; rows: Record<string, CanvasScalar>[] } }
  | { kind: "board"; board: { columns: { title: string; items: { title: string; detail?: string; status?: string; metric?: string }[] }[] } }
);
export type PermissionKind =
  | "bash" | "file_edit" | "file_write" | "web_fetch" | "computer_use" | "sandbox" | "skill" | "generic";
export type PermissionSection = { label: string; value: string; tone?: "code" | "muted" | "danger" };
export type PermissionRequest = {
  kind: PermissionKind;
  title: string;
  subject: string;
  reason: string;
  toolName?: string;
  sections: PermissionSection[];
};
export type ApprovalDecision = "allow" | "always" | "deny" | "never";
export type Approval = { id: string; action: string; reason: string; toolName?: string; request?: PermissionRequest };
export type RailTab = "activity" | "files" | "diff" | "preview" | "receipts" | "terminal" | "outputs" | "canvas";
