# Vanta Desktop design contract (desktop-next)

Principles are inherited from the Hermes desktop `DESIGN.md` (MIT): one source per concern,
tokens over literals, flat over boxed, one primitive per control, motion follows state.
The visual language below is a Vanta reimplementation informed by observation of Codex and
Claude desktop. No code, icons, fonts or logos from those apps.

## What the app is
One agent, one surface. Chat is home for doing work; Home is the dashboard for supervising
it. Everything the agent needs from the human is reachable in one click from anywhere.

## Layout (1440x900 reference)
```
+--------------------------------------------------------------------------------------+
| titlebar 44 / toolbar 46  [sidebar] [new]  Session title v   Project chip  ● Waiting for you   [pane][⋯] |
+-------------+------------------------------------------------------+------------------+
| sidebar 275 | main                                                  | workbench 400    |
|             |  Home = dashboard  |  Chat = thread + composer        |  (closed by      |
| New  ⌘N     |                                                      |   default)       |
| Search ⌘K   |  Chat column 720 centered                            |  Changes         |
| Home        |   user bubble (right, soft fill)                     |  Files           |
| Schedules   |   assistant text (left, plain)                       |  Browser         |
| Connections |   tool rows: "Ran 3 commands >" (collapsed, muted)   |  Terminal        |
| Skills      |   diff card: "Edited 3 files  +12 -3"               |  Outputs         |
|             |   approval card inline (exact action, Allow/Deny)    |                  |
| NEEDS YOU 2 |   queued messages                                    |                  |
| Pinned      |  composer 720 x min 96, radius 20, docked            |                  |
| Project A   |   [+] [mic]  model  effort  permission    [send/stop]|                  |
|  ● session  |                                                      |                  |
|  ○ session  |                                                      |                  |
| footer:     |                                                      |                  |
|  profile ⚙  |                                                      |                  |
+-------------+------------------------------------------------------+------------------+
```
- Sidebar 275 default (resize 240-520). Nav rows 36px, session rows 32px, radius 8, selected = surface-selected, no outline.
  Status dot per session: running (animated), waiting-for-you (amber), failed (red), done (none).
- "Needs you" appears only when something is waiting (approvals, blocked, question); count badge.
- Titlebar carries one status pill: Running / Waiting for you / Offline. Never two status bands.
- Workbench opens on user intent only (never because a tool produced something).
- Narrow (<900): sidebar is an overlay, workbench is a sheet, chat column fills width.

## Home (agent dashboard), top to bottom
1. Composer ("What should Vanta do?") with recent projects as chips.
2. Needs you: approvals (inline Allow once / Always / Deny), blocked tasks, questions.
3. Running now: one row per active run, live step text, elapsed, Stop.
4. Next up: schedules and monitors with last checked / next run / "no change" quiet state.
5. Recent outputs: documents and files, open / reveal / copy path.
Empty states are one line plus one action. No instructional prose.

## Tokens
Type 12/13/14/15/18/24 (12px floor), weights 400/500/600, plus 700 for card and page titles (the approved wireframe sets them bold; the wireframe wins over this document). UI 14 on 20 line-height; chat body 14 on 20.3 (wireframe, set by the owner).
Radius 4/6/8/12/16/22/pill (composer 22). Space 4px grid, dominant gaps 4/6/8/12. Borders are hairlines (0.5px where the display allows); shadows are for popovers only. Motion 140ms controls, 200ms surfaces, reduced-motion safe.
Vanta colors, unchanged: light = white and grey surfaces (base #ffffff, panel #f7f7f8, selected #e5e5e7, text #202024), dark = near-black neutrals; Vanta violet #7c3aed is the only accent (focus ring, links, selected state, send button). Primary button is inverted near-black (light) / near-white (dark), Codex-style. No warm tints, no clay accent.
Fonts: system UI sans (-apple-system) first, Inter as the bundled fallback, JetBrains Mono for code (already bundled by Hermes). Icons: Tabler (MIT). No fonts, icons or logos from Codex or Claude.

## Rules
- No card in card, no divider between rows unless the list needs it.
- Message actions (copy, rating, expand) appear on hover/focus only.
- Tips only where hover teaches something; no native title=.
- One approval renderer. Approvals say the exact action and what Always covers.
- Every state exists: loading, empty, error, offline, blocked, retry, cancel.

## Measured reference (design-facts-2026-10-13.md)
Codex: sidebar clamp(240, 275, 520), nav rows 36, titlebar 44, toolbar 46, thread max 640, composer radius 22 / min 44, gray ramp inverting per mode, hairline borders, light shadows. Claude desktop: chat UI is remote, so its structure is taken from observation only. Vanta takes Codex structure and metrics with a 720px chat column (65-75ch at 15px) and Vanta colors.

## Responsive collapse (flow-app-shell)
>=1280 full shell. 1024-1279: sidebar to 56px icon rail, workbench becomes an overlay (main keeps >=480px).
768-1023: sidebar is a drawer. Main never narrower than 480px; panels overlay instead of docking.

## Chat rules (flow-ai-chat)
Empty state: one capability line + 3-6 concrete prompts, composer focused. Stop replaces send in the same slot.
Tool steps: live line -> collapsed completed entry, one nesting level max. Follow the stream only at bottom,
else a jump-to-latest pill. Context (files, attachments, connected tools) is always a visible removable chip.
Regenerate keeps versions (pager). Deleting a chat is undo, not confirm. Streams announce in a polite live region
by paragraph, with a completion announcement; all motion respects reduced-motion.

## Governance (design-system-governance)
Tokens are the single source of truth (semantic layer only in components). Rule of 3 before a new primitive.
Definition of Done per primitive: keyboard, focus, all states, tokens only, tested, documented in this file in the
same change. Additive by default; deprecate before removing. Visual regression snapshots for the shell.

## Company (workers, tickets, budgets, activity)
One nav destination (`/company`, `?tab=&ticket=`) with four tabs; code in `apps/desktop/src/app/vanta/company/`, client in `src/api/vanta-company*.ts`.
- Data: typed client over the Vanta bridge, every response Zod-parsed; one event stream (`company-ui` client id) drives a debounced refetch (250 ms). Hire, budget raise and any start of an external CLI worker raise the one approval card (`call_agent` cards offer Always; hire and raise are one-time).
- Status is shape plus word (worker, ticket, budget). Costs always carry a basis: Estimated, Reported, Reported by the CLI, or "Not reported" (never $0.00).
- A ticket that declares an artifact has Close locked with the reason beside it; Won't fix is the escape.
- Hire runtime picker: native Vanta loop is the default; a CLI that is missing or signed out is disabled with the reason; self-approving CLIs carry a warning.
- Dev-only fixtures page: `company-fixtures.html` (payloads recorded off the real server by `tools/record-company-fixtures.mts`); proofs: `tools/shoot-company.mjs`, `tools/drive-company-real.mjs` into `docs/proofs/company/`.
