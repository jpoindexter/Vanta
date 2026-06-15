export type Session = { id: string; title: string; turns: number; updated: string };
export type Tool = { name: string; desc: string };
export type Goal = { text: string };
export type Status = { kernel: string; model: string; tools: number; sessionId: string; goals: Goal[] };
export type Message = { role: string; content?: string; name?: string };
export type Provider = { id: string; label: string; short: string; models: string[] };
export type EventRow = { label: string; ok?: boolean };
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
export type RailTab = "preview" | "files" | "terminal";
