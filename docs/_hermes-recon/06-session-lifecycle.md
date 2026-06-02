# Hermes — Session & Conversation Lifecycle

Recon of the Hermes CLI session model: the semantics behind `/new` `/clear`
`/reset` `/save` `/resume` `/history` `/undo` `/retry` `/title` `/handoff`
`/branch` `/fork`, plus the turn lifecycle (`/queue` `/steer` `/bg`, Ctrl+C).

Source (read-only):
- `hermes-reference/cli.py` — TUI dispatch + all lifecycle methods.
- `hermes-reference/hermes_state.py` — `SessionDB` (SQLite, schema, rewind, persistence).
- `hermes-reference/hermes_cli/commands.py` — `COMMAND_REGISTRY` (names + aliases).

## Architecture in one paragraph

A **session** is a SQLite row in `~/.hermes/state.db` (`sessions` table) keyed
by id `YYYYMMDD_HHMMSS_<6hex>`. Its **transcript** is rows in the `messages`
table (FK `session_id`, ordered by `timestamp`, with an `active` flag for
soft-delete). The CLI keeps a live `self.conversation_history` (list of dicts)
which mirrors the active session; messages are flushed to the DB incrementally
during the turn. `self.session_id` + `self.agent.session_id` track the current
session; `_last_flushed_db_idx` marks how much of `conversation_history` has
been written. Lifecycle commands manipulate three things: (1) which id is
active, (2) the in-memory `conversation_history`, (3) DB rows. Aliases and
canonical names resolve through `resolve_command()` in `commands.py`.

**Two commands in the task brief are aliases, not distinct commands:**
- `reset` → alias of **`new`** (`CommandDef("new", …, aliases=("reset",))`).
- `fork` → alias of **`branch`** (`CommandDef("branch", …, aliases=("fork",))`).

---

## Storage format

`~/.hermes/state.db` — SQLite (WAL), `DEFAULT_DB_PATH = get_hermes_home()/"state.db"`.

`sessions` (one row per session): `id` PK, `source`, `model`, `model_config`
(JSON), `system_prompt`, **`parent_session_id`** (FK → sessions.id; links
branch/compression lineage), `started_at`, `ended_at`, `end_reason`, token/cost
counters, **`title`**, **`handoff_state` / `handoff_platform` / `handoff_error`**,
**`rewind_count`**, `archived`.

`messages` (transcript): `id` PK AUTOINCREMENT, `session_id` FK, `role`,
`content`, `tool_call_id`, `tool_calls` (JSON), `tool_name`, `timestamp`,
`reasoning*` fields, **`active` (default 1)** — soft-delete flag for undo/rewind;
rows survive on disk for audit, hidden from replay/search.

`/save` writes a **separate** JSON snapshot to `~/.hermes/sessions/saved/
hermes_conversation_<ts>.json` (`{model, session_id, session_start, messages}`).
This is an export convenience only — the live session is already in `state.db`
and resumable regardless of `/save`.

---

## Per-command semantics

### `/new` (alias `/reset`) — cli.py:6476 `new_session(title=)`
- **Before → after:** active session A with history → session A `end_session(reason="new_session")`, new id B minted, `conversation_history=[]`, agent state reset (`reset_session_state`, `_last_flushed_db_idx=0`, fresh `TodoStore`, system prompt invalidated), new row created in DB, optional title set.
- **Storage:** A's row gets `ended_at`/`end_reason`; B inserted. **A's transcript is NOT deleted** — still resumable.
- **Confirmed destructive** (prompts unless `now`/`--yes`/`-y`). Before rotating, runs memory extraction (`commit_memory_session`) + `on_session_finalize`; after, fires `on_session_switch(reset=True)` + `on_session_reset`.
- **Edge:** `/new My Title` sets title on B; inline-skip tokens stripped so the title isn't polluted.

