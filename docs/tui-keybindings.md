# Vanta TUI composer — complete keybinding spec

> Roadmap: `TUI-KEYS` (line editing) + `TUI-SELECT` (selection + clipboard). The "build every
> known shortcut" spec. **Shipped today:** `Ctrl+U`, `Ctrl+W`, `Esc` (abort), `↑/↓` history,
> `Shift+Enter` newline. Everything below `[ ]` is to build. Target = full readline/Emacs parity
> + macOS Cmd conventions in `tui/composer.tsx`.

## Cursor movement

| Key | Action | Status |
|---|---|---|
| `Ctrl+A` / `Home` | start of line | [ ] |
| `Ctrl+E` / `End` | end of line | [ ] |
| `Ctrl+B` / `←` | back one char | [ ] |
| `Ctrl+F` / `→` | forward one char | [ ] |
| `Alt/Option+B` / `Ctrl+←` | back one word | [ ] |
| `Alt/Option+F` / `Ctrl+→` | forward one word | [ ] |
| `Cmd+←` | start of line (macOS) | [ ] |
| `Cmd+→` | end of line (macOS) | [ ] |
| `↑` / `↓` | history prev/next (or line nav in multiline) | ✅ history |
| `Cmd+↑` / `Cmd+↓` | top / bottom of input | [ ] |
| `Alt+↑` / `Alt+↓` | move line up / down | [ ] |

## Deletion / kill

| Key | Action | Status |
|---|---|---|
| `Backspace` / `Ctrl+H` | delete char before | ✅ |
| `Ctrl+D` / `Delete` | delete char after (forward) | [ ] |
| `Ctrl+W` / `Alt+Backspace` / `Ctrl+Backspace` | delete word before | ✅ `Ctrl+W` |
| `Alt/Option+D` | delete word after (forward) | [ ] |
| `Ctrl+U` | delete to start of line | ✅ |
| `Ctrl+K` | kill to end of line | [ ] |
| `Cmd+Backspace` | delete to start of line (macOS) | [ ] |
| `Cmd+Delete` | delete to end of line (macOS) | [ ] |

## Edit / kill-ring

| Key | Action | Status |
|---|---|---|
| `Ctrl+Y` | yank (paste last killed text) | [ ] |
| `Alt+Y` | yank-pop (cycle kill ring) | [ ] |
| `Ctrl+T` | transpose chars | [ ] |
| `Alt/Option+T` | transpose words | [ ] |
| `Alt/Option+U` / `L` / `C` | uppercase / lowercase / capitalize word | [ ] |
| `Ctrl+_` / `Cmd+Z` | undo | [ ] |
| `Cmd+Shift+Z` / `Ctrl+Y`(redo) | redo | [ ] |

## Selection (shift-select) — `TUI-SELECT`

| Key | Action | Status |
|---|---|---|
| `Shift+←` / `Shift+→` | extend selection by char | [ ] |
| `Shift+Alt+←` / `Shift+Alt+→` | extend selection by word | [ ] |
| `Shift+Cmd+←` / `Shift+Cmd+→` | extend selection to line start / end | [ ] |
| `Shift+↑` / `Shift+↓` | extend selection by line | [ ] |
| `Shift+Home` / `Shift+End` | extend to line start / end | [ ] |
| `Cmd+A` / `Ctrl+Shift+A` | select all | [ ] |
| typing with a selection | replaces the selection | [ ] |

## Clipboard

| Key | Action | Status |
|---|---|---|
| `Cmd+C` | copy selection | ✅ `/copy` (whole) |
| `Cmd+X` | cut selection | [ ] |
| `Cmd+V` / `Ctrl+Shift+V` | paste | ✅ `/paste` |
| `Cmd+A` then `Cmd+C` | select-all + copy | [ ] |

## Submission / multiline / control

| Key | Action | Status |
|---|---|---|
| `Enter` | submit | ✅ |
| `Shift+Enter` / `Alt+Enter` | newline | ✅ `Shift+Enter` |
| `Esc` | abort / clear input | ✅ |
| `Ctrl+C` | interrupt running turn / cancel | ✅ |
| `Ctrl+L` | clear screen | [ ] |
| `Ctrl+R` | reverse history search | [ ] |
| `Tab` | autocomplete (context reference, `/command`) | ✅ |
| `Ctrl+G` | cancel search / selection | [ ] |

## Implementation notes
- Terminal keyboards don't always distinguish all chords (e.g. `Shift+Enter` needs a modern
  terminal / kitty-keyboard protocol; `Cmd` chords depend on the terminal forwarding them).
  Detect capability + degrade gracefully; document which require a capable terminal.
- A selection model (anchor + cursor) is the prerequisite for `TUI-SELECT` — build it once;
  shift-arrows extend it, typing/cut replace it, copy reads it.
- Vim mode (`TUI-VIM`, shipped) is the alternative editing model; these are the default/Emacs set.
- Keep parity with the readline bindings users already know from bash/zsh/Claude CLI.

## Context references

Type a reference in the composer and press `Tab` to see the supported forms. Vanta
shows an expansion receipt or an inline warning before the turn runs.

| Reference | Context added |
|---|---|
| `@path` or `@file:path` | project file (legacy and explicit forms) |
| `@file:path:10-25` | selected line range |
| `@folder:path` | bounded recursive file list |
| `@diff` / `@staged` | working-tree / staged patch |
| `@git:5` | recent commit subjects and stats (maximum 20) |
| `@url:https://…` | readable public web content |

Paths cannot escape the project root. Sensitive paths and binary files are refused.
Each reference is capped at 20,000 characters and total expanded payload at 60,000;
Vanta warns instead of silently truncating or overloading the prompt.
