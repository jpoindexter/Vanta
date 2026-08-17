# TUI v2 Slash Command Palette

## Overview

The TUI slash command palette provides fuzzy-searchable, risk-labeled command discovery. As the user types `/word`, matching commands appear in a categorized palette showing the command name, risk tier, and one-line description.

## Components

### `command-risk.ts`
Defines risk tiers for all slash commands:
- **local**: Safe operations (help, clear, model, etc.) — no approval needed
- **kernel-gated**: Safety-assessed by the kernel (add-dir, etc.)
- **approval-gated**: Requires explicit human approval (goal, tasks, restart, etc.)

### `fuzzy.ts`
Lightweight fuzzy search scorer without external dependencies:
- Character-order matching (loose fuzzy matching)
- Word-boundary bonuses
- Consecutive-match scoring
- Sorts results by relevance

### `transcript.tsx` (Palette component)
Renders the command palette with:
- Fixed command column (left-aligned)
- Risk label column (center)
- Description column (clipped to fit)
- Navigation with ↑↓ and Tab autocomplete
- Active row highlighted in cyan

### `app.tsx`
Integrates fuzzy search into the TUI:
- Detects `/word` input
- Fuzzy-filters SLASH_COMMANDS
- Adds risk labels from command-risk.ts
- Caps results to 8 matches (readable and scannable)

## Provider Model Settings

The model picker exposes one **Model settings** row when the active provider and
model declare effort or speed capabilities. The same capability contract drives
the desktop picker, so unsupported controls stay hidden in both hosts.

- `/model-settings` opens the nested settings view or reports current values in
  the readline REPL.
- `/effort <level> [--session|--global]` supports only the active provider's
  declared levels, including Codex `ultra`.
- `/speed <standard|fast> [--session|--global]` is shown only when declared.
- Session is the safe default. `--global` writes only the selected project
  defaults after the write succeeds.
- The status bar displays the live effort and speed that will be sent on the
  next provider request.

The nested list uses the existing keyboard contract: Up/Down moves, Enter
selects, and Escape returns to the previous view.

## Usage

### Example: User types `/go`

**Before**: Prefix-filtered results only (goal, goals)

**After**: Fuzzy-filtered results sorted by relevance:
```
┌─ Palette ──────────────────────────────┐
│ › /goal <text|status|clear|done N> [approval]   set / manage a goal        │
│   /goals                              [local]    list active goals from … │
└────────────────────────────────────────┘
```

### Example: User types `/rew`

**Fuzzy match**: `review` (r-e-w found in order, word boundary bonus)
```
┌─ Palette ──────────────────────────────┐
│ › /review [effort]                    [approval]  review changed code …  │
└────────────────────────────────────────┘
```

## Risk Labels

Each command displays its risk tier in brackets:

| Label | Meaning | Examples |
|-------|---------|----------|
| `[local]` | No kernel assessment | `/help`, `/clear`, `/model`, `/history` |
| `[kernel]` | Kernel safety gate | `/add-dir` |
| `[approval]` | Explicit human approval | `/goal`, `/tasks`, `/restart`, `/review` |

## Files Changed

- **New**: `src/tui/command-risk.ts` — risk tier definitions (54 lines)
- **New**: `src/tui/fuzzy.ts` — fuzzy search scorer (63 lines)
- **New**: `src/tui/fuzzy.test.ts` — fuzzy search tests (53 lines)
- **New**: `src/tui/command-risk.test.ts` — risk classification tests (28 lines)
- **New**: `src/tui/palette.test.tsx` — palette rendering tests (70 lines)
- **Updated**: `src/tui/transcript.tsx` — Palette component now shows risk labels
- **Updated**: `src/tui/app.tsx` — fuzzy search + risk label integration

## Testing

```bash
# Run palette tests
npm test -- src/tui/palette.test.tsx

# Run fuzzy search tests
npm test -- src/tui/fuzzy.test.ts

# Run risk classification tests
npm test -- src/tui/command-risk.test.ts

# Run all TUI tests
npm test -- src/tui/

# Run focused provider-settings behavior
npx vitest run src/repl/provider-settings-cmd.test.ts src/ui/overlays.test.ts src/ui/status-rich-render.test.tsx
```

All tests pass (186 tests, 25 test files).

## Live TUI Testing

To verify the palette in a live session:

```bash
./run.sh
# In the TUI, type: /go
# Expected: fuzzy matches for /goal and /goals with risk labels
```

## Future Enhancements

1. **Categorization**: Group commands by category (session, editing, tools, etc.)
2. **Keyboard shortcuts**: Show keyboard shortcut hints for common commands
3. **Search history**: Remember recent command searches
4. **Tool palette**: Extend palette to show agent tools with risk tiers
