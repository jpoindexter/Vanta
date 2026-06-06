# TUI-SMOOTH — calmer activity feed (design note)

Source-of-truth render rules for the transcript. Built from Vanta's concrete
firehose + Claude Code activity-feed conventions. Hashmark (the named reference)
turned out to be a web app with a VS-Code-style nav bar — not transferable.

## The firehose (what's wrong today)

`transcript.tsx` already collapses a tool's call+result into ONE patched row
(`→ name(args)` → `✓ name: output`). The noise is the **content**, not the row count:

1. **Raw JSON args** — `read_file({"path":"/Users/…/argo-ts/src/tools/x.ts"})`.
2. **Raw temp paths in output** — `look_at_screen` → first output line is an
   `/var/folders/…/NSIRD_…/screenshot.png` temp path, printed verbatim.
3. **No clean verbs** — bare tool names + JSON, no scannable hierarchy.
4. **Free-floating rows** — a busy turn's tool rows aren't visually grouped.

## Rules (pure, testable)

`toolDisplay(name, args) → { icon, verb, detail }` runs at **dispatch time**
(`onToolCall` gets the structured args object). The Entry stores the rendered
parts; `EntryLine` stays purely presentational.

- **detail comes from ARGS**, never raw output. (Kills the temp-path leak — the
  output goes to the model, not the human feed.)
- **On error** (`ok===false`): append ` — <firstLine(output)>` so failures stay
  visible. On success: show no output.
- **Never emit raw JSON.** Unknown tools → compacted `key:abbrev` pairs, capped.
- `abbrevPath`: temp dirs (`/var/folders`, `/tmp`, `NSIRD`, `/T/`) → basename
  only; `$HOME` → `~`; deep paths → last 2 segments with `…/` prefix.

### Verb map (families collapse by prefix)

| tool | icon | verb · detail |
|------|------|---------------|
| read_file | 📖 | read · path |
| write_file | ✎ | wrote · path |
| shell_cmd | ❯ | (command is the detail) |
| run_code | ▶ | ran · language |
| web_search | 🔎 | searched · query |
| web_fetch / browser_navigate | 🌐 | fetched/opened · host |
| browser_extract | 🌐 | read page |
| look_at_screen / screenshot | 📸 | saw screen *(no temp path)* |
| look_at_camera | 📷 | saw camera |
| watch_video | 🎬 | watched · file |
| describe_image | 🖼 | saw · file |
| speak / transcribe | 🔊/🎙 | spoke / transcribed |
| recall | 🧠 | recalled · query |
| write_skill | 🧩 | learned · name |
| brain | 🧠 | action · region |
| delegate / swarm | 🤝/🐝 | delegated / swarm |
| git_* | ⎇ | git · subcommand |
| gmail_* / calendar_* / drive_* | ✉/📅/📁 | subcommand |
| lsp_* | 🔧 | checked / definition |
| mount_mcp | 🔌 | mounted · name |
| inspect_state / todo | 🔍/☑ | inspected / todo |
| *default* | • | name · abbreviated args |

## Grouping

`partitionBlocks(entries)` (pure) groups a run of consecutive tool rows into one
`tools` block; user/assistant/note are `single` blocks. The Transcript renders a
tools block as one indented unit → a turn's activity reads as a cluster, not free
rows. One clean line per tool (no interactive collapse — see below).

## Out of scope (needs Jason's interactive design — brainstorming)

- Collapse/expand folding (e.g. "⚙ 8 actions ▸") — an interaction-model decision,
  not a pure transform. The "does it feel calm" judgment needs human eyes.
- This slice ships the **mechanical** wins (clean verbs, abbreviated paths, no temp
  paths, no JSON, grouped clusters) — all unit-tested.
