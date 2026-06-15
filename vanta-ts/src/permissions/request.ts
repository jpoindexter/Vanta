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

type Args = { toolName?: string; action: string; reason: string };

const TITLES: Record<PermissionKind, string> = {
  bash: "Bash permission request",
  file_edit: "File edit permission request",
  file_write: "File write permission request",
  web_fetch: "Web fetch permission request",
  computer_use: "Computer use permission request",
  sandbox: "Sandbox permission request",
  skill: "Skill permission request",
  generic: "Permission request",
};

export function buildPermissionRequest(args: Args): PermissionRequest {
  const kind = kindFor(args.toolName);
  const subject = subjectFor(kind, args.action);
  return {
    kind,
    title: TITLES[kind],
    subject,
    reason: args.reason,
    toolName: args.toolName,
    sections: sectionsFor(kind, subject, args.action),
  };
}

function kindFor(toolName = ""): PermissionKind {
  if (toolName === "shell_cmd") return "bash";
  if (toolName === "edit_file") return "file_edit";
  if (toolName === "write_file") return "file_write";
  if (["web_fetch", "browser_read", "browser_navigate", "screenshot"].includes(toolName)) return "web_fetch";
  if (["browser_act", "look_at_screen", "look_at_camera"].includes(toolName)) return "computer_use";
  if (toolName === "run_code" || toolName === "workflow") return "sandbox";
  if (toolName === "write_skill") return "skill";
  return "generic";
}

function subjectFor(kind: PermissionKind, action: string): string {
  if (kind === "bash") return strip(action, "run shell command:");
  if (kind === "file_edit") return strip(action, "Edit file", "edit file");
  if (kind === "file_write") return strip(action, "Overwrite existing file", "write file");
  if (kind === "web_fetch") return strip(action, "fetch url", "browser read", "navigate", "screenshot");
  return action;
}

function sectionsFor(kind: PermissionKind, subject: string, action: string): PermissionSection[] {
  if (kind === "bash") return [{ label: "Command", value: subject, tone: "code" }, { label: "Options", value: "Runs inside the current project root.", tone: "muted" }];
  if (kind === "file_edit") return [{ label: "Target file", value: subject, tone: "code" }, { label: "Change", value: "Modifies existing file content.", tone: "danger" }];
  if (kind === "file_write") return [{ label: "Target file", value: subject, tone: "code" }, { label: "Write mode", value: writeMode(action), tone: "danger" }];
  if (kind === "web_fetch") return [{ label: "Target", value: subject, tone: "code" }];
  if (kind === "computer_use") return [{ label: "Computer control", value: action, tone: "danger" }];
  if (kind === "sandbox") return [{ label: "Sandbox action", value: action, tone: "code" }];
  if (kind === "skill") return [{ label: "Skill memory", value: action, tone: "muted" }];
  return [{ label: "Action", value: action, tone: "code" }];
}

function strip(value: string, ...prefixes: string[]): string {
  const trimmed = value.trim();
  const prefix = prefixes.find((p) => trimmed.toLowerCase().startsWith(p.toLowerCase()));
  return (prefix ? trimmed.slice(prefix.length) : trimmed).replace(/^:\s*/, "").trim();
}

function writeMode(action: string): string {
  return action.toLowerCase().startsWith("overwrite") ? "Overwrites existing content." : "Creates or writes file content.";
}
