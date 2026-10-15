import {
  envForPermissionMode,
  parsePermissionMode,
  resolvePermissionMode,
  type PermissionMode,
} from "./permission-mode.js";

export type OperatingMode = PermissionMode | "plan";

const NEXT_MODE: Record<OperatingMode, OperatingMode> = {
  default: "acceptEdits",
  acceptEdits: "plan",
  plan: "auto",
  auto: "default",
  fullAccess: "default",
};

export function parseOperatingMode(value: string | undefined): OperatingMode | null {
  if (value === "plan") return "plan";
  return parsePermissionMode(value);
}

export function resolveOperatingMode(env: NodeJS.ProcessEnv): OperatingMode {
  return parseOperatingMode(env.VANTA_OPERATING_MODE) ?? resolvePermissionMode(env);
}

export function permissionModeForOperating(mode: OperatingMode): PermissionMode {
  return mode === "plan" ? "default" : mode;
}

export function envForOperatingMode(mode: OperatingMode): NodeJS.ProcessEnv {
  return {
    VANTA_OPERATING_MODE: mode,
    ...envForPermissionMode(permissionModeForOperating(mode)),
  };
}

export function nextOperatingMode(mode: OperatingMode): OperatingMode {
  return NEXT_MODE[mode];
}
