export type IntegrationId = "trello" | "dropbox" | "box" | "google-drive" | "atlassian-rovo" | "slack" | "telegram";

export type IntegrationKind = "native" | "connector_pack";
export type IntegrationState = "ready" | "needs_setup" | "installable" | "installed" | "degraded" | "unavailable";
export type IntegrationAction = "test" | "install" | "configure" | "manage_mcp";

export type IntegrationRecord = {
  id: IntegrationId;
  label: string;
  kind: IntegrationKind;
  state: IntegrationState;
  detail: string;
  actions: IntegrationAction[];
  receipt?: IntegrationReceipt;
};

export type IntegrationReceipt = {
  version: 1;
  at: string;
  integration: IntegrationId;
  action: IntegrationAction | "read" | "write";
  outcome: "passed" | "failed";
  detail: string;
};
