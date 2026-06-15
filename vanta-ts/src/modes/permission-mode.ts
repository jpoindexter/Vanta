export type PermissionMode = "default" | "acceptEdits" | "auto";

const ACCEPT_EDITS_TOOLS = new Set(["write_file", "edit_file", "read_file", "mkdir", "glob_files", "grep_files"]);

export function parsePermissionMode(mode: string | undefined): PermissionMode | null {
  if (mode === "auto") return "auto";
  if (mode === "acceptEdits" || mode === "accept-edits" || mode === "accept_edits") return "acceptEdits";
  if (mode === "default" || mode === "normal" || mode === "manual") return "default";
  return null;
}

export function resolvePermissionMode(env: NodeJS.ProcessEnv): PermissionMode {
  const explicit = parsePermissionMode(env.VANTA_PERMISSION_MODE);
  if (explicit) return explicit;
  return env.VANTA_AUTO_MODE === "1" ? "auto" : "default";
}

export function envForPermissionMode(mode: PermissionMode): NodeJS.ProcessEnv {
  return {
    VANTA_PERMISSION_MODE: mode,
    VANTA_AUTO_MODE: mode === "auto" ? "1" : "0",
  };
}

export function acceptsEditsWithoutKernel(mode: PermissionMode, toolName: string): boolean {
  return mode === "acceptEdits" && ACCEPT_EDITS_TOOLS.has(toolName);
}
