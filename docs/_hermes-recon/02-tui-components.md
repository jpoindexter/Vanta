# Hermes TUI — Component Tree & Interactive Overlays

Recon of `hermes-reference/ui-tui`. The TUI is React over a **forked Ink** (`@hermes/ink`,
package `packages/hermes-ink`), running as a thin client over a gateway process. `entry.tsx`
spawns a `GatewayClient` (`gw`), then `ink.render(<App gw={gw}/>)`. `App` wires `useMainApp(gw)`
→ five prop bundles (`appActions`, `appComposer`, `appProgress`, `appStatus`, `appTranscript`)
into `AppLayout`, wrapped in `GatewayProvider`.

Forked-Ink public surface (`entry-exports.ts`): `Box`, `Text`, `Link`, `Newline`, `Spacer`,
`ScrollBox`, `AlternateScreen`, `NoSelect`, `RawAnsi`, `Ansi`; hooks `useInput`, `useStdin/out/err`,
`useSelection`, `useTerminalFocus/Title/Viewport`, `useExternalProcess`, `useApp`; `render`,
`measureElement`. Note line 32: it **re-exports stock `ink-text-input`'s `TextInput`** — but the
app does NOT use it; the composer uses its own heavy `components/textInput.tsx` (36KB). State is
**nanostores** (`$uiState`, `$overlayState`, `$isBlocked`, `$uiTheme`) read via `@nanostores/react`.

---

## 1. Component tree

```
App (gatewayContext provider)
└─ AppLayout                                  components/appLayout.tsx
   └─ Shell = AlternateScreen (or Fragment if INLINE_MODE)
      └─ Box column (flexGrow 1)
         ├─ Box row (flexGrow 1)              ← main pane (mutually exclusive)
         │   ├─ AgentsOverlayPane             when overlay.agents  → full-pane subagent tree
         │   └─ TranscriptPane                otherwise
         │       ├─ ScrollBox (stickyScroll)  virtualized transcript
         │       │   ├─ topSpacer
         │       │   ├─ virtualRows[] → per row:
         │       │   │     • intro  → <Banner> + <SessionPanel>
         │       │   │     • panel  → <Panel>
         │       │   │     • else   → <MessageLine>          (user/assistant/tool/system)
         │       │   │   + LiveTodoPanel rides under the last user row
         │       │   ├─ bottomSpacer
         │       │   └─ StreamingAssistant     in-flight assistant + active tools + todos
         │       ├─ TranscriptScrollbar        (NoSelect gutter, right edge)
         │       └─ StickyPromptTracker        (invisible scroll observer)
         ├─ PromptZone                         appOverlays.tsx — modal request strip
         │     (approval | confirm | clarify | sudo | secret)  — only when NOT overlay.agents
         ├─ ComposerPane                       the input area
         │   ├─ QueuedMessages
         │   ├─ "<n> background tasks running"
         │   ├─ sticky-prompt line (↳ …) OR drag spacer
         │   ├─ StatusRulePane at="top"        (if statusBar==='top')
         │   ├─ FloatingOverlays               ← absolute, bottom:100% (floats ABOVE composer)
         │   │     (sessions | modelPicker | skillsHub | pager | completions)
         │   ├─ HelpHint                        when input === '?'
         │   ├─ inputBuf lines (multiline overflow rows)
         │   ├─ PromptPrefix + TextInput + GoodVibesHeart
         │   ├─ "⚕ <status>" line (pre-session)
         │   └─ StatusRulePane at="bottom"     (default)
         └─ FpsOverlay                          when SHOW_FPS
```

Mutual exclusion: `overlay.agents` replaces the **whole** transcript+composer column with the
agents pane. All other overlays float over or sit above the composer, leaving it mounted.

---

## 2. Composer (`ComposerPane` in appLayout.tsx + `components/textInput.tsx`)

- **Multiline**: yes. `input` is the active editable string; `inputBuf` is an array of already-
  committed prior lines rendered above (continuation rows get a blank prompt gutter). Visual height
  computed by `inputVisualHeight`. Custom `TextInput` (NOT ink-text-input) handles cursor, wrap,
  mouse drag-select (`mouseApiRef` → `startAtBeginning`/`dragAt`/`end`).
- **Prompt glyph**: `❯` (theme `brand.prompt`), bold in `color.prompt`; turns `color.shellDollar`
  (blue) when the line starts with `!` (shell passthrough). Profile name can prefix it.