### `/clear` — cli.py:8593 (cli-only)
- = `new_session(silent=True)` **+ terminal screen wipe** (`output.erase_screen`) + fresh banner + tip.
- Same DB effect as `/new` (rotates, doesn't delete). **Difference from `/new`:** clears the visible screen, no title arg, always silent banner. **Difference from `/reset`:** `/reset` is literally `/new`; `/clear` adds the screen wipe.
- The confirm text says "history will be discarded" — meaning **discarded from view**, not deleted on disk. Only `/exit --delete` deletes transcripts.

### `/save` — cli.py:7077 `save_conversation()`
- Exports `conversation_history` to a timestamped JSON under `sessions/saved/`. No session state change. Prints `hermes --resume <id>` hint.
- **Edge:** empty history → no-op message.

### `/resume [n|id|title]` — cli.py:6728 `_handle_resume_command`
- Bare `/resume` → prints recent-session list (limit 10) and arms a one-shot numeric selector (next bare number resumes that index).
- With target: resolves number→id, or title/id via `_resolve_session_by_name_or_id`. If the target is the empty head of a compression chain, redirects to the descendant (`resolve_resume_session_id`).
- **Action:** `end_session(current, "resumed_other")`, switch `session_id` to target, load transcript via `get_messages_as_conversation` (drops `session_meta` rows), `reopen_session(target)`, sync agent (`_last_flushed_db_idx=len(history)`), `on_session_switch(reset=False, reason="resume")`, replay history to screen.
- **Edge:** target == current → "Already on that session." Missing → not-found hint.

### `/history` — cli.py:6393 `show_history()`
- Prints the **current in-memory transcript** ([You #n]/[Hermes #n], content truncated to 400 chars, tool messages collapsed to a count). Read-only.
- **Edge:** empty history → falls back to the recent-sessions list (`_show_recent_sessions(reason="history")`).

### `/title [name]` — cli.py:8668
- With name: `sanitize_title` then `set_session_title` (DB) if the row exists; else stores `_pending_title` (saved on first message). Uniqueness checked against existing titles.
- No arg: prints current session id + title (or pending). Read-only in that case.
- **Edge:** whitespace/unprintable → rejected; duplicate title → reported, not set.

### `/undo [N]` — cli.py:7141 `undo_last(n=1)`
- Walks back N **user** turns, truncates `conversation_history` to before the Nth-from-last user message, and **soft-deletes** the corresponding DB rows via `rewind_to_message` (`active=0`, bumps `sessions.rewind_count`). Prefills the composer with the backed-up message text for editing/resubmit. Mirrors branch's agent surgery (system-prompt invalidate, flush-index reset); `on_session_switch(rewound=True)`.
- **Confirmed destructive.** `/undo 3` backs up three turns; N beyond available → backs up to oldest.

### `/retry` — cli.py:7112 `retry_last()`
- Finds the last user message, truncates `conversation_history` to **before** it (in-memory only), and **auto-resends** it (re-queued to `_pending_input`).
- **Sharp distinction from `/undo`:** retry is in-memory only and auto-resends; it does **NOT** call `rewind_to_message`, so the abandoned assistant/tool rows stay `active=1` in the DB, and it does not reset `_last_flushed_db_idx` (unlike undo/branch/resume which all do). Semantics note (not a bug hunt): the re-sent turn may re-flush rows that already exist on disk. `/undo` soft-deletes + prefills for editing; `/retry` discards-from-view + immediately re-runs the same prompt.

### `/branch [name]` (alias `/fork`) — cli.py:6947 `_handle_branch_command`
- Copies the **full** `conversation_history` row-by-row (`append_message`) into a **new** session id, sets `parent_session_id = <current>` (the same lineage field auto-compression-split uses), titles it (given name, or `get_next_title_in_lineage`), `end_session(current, "branched")`, then switches to the branch (`_resumed=True` to suppress auto-title; `_last_flushed_db_idx=len(history)`; `on_session_switch(reset=False, reason="branch")`).
- **branch vs fork:** identical — `fork` is a pure alias. That IS the finding; no separate code path.
- **Edge:** empty history → refused. Best-effort copy (per-message failures swallowed). Original session stays intact and resumable.

### `/handoff <platform>` — cli.py:6578 `_handle_handoff_command` (cli-only)
- **Corrects the task's hypothesis:** `/handoff` does NOT produce a continuation prompt. It is a **session → messaging-platform transfer**. (The continuation-prompt idea is the separate `handoff` *skill*, an unrelated mechanism.)
- Validates platform + home channel via gateway config, refuses mid-turn, ensures a DB row exists (stub via title-set if empty), then `request_handoff` → sets `handoff_state='pending'` on the row. Poll-blocks `state.db` for terminal state (~60s): `completed` → prints resume hint and **exits the CLI like `/quit`** (returns False); `failed`/timeout → keeps the CLI session and clears the pending flag.
- **Storage:** mutates `handoff_state`/`handoff_platform`/`handoff_error` on the session row. The gateway watcher (separate process) performs the actual `switch_session`.

---

## Look-alikes, disambiguated
- **`/clear` vs `/reset` vs `/new`:** `/reset` ≡ `/new` (alias). `/clear` = `/new` silent + terminal screen wipe (cli-only, no title arg). **All three rotate to a new session id and preserve the old session row on disk** — none deletes the transcript. Only `/exit --delete` deletes.
- **`/branch` vs `/fork`:** identical, `fork` is an alias. Copies transcript to a new id and links `parent_session_id`.
- **`/undo` vs `/retry`:** undo = DB soft-delete (`active=0`) + prefill for editing, N-turn aware, confirmed. retry = in-memory truncate + immediate auto-resend, last user turn only, leaves DB rows active.

---

## Turn lifecycle

Shape: **input → (busy-mode routing) → agent loop → tool calls → response → incremental DB flush.**

1. **Submit.** User input goes onto `self._pending_input` (a `queue.Queue`); the background `process_loop` thread drains it and drives `self.agent`.
2. **Busy-input mode** (`busy_input_mode`, default `"interrupt"`) governs what Enter does *while a turn is running*:
   - `interrupt` — Enter interrupts the current run.
   - `queue` — Enter routes the message to `_pending_input` for the next turn.
   - `steer` — Enter injects the message mid-run via `/steer` (arrives after the next tool call).
   - Configurable live with `/busy [queue|steer|interrupt|status]`.
3. **`/queue <prompt>` (alias `/q`)** — cli.py:8875. Pushes onto `_pending_input` without interrupting; runs after the current turn (or immediately if idle).
4. **`/steer <prompt>`** — cli.py:8887. If the agent is running, calls `agent.steer()` (thread-safe) and the text is appended to the **next tool result's** content (no interrupt). If idle, falls back to queue semantics. A leftover steer (agent finished first) is delivered as the next turn.
5. **`/bg <prompt>` (`/background`, aliases `bg`/`btw`)** — cli.py:9059. Spawns a **separate** `AIAgent` in its own session + background thread; result prints to the CLI when done **without touching the active conversation**. `/agents` (alias `/tasks`) lists running background tasks/processes; `/stop` kills running background processes (distinct from interrupting the current turn).
6. **Interrupt (Ctrl+C).** Routed via `_interrupt_queue`; `_last_turn_interrupted` is set so goal/continuation logic doesn't immediately re-issue a turn. The status bar surfaces active background tasks/processes counts.
7. **Persistence.** Messages flush to `state.db` during the turn; `_last_flushed_db_idx` tracks the boundary so re-entry/branch/resume can resync.

---

## Argo-port note

Argo's model (`argo-ts/src/sessions/store.ts`, `repl-commands.ts`, `agent.ts`):
- **Storage:** JSON file per session at `~/.argo/sessions/<id>.json`
  (`{id, title, started, updated, messages}`, Zod-validated). Id = `YYYYMMDD-HHMMSS`.
  Title auto-derived from first user message. No `parent_session_id`, no
  `active`/soft-delete flag, no `ended_at`/lineage.
- **Conversation:** `createConversation({history})` builds a live `convo` whose
  `messages` array IS the editable transcript. `argo sessions` / `argo resume <id>`
  exist at the CLI; slash set lives in `executeSlash` (`SLASH_COMMANDS`).

**Already supported (parity):**
- `/clear` + `/new` — both implemented (splice history to keep system msg, mint
  new id). Argo already treats `new` as an alias of `clear`. Matches Hermes intent
  (rotate, don't delete), though Argo doesn't persist an end-marker on the old file.
- `/resume <id>` — loads a session's messages into the live convo. Matches Hermes.
- `/sessions`, `/history`-equivalent (via `/sessions`), `/help`, `/status`, `/model`.

**Need new logic:**
| Command | Difficulty in Argo | Notes |
|---|---|---|
| `/title [name]` | **Easy** | `Session.title` already exists; today it's auto-derived. Add a setter + a `pending` slot for pre-first-message; persist on save. |
| `/save` | **Easy** | Already persisting JSON per session; `/save` = copy current convo to a `saved/` snapshot, or no-op (Argo auto-persists). Could alias to "force flush now". |
| `/history` | **Easy** | Print `convo.messages` truncated; fall back to `listSessions`. |
| `/retry` | **Easy** | Truncate `convo.messages` to before last user msg, re-send. Pure in-memory; no DB soft-delete concept needed. |
| `/undo [N]` | **Medium** | Argo has **no `active`/soft-delete column** — JSON files are flat arrays. Either (a) truncate-and-rewrite the file (lossy, no audit trail) or (b) add an archived/inactive marker per message (schema change to `MessageSchema`/`SessionSchema`). Hermes keeps rows for audit; Argo would lose that unless schema grows. Prefill-composer needs TUI support. |
| `/branch` + `/fork` | **Medium** | No `parent_session_id` field. Copy is trivial (deep-copy `messages` to a new id + `saveSession`), but lineage tracking needs a `parentId` field added to `SessionSchema`. Without it, branches are just independent copies (acceptable for v0). |
| `/handoff` | **Hard / likely N/A** | Hermes hands off to a running **gateway** + messaging platforms (Telegram/Discord) via a `handoff_state` polling protocol. Argo has no gateway/platform layer, so this is out of scope until/unless Argo grows multi-surface delivery. Do **not** confuse with the continuation-prompt `handoff` skill. |
| Turn lifecycle (`/queue` `/steer` `/bg`, busy modes, Ctrl+C) | **Medium–Hard** | Argo's REPL/TUI would need a `_pending_input`-style queue + a running-turn flag + an interrupt channel. `/queue` and Ctrl+C are the cheap wins; `/steer` (mid-run injection after a tool call) and `/bg` (separate agent + thread) are heavier and depend on Argo's loop architecture. |

**Lowest-effort parity path:** `/title`, `/save`, `/history`, `/retry` first
(no schema change). Then add `parentId` to `SessionSchema` to unlock `/branch`
+ `/fork`. `/undo` needs the soft-delete decision (rewrite vs. schema flag).
`/handoff` and full steer/bg turn-lifecycle are platform-dependent — defer.
