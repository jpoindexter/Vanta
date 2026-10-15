import type { Approval, Receipt, Run, WorkItem } from "./contract.js";

export type OperatorSourceKind =
  | "team_task"
  | "workflow_task"
  | "ticket"
  | "schedule"
  | "session"
  | "run"
  | "board_lane"
  | "continuity"
  | "work_item"
  | "effect_run"
  | "approval"
  | "receipt";

export type OperatorSourceRef = {
  kind: OperatorSourceKind;
  id: string;
  path: string;
};

export type OperatorWorkItem = {
  source: OperatorSourceRef;
  item: WorkItem;
  related: {
    runIds: string[];
    currentRunId?: string;
    currentAttempt: number;
    approvalIds: string[];
    receiptIds: string[];
  };
};

export type OperatorSourceReport = {
  kind: OperatorSourceKind;
  path: string;
  readOnly: true;
  status: "missing" | "ok" | "degraded" | "unreadable";
  sourceCount: number;
  projectedCount: number;
  sourceIds: string[];
  projectedIds: string[];
  sourceSha256: string;
  projectionSha256: string;
  issues: string[];
};

export type OperatorViews = {
  captured: OperatorWorkItem[];
  now: OperatorWorkItem[];
  waiting: OperatorWorkItem[];
  needsYou: OperatorWorkItem[];
  done: OperatorWorkItem[];
};

export type OperatorSpineSnapshot = {
  version: 1;
  readOnly: true;
  integrity: "ok" | "degraded";
  observedAt: string;
  workItems: OperatorWorkItem[];
  runs: Run[];
  approvals: Approval[];
  receipts: Receipt[];
  views: OperatorViews;
  accomplishments: OperatorWorkItem[];
  sources: OperatorSourceReport[];
  digest: string;
};

export type Projection = {
  workItems?: OperatorWorkItem[];
  runs?: Run[];
  approvals?: Approval[];
  receipts?: Receipt[];
};

export type LoadedSource = {
  report: OperatorSourceReport;
  projection: Projection;
};

export type RawRecord = {
  id: string;
  value: Record<string, unknown>;
};
