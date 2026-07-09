// Ghost OS integration metadata, ported from ghostwright/ghost-os' Swift MCP
// tool registry. Keep this as a TypeScript contract layer: Ghost's native AX
// engine remains an external macOS binary, while Vanta owns install policy.

export const GHOST_OS_DEFAULT_TOOLS = [
  "ghost_context",
  "ghost_state",
  "ghost_find",
  "ghost_read",
  "ghost_inspect",
  "ghost_element_at",
  "ghost_screenshot",
  "ghost_annotate",
  "ghost_ground",
  "ghost_parse_screen",
  "ghost_wait",
  "ghost_recipes",
  "ghost_recipe_show",
  "ghost_learn_status",
] as const;

export const GHOST_OS_OPT_IN_TOOLS = [
  "ghost_click",
  "ghost_hover",
  "ghost_long_press",
  "ghost_drag",
  "ghost_type",
  "ghost_press",
  "ghost_hotkey",
  "ghost_scroll",
  "ghost_focus",
  "ghost_window",
  "ghost_run",
  "ghost_recipe_save",
  "ghost_recipe_delete",
  "ghost_learn_start",
  "ghost_learn_stop",
] as const;

export type GhostOsTool = (typeof GHOST_OS_DEFAULT_TOOLS)[number] | (typeof GHOST_OS_OPT_IN_TOOLS)[number];

export const GHOST_OS_ALL_TOOLS: readonly GhostOsTool[] = [...GHOST_OS_DEFAULT_TOOLS, ...GHOST_OS_OPT_IN_TOOLS];

export function isGhostOsMutatingTool(tool: string): boolean {
  return (GHOST_OS_OPT_IN_TOOLS as readonly string[]).includes(tool);
}
