export type CapacityDimensionLevel = "unknown" | "low" | "steady" | "high";
export type CapacityDimensions = {
  cognitive: CapacityDimensionLevel; attentional: CapacityDimensionLevel; sensory: CapacityDimensionLevel;
  social: CapacityDimensionLevel; emotional: CapacityDimensionLevel; physical: CapacityDimensionLevel; time: CapacityDimensionLevel;
};
export type ContinuityItem = {
  version: 1; id: string; outcome: string; source: string;
  state: "draft" | "queued" | "running" | "waiting" | "needs human" | "stopped" | "failed" | "unverified" | "verified";
  owner?: string; waitCondition?: string; nextAction?: string; resumeContext?: string; updatedAt: string;
  recommendation: string; choices: Array<"do it" | "show me" | "snooze">;
  preparedAction: { kind: "read_local_file"; target: string; minutes: number; reversible: true; preview: string };
  provenanceMemory: Array<{ source: string; sourceId?: string; capturedAt: string }>;
  followUp: { at?: string; condition?: string };
  timeCapacityFit: { minutes: number; capacity: CapacityDimensions };
  blocker: string;
  artifacts: Array<{ kind: "file" | "draft" | "link" | "note"; ref: string; sha256?: string }>;
  lastVerified?: { state: ContinuityItem["state"]; at: string; evidence: string };
};
export type ContinuitySnapshot = {
  integrity: "ok" | "degraded";
  diagnostics: Array<{ code: string; message: string; recovery: string }>;
  today: ContinuityItem[]; inbox: ContinuityItem[];
  projects: Array<{ id: string; label: string; itemCount: number }>;
  runs: Array<{ id: string }>; approvals: Array<{ id: string }>; receipts: Array<{ id: string }>;
  projections: {
    captured: ContinuityItem[]; now: ContinuityItem[]; waiting: ContinuityItem[];
    needsYou: ContinuityItem[]; done: ContinuityItem[];
  };
  legacy: { reconciledAt: string; sources: Array<{ kind: string; readOnly: true; count: number; ids: string[]; sha256: string; error?: string }> };
  operator: {
    version: 1; readOnly: true; integrity: "ok" | "degraded"; observedAt: string; digest: string;
    views: { captured: unknown[]; now: unknown[]; waiting: unknown[]; needsYou: unknown[]; done: unknown[] };
    sources: Array<{
      kind: string; path: string; readOnly: true; status: "missing" | "ok" | "degraded" | "unreadable";
      sourceCount: number; projectedCount: number; sourceIds: string[]; projectedIds: string[];
      sourceSha256: string; projectionSha256: string; issues: string[];
    }>;
  };
  support: {
    capacity: CapacityDimensions;
    transient: { setAt?: string; reviewAt?: string; expiresAt?: string; expired: boolean };
    quietHours: { enabled: boolean; start: string; end: string };
    interruptionBudget: { daily: number; remaining: number };
    interaction: { reducedMotion: boolean; streaming: boolean; autoScroll: boolean };
    refusal: { active: boolean; scope?: "session" | "pattern" | "global" };
  };
  reentry?: { itemId: string; action: string };
};