- **Placeholder**: `PLACEHOLDER` when empty; `'Ctrl+C to interrupt…'` while busy.

**Slash / path autocomplete dropdown** (`useCompletion.ts` + `FloatingOverlays`):
- Triggers when `looksLikeSlashCommand(input)` (slash) OR input tail matches a path regex.
  `/model …` is explicitly excluded (it routes to the two-step ModelPicker instead).
- Debounced 60ms RPC: `complete.slash {text}` or `complete.path {word}`. Returns
  `items: {text, display, meta}[]` + `replace_from`. On error, shows a single
  "completion unavailable" row with the error in meta.
- **Window**: fixed 16-row viewport (`COMPLETION_WINDOW`) centered on `compIdx` so height doesn't
  bounce while scrolling. Width `max(28, cols-6)`.
- **Keys** (`useInputHandlers.ts`): `↑/↓` cycle (wrap-around, modulo) while completions present and
  not in history mode; `Tab` accepts the current row (`key.tab && completions.length`).
  Each row shows `<display>` (bold, `color.label`) + optional `<meta>` (muted, separate bg).
  Active row uses `completionCurrentBg`; others `completionBg`.

```
┌──────────────────────────────────────────┐  ← floats above composer (bottom:100%)
│ /clear        start a new session         │
│▸/copy         copy selection/last reply   │  ← active row inverse/highlighted bg
│ /details      control transcript detail   │
└──────────────────────────────────────────┘
❯ /c▎
```

**History** (`useInputHistory.ts`, `lib/history.ts`): `↑` recalls previous, `↓` newer — but only
when `inputBuf` is empty AND the cursor has no line above/below (so multiline editing still uses
arrows for navigation). `cycleQueue` is tried first, then `cycleHistory`. Draft is preserved in
`historyDraftRef` while browsing. New submissions appended via `pushHistory`.

