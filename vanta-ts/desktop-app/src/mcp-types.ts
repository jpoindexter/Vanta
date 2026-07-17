export type DesktopMcpHealth = "ready" | "needs_setup" | "blocked" | "disabled" | "error";
export type DesktopMcpTrust = "trusted" | "denied" | "pending";
export type DesktopMcpAuth = "ready" | "needs_auth" | "not_required";

export type DesktopMcpConnector = {
  name: string;
  source: "environment" | "project" | "user";
  transport: "stdio" | "http";
  enabled: boolean;
  trust: DesktopMcpTrust;
  auth: DesktopMcpAuth;
  authMode: "oauth" | "environment" | "none";
  missingEnv: string[];
  health: DesktopMcpHealth;
  tools: string[];
  resources: string[];
  lastCheckedAt?: string;
  lastError?: string;
};

export type DesktopMcpCatalogEntry = {
  name: string;
  description: string;
  defaultTools: string[];
  optInTools?: string[];
  authEnv?: string[];
  docsUrl?: string;
  installed: boolean;
};

export type DesktopMcpReceipt = {
  version: 1;
  at: string;
  action: string;
  server?: string;
  outcome: "passed" | "failed";
  detail: string;
};

export type DesktopMcpPayload = {
  connectors: DesktopMcpConnector[];
  catalog: DesktopMcpCatalogEntry[];
  receipts: DesktopMcpReceipt[];
  message?: string;
  authUrl?: string;
  resource?: { uri: string; preview: string };
};

export type DesktopMcpAction =
  | "test" | "reconnect" | "enable" | "disable" | "trust" | "deny"
  | "install" | "import_desktop" | "remove" | "auth" | "read_resource";

export type DesktopMcpActionRequest = {
  action: DesktopMcpAction;
  name?: string;
  uri?: string;
  withTools?: string[];
};

export type DesktopMcpSummary = { servers: number; tools: number; resources: number };
