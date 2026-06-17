// Vanta's TUI accent palette — its own chosen scheme (~/Desktop/vanta-tui-colors.html).
// The TUI stays ~85% monochrome (terminal-default fg); these accents color SYMBOLS
// (markers/glyphs), never whole lines, to signal one role per row. Plain constants —
// NOT a theme system (no provider, no switching, no terminal detection). Text and the
// VANTA wordmark stay the terminal default (near-white).
export const FOCUS = "#6bdcff"; // prompt chevron, cursor, active tool, selection
export const HEALTH = "#83f2b0"; // kernel/MCP ✓, successful checks
export const ACTIVITY = "#ffb86b"; // thinking / running / paused / approval-needed
export const GOAL = "#b7a4ff"; // current goal/task line, memory/context markers
export const RISK = "#ff6b7a"; // blocked, destructive risk, failed verification
