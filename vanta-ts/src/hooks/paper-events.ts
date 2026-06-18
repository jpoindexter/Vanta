import { SHELL_HOOK_EVENTS } from "./shell-hooks.js";
import type { ShellHookEvent } from "./shell-hooks.js";

// Source: arXiv:2604.14228v1, "Dive into Claude Code", §6 Extensibility.
// The paper groups 27 hook events as 5 safety + 22 lifecycle/orchestration
// events. Keep this map separate from SHELL_HOOK_EVENTS so changes to Vanta's
// schema can be checked against the external reference.

export type PaperHookGroup =
  | "tool_authorization"
  | "session_lifecycle"
  | "user_interaction"
  | "subagent_coordination"
  | "context_management"
  | "workspace"
  | "notification";

export type PaperHookCoverage = {
  group: PaperHookGroup;
  paper: readonly string[];
  supported: readonly ShellHookEvent[];
  missing: readonly string[];
};

export const PAPER_HOOK_EVENTS: Readonly<Record<PaperHookGroup, readonly string[]>> = {
  tool_authorization: [
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "PermissionDenied",
  ],
  session_lifecycle: ["SessionStart", "SessionEnd", "Setup", "Stop", "StopFailure"],
  user_interaction: ["UserPromptSubmit", "Elicitation", "ElicitationResult"],
  subagent_coordination: ["SubagentStart", "SubagentStop", "TeammateIdle", "TaskCreated", "TaskCompleted"],
  context_management: ["PreCompact", "PostCompact", "InstructionsLoaded", "ConfigChange"],
  workspace: ["CwdChanged", "FileChanged", "WorktreeCreate", "WorktreeRemove"],
  notification: ["Notification"],
} as const;

export function flattenPaperHookEvents(): readonly string[] {
  return Object.values(PAPER_HOOK_EVENTS).flat();
}

export function paperHookCoverage(vantaEvents: readonly ShellHookEvent[] = SHELL_HOOK_EVENTS): readonly PaperHookCoverage[] {
  const supported = new Set<string>(vantaEvents);
  return Object.entries(PAPER_HOOK_EVENTS).map(([group, paper]) => {
    const present = paper.filter((event): event is ShellHookEvent => supported.has(event));
    return {
      group: group as PaperHookGroup,
      paper,
      supported: present,
      missing: paper.filter((event) => !supported.has(event)),
    };
  });
}

export function missingPaperHookEvents(vantaEvents: readonly ShellHookEvent[] = SHELL_HOOK_EVENTS): readonly string[] {
  return paperHookCoverage(vantaEvents).flatMap((row) => row.missing);
}

export function vantaExtraHookEvents(vantaEvents: readonly ShellHookEvent[] = SHELL_HOOK_EVENTS): readonly ShellHookEvent[] {
  const paper = new Set(flattenPaperHookEvents());
  return vantaEvents.filter((event) => !paper.has(event));
}

export function hookParitySummary(vantaEvents: readonly ShellHookEvent[] = SHELL_HOOK_EVENTS): string {
  const paperCount = flattenPaperHookEvents().length;
  const missing = missingPaperHookEvents(vantaEvents);
  const extras = vantaExtraHookEvents(vantaEvents);
  return [
    `paper_events=${paperCount}`,
    `vanta_events=${vantaEvents.length}`,
    `missing=${missing.length ? missing.join(",") : "none"}`,
    `vanta_extra=${extras.length ? extras.join(",") : "none"}`,
  ].join(" ");
}