**Paste** (`useComposerState.ts`): bracketed paste and hotkey paste (Cmd/Ctrl+V) both route to
`handleTextPaste`. Hotkey paste reads clipboard, preferring **OSC52** on remote shell sessions,
else native clipboard, with fallback. Heuristics:
- **Dropped path** (`looksLikeDroppedPath`: `file://`, `~/`, `./`, `/…/`, `C:\`, quoted) → RPC
  `image.attach` then `input.detect_drop`; resolves to an attachment token.
- **Large paste** (≥ `pasteCollapseLines` lines or `pasteCollapseChars` chars) → collapsed to a
  `pasteTokenLabel` placeholder; full text stored as a `PasteSnippet` and offloaded via
  `paste.collapse` RPC (returns a path). Caps: 32 snippets / 4MB total.
- **`Ctrl+G`-ish editor**: `openEditor` writes buffer to a tempfile, suspends Ink, opens `$EDITOR`,
  resubmits on save.

---

## 3. Status bar (`StatusRule` in `components/appChrome.tsx`)

Single row (`height={1}`), default at **bottom** (configurable to top). Left = pinned essentials +
progressively-disclosed tail segments; right = cwd/branch label. Segments separated by ` │ `.

**Pinned essentials (never drop):**
`─ ` + busy face/status + ` │ ` + model + ` │ ` + context.

**Tail segments**, added only if they fit (descending priority): context **bar** → **duration** →
**compressions** (`cmp N`, colored by count) → **voice** → **session count** (clickable → opens
sessions overlay) → **background** (`N bg`) → **cost** (`$0.0000`, only if `showCost`). Then
`SpawnHud` (delegation HUD, self-hiding). Right side: ` ─ ` + truncated `cwdLabel`.

Context read-out: `<used>/<max>` normally, collapses to `<used> tok` on narrow terminals; bar
dropped entirely when too narrow. Busy state swaps the status word for an animated `FaceTicker`
(kaomoji w/ verb, or unicode spinner depending on `indicatorStyle`).

```
─ thinking… │ Hermes-3-405B │ 24k/128k │ [████░░░░] 32% │ 0:42 │ 3 sessions │ $0.0184  ─  ~/proj  main
```
Narrow:
```
─ ready │ Hermes-3-405B │ 24k tok  ─  ~/proj
```

---

## 4. Banner / startup screen (`banner.ts` + `Banner`/`SessionPanel` in `branding.tsx`)

Rendered as the transcript `intro` row. `Banner` is **responsive by column count** (terminals
can't scale glyphs, so it picks a tier):

- `cols ≥ LOGO_WIDTH+2`: full **ASCII block logo** `HERMES-AGENT` (6-line `LOGO_ART`, gradient
  primary→accent→border→muted) + tagline `⚕ Nous Research · Messenger of the Digital Gods`.
- `cols ≥ 58`: `CompactBanner` — a centered rule with brand name + tagline + underline rule.
- `cols ≥ 34`: bare bold name + tagline (`⚕ Hermes Agent`).
- `cols < 34`: hidden.

`banner.ts` also defines `CADUCEUS_ART` (braille hero glyph) used by `SessionPanel`, and
`parseRichMarkup` (parses `[#hex]…[/]` for custom themed banners).

**SessionPanel** (the boxed startup card, round border): wide layout (cols ≥ 90) shows the caduceus
hero art column + model name · "Nous Research" · cwd · `Session: <sid>`; narrow layout drops the
hero. Then collapsible sections (click `▸/▾`): **Available Tools** (open by default), **Available
Skills** (collapsed, shows category counts), **System Prompt** (collapsed, char count),
**MCP Servers** (collapsed, name `[transport]`: N tools / failed). Footer:
`<N> tools · <N> skills · <N> MCP · /help for commands`, plus an "N commits behind — run hermes
update" warning when applicable.

Brand defaults: name `Hermes Agent`, icon `⚕`, prompt `❯`, tool glyph `┊`,
welcome `Type your message or /help for commands.`, goodbye `Goodbye! ⚕`.

---

## 5. Overlays

Two families: **PromptZone** (modal request strip above composer; blocks input via `$isBlocked`)
and **FloatingOverlays** (float above composer, `position:absolute bottom:100%`, in `FloatBox`).

### Model picker (`components/modelPicker.tsx`) — FloatingOverlay
Opens via `/model` (overlay.modelPicker). RPC `model.options`. **Two-step wizard** with stages
`provider → model` (+ `key` and `disconnect` sub-stages). 12 visible rows, width clamped 40–90.
- **Provider stage (1/2)**: rows `<authMark> <name> · <N models|(no key)|(needs setup)>`. authMark:
  `*` current, `●` authenticated, `○` unauthenticated. Shows current model, warning line, persist
  mode.
- **Model stage (2/2)**: rows `<idx>. <modelId>`, `*` marks current model.
- **Type-to-filter**: any printable char extends a per-stage fuzzy filter (`fuzzyRank`); Backspace
  trims; `Ctrl+U` clears. Filter shows as `filter: foo▎`.
- **Keys**: `↑/↓` select · `Enter` choose/advance · `Esc` clears filter then steps back (then
  cancels) · `q` close (only when filter empty) · `Ctrl+G` toggle persist global/session ·
  `Ctrl+D` disconnect (provider stage, authenticated only).
- **Key sub-stage**: masked `•` input, saves via `model.save_key`. `Enter` save · `Ctrl+U` clear ·
  `Esc` back.
- **Disconnect sub-stage**: `y/Enter` confirm · `n/Esc` cancel.
- On select emits `<model> --provider <slug>` + `--global` or session flag → `onModelSelect`.

```
┌ Select provider (step 1/2) ───────────────────┐
│ Full model IDs on the next step · Enter to continue
│ Current: Hermes-3-405B
│ type to filter · ↑/↓ select
│▸ 1. * Nous · 4 models
│  2. ● OpenAI · 12 models
│  3. ○ Anthropic · (no key)
│ persist: session · ^g toggle
│ ↑/↓ select · Enter choose · ^d disconnect · Esc clear/back · q close
└────────────────────────────────────────────────┘
```

### Active session switcher (`components/activeSessionSwitcher.tsx`) — FloatingOverlay
Opens via `/resume` or clicking the session count in the status bar (overlay.sessions). RPC
`session.active_list`. Lists **live sessions** (activate/close) then a **New session** row
(orchestrator prompt entry) then **resumable history** rows (resume/delete). `▸ ` marks selection;
selected row uses `selectionBg`.
- **Keys**: `↑↓` move · `Enter` activate live / start new / resume history · `d` arms delete on a
  history row · `Esc`/`q` close. The New row accepts a typed orchestrator prompt (`onNewPrompt`)
  with an optional draft model. Context hint segments switch per selected row type
  (`Enter resume · d delete` vs new-row prompt hint).

### Skills hub (`components/skillsHub.tsx`) — FloatingOverlay
Opens via `/skills` (overlay.skillsHub). RPC `skills.manage {action:'list'}`. Stages
`category → skill → actions`. 12 visible rows, width 40–90. Lists skills grouped by category;
drill in to view/install a skill (`installing` state). Uses shared `useOverlayKeys` (`Esc`/`q`
back/close) + `windowItems` paging.

### Pager (FloatingOverlay) — this is the **/help screen** and any long text
`/help` (and other long output) renders via `patchOverlayState({ pager: {lines, offset, title} })`
(see `useMainApp.ts` `openPager`). Title centered; `pagerPageSize` lines shown per page.
- **Keys** (verbatim hint): `↑↓/jk line · Enter/Space/PgDn page · b/PgUp back · g/G top/bottom ·
  Esc/q close (offset/total)`.

### Help hint (`components/helpHint.tsx`) — quick `?` popup
Typing a bare `?` floats a small round-bordered card: "? quick help · type /help for the full panel
· backspace to dismiss", then **Common commands** (`/help /clear /resume /details /copy /quit`) and
the first 8 **Hotkeys** (`HOTKEYS`). Dismissed by backspace.

### Approval prompt (`components/prompts.tsx::ApprovalPrompt`) — PromptZone
Double-border warning box. Shows description + up to 10 lines of the command (overflow `… +N more`).
Options: `1. Allow once · 2. Allow this session · 3. Always allow · 4. Deny`.
- **Keys**: `↑/↓` select · `Enter` confirm · `1-4` quick pick · `Esc`/`Ctrl+C` → deny.

### Clarify prompt (`ClarifyPrompt`) — PromptZone
"ask <question>" + numbered choices + an "Other (type your answer)" row that switches to a
`TextInput`. `↑/↓` · `Enter` confirm · `1-N` quick pick · `Esc` back/cancel.

### Confirm prompt (`ConfirmPrompt`) — PromptZone
Double-border (error color if `danger`). Title + detail, rows No/Yes.
`↑/↓` · `Enter` · `Y/N` quick · `Esc` cancel.

### Masked prompts (`maskedPrompt.tsx`) — PromptZone
`sudo` (`🔐 sudo password required`) and `secret` (`🔑 <prompt> for <ENV_VAR>`). Masked input.

### Agents overlay (`components/agentsOverlay.tsx`) — full-pane (replaces transcript)
Opens via `/agents` or `/replay N` (overlay.agents). Full-width subagent delegation tree. Two view
modes: `list` (row picker) ↔ `detail` (full-width inspector). Rows show goal · depth · `⚡N` active ·
child rollup · status (running/queued/error spinner). Live (polls ~500ms) or **replay** mode
(historical snapshot; controls locked).
- **Controls hint**: live → `x kill · X subtree · p pause/resume`; replay → `controls locked`.
- **Keys**: `↑↓`/`j/k` navigate, `Enter` → detail (or `Esc` back to list), `Esc`/`q` close,
  replay nav cycles `historyIndex` (flashes `replay · N/total`). Has a `DiffView` sub-view
  (baseline vs candidate metrics: agents/tools/depth/duration/tokens/cost; `esc/q close`).
- Empty state: "No subagents this turn. Trigger delegate_task to populate the tree."

---

## 6. Transcript (`TranscriptPane` + `MessageLine` + `StreamingAssistant` + `ToolTrail`)

`ScrollBox` with `stickyScroll` (auto-pins to bottom unless user scrolled up). **Virtualized**:
only `virtualRows[start..end]` render, with top/bottom spacers and `measureRef` per row. Multi-turn
segmentation: each user message after the first gets a `───` separator above it. A blank-cell click
clears text selection.

**Row rendering** (`MessageLine`, gutter glyph + body):
| role | glyph | colors |
|---|---|---|
| user | `❯` (brand.prompt), bold | prefix+body `color.label` |
| assistant | `┊` (brand.tool) | prefix `color.border`, body `color.text` |
| tool (result) | `⚡` | round-bordered muted box, `marginLeft 3`, truncated preview |
| system | `·` | prefix `color.muted`, no body color |

- **Assistant body**: rendered as markdown via `<Md>` (`components/markdown.tsx`); when streaming,
  `<StreamingMd>` re-tokenizes only the in-flight tail.
- **Tool results**: `compactPreview` truncated; raw ANSI passed through `<Ansi>` (sanitized) when
  the text contains escapes.
- **Long user paste**: collapses the `[long message]` token to a dim inline marker.
- **Long system msg** (>400 chars): collapsible `▸/▾` with char count.

**Streaming area** (`StreamingAssistant`): renders grouped stream segments, then active tools,
then the in-flight assistant message (`isStreaming`), then pending tools. `LiveTodoPanel` renders
the live todo list under the last user row.

**Tool call display** (`ToolTrail` / `Thinking` in `components/thinking.tsx`): collapsible
`▾/▸` "Thinking" (reasoning preview) and tool trail rows. Each tool shows a braille spinner while
running, a status tone (dim/warn/error for ok/interrupted/failed), and a rollup suffix:
`status · elapsed · ⚡<activeCount>` + per-branch tool/agent/token/cost. Reasoning streams with a
`▍` cursor.

**Theme** (`theme.ts`): two built-in palettes (dark gold/bronze + a light variant). Dark defaults:
`primary #FFD700`, `accent #FFBF00`, `border #CD7F32`, `prompt #FFF8DC`, `shellDollar #4dabf7`,
`selectionBg #3a3a55`, `completionCurrentBg #333355`. Themes are user-overridable via skin colors
(`ui_primary`, `banner_title`, etc.) with ANSI-luminance normalization for legibility.

---

## Argo-port notes

Argo uses **stock Ink + stock `ink-text-input`, in-process (no gateway)**. Mapping difficulty:

**Easy ports (stock-Ink primitives, sync local data):**
- Status bar (`StatusRule`) — pure layout/`Box`/`Text`; just feed it local model/usage/cwd. The
  progressive-disclosure width math is self-contained. Drop the click handler if not wiring it.
- Banner / startup card — pure `Box`/`Text` art; the responsive tiers work on stock Ink. ASCII
  logo + collapsible sections are stock-friendly (collapsibles need local `useState`, fine).
- Prompts: approval / confirm / clarify / masked — pure `useInput` + `Box`; their `*Action` helpers
  are already pure functions. These are the cleanest ports.
- Help hint, pager — pure render + `useInput`/`useOverlayKeys`-equivalent. Port `useOverlayKeys`
  as a tiny local hook.
- Transcript message rows (`MessageLine` skeleton, gutter+glyph+body) — stock `Box`/`Text`.

**Medium (need custom component or local equivalent):**
- Completion dropdown — logic is fine, but it's an **RPC** (`complete.slash`/`complete.path`).
  Replace with a local synchronous command/path matcher; render layer ports cleanly.
- Model picker / skills hub / session switcher — UI/key-handling ports, but every data source is an
  RPC (`model.options`, `skills.manage`, `session.active_list`). Argo must supply in-process
  equivalents. The two-step wizard + fuzzy filter UX is reusable as-is.
- Composer multiline + history + slash dropdown — stock `ink-text-input` is single-line and has no
  mouse/multiline/paste-collapse. To match Hermes you'd wrap it or accept single-line-ish behavior.
  History (`↑/↓`) is easy on top of `ink-text-input` via controlled value. Paste-collapse and
  editor-launch are nice-to-haves; skip for v0.

**Hard / needs custom component (forked-Ink-dependent):**
- `ScrollBox` + virtualization + `stickyScroll` + `TranscriptScrollbar` + mouse-wheel accel +
  `StickyPromptTracker` — **stock Ink has no ScrollBox**. This is the single biggest gap. Argo
  needs either a custom scroll component or to lean on terminal-native scrollback (inline mode).
- `AlternateScreen`, `NoSelect`, mouse drag-select, `Ansi`, OSC52 clipboard, `withInkSuspended`,
  hyperlink-click — all forked-Ink features absent from stock Ink. Drag-to-select composer text,
  click-to-open-URL, and the `⚡` tool-box ANSI passthrough won't work without custom work.
- Agents overlay — large, replay/diff/live-poll machinery + full-pane swap. Defer entirely; it's
  delegation-tooling, not core chat.
- Streaming markdown incremental tokenizer (`StreamingMd`) — works on stock Ink (`Box`/`Text`) but
  is substantial; a plain "re-render full markdown per delta" is the easy v0 substitute.

**Recommendation:** port status bar, banner, prompts, message rows, and a local completion dropdown
first (all easy). Accept stock `ink-text-input` single-line composer + `↑/↓` history for v0. The
scrolling transcript is the real decision point — either build/borrow a ScrollBox or run inline and
let the terminal scroll. Everything mouse/selection/ANSI-related is forked-Ink-only; treat as
post-v0.
