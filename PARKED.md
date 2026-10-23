# PARKED — Vanta

Deferred ideas. Promote, never delete. These are honest deferrals — the code that exists is real and tested; these are the bits that need external setup or are post-MVP polish.

## Promoted into v1 (2026-06-02 — now in `ROADMAP.md`, no longer parked)
- **Claude subscription OAuth** → ROADMAP **G1** (was "Scope-limited v0" below).
- **`vanta cron` OS trigger** → subsumed by ROADMAP **E1** (daemon/service mode runs an in-process cron tick; launchd backend).
- **A2A networked transport** → ROADMAP **E6** (ACP server — ACP is the real interop path).
- Plus net-new v1 scope: Gemini/OpenRouter providers + provider registry + `vanta setup` wizard + `status`/`doctor` (A), the self-improvement loop wiring (B), session persist/resume (C), skill-library port (D), messaging gateway (E2). See `ROADMAP.md`.

## Newly parked — out of v1 scope
- **The ~24 niche model providers** beyond OpenAI/Anthropic/Ollama/Gemini/OpenRouter (Bedrock, DeepSeek, xAI, Qwen, Kimi, Z.AI, Copilot, MiniMax, Nous, …). The provider *registry* (A2) makes each a small add later; not v1 work.
- **The other ~19 messaging platforms** beyond Telegram (Discord, Slack, Signal, WhatsApp, Matrix, iMessage, the China stack, …). v1 ships Telegram only to prove the `BaseAdapter` pattern (Rule of 3).
- **Image-gen / voice-transcription providers** (DALL-E/Whisper registries) — not on the operator path.
- **Multi-credential failover pool** (`credential_pool.py` — round-robin/least-used across many keys). Single-user, single-key; no need.
- **Trajectory / datagen pipeline** (`batch_runner` → ShareGPT JSONL → fine-tuning). It's a *training-data* pipeline, not the runtime self-improvement loop; only relevant if Vanta ever fine-tunes a model.

## Live-use setup (code is built + offline-tested; these unlock live use)
- **Comms OAuth client** — `vanta auth google` needs a one-time Google Cloud OAuth client (`VANTA_GOOGLE_CLIENT_ID/SECRET`). Truly zero-config "bundled client" needs Vanta registered as a published OAuth app (publisher step). Captured 2026-06-02. Cost to revisit: ~30 min in Google Cloud Console + set 2 env vars.
- **Browser binaries** — browser tools need `npx playwright install chromium` (playwright-core ships no binaries). Tools degrade gracefully with a clear message until then.
- **API keys** — Anthropic provider (`ANTHROPIC_API_KEY`) and `describe_image` vision (`OPENAI_API_KEY`) need keys for live use.

## Hardening / fidelity
- **OAuth PKCE** — `google/auth.ts` uses the confidential-client loopback flow (client secret). PKCE (S256) is ~4 lines of additional hardening. Captured 2026-06-02.
- **Anthropic adjacent tool_result merge** — `toAnthropicMessages` emits consecutive tool results one-per-message; the API enforces role alternation, so merging adjacent `tool_result` blocks may be needed for multi-tool turns. Flagged by the builder.
- **vitest 4 upgrade** — devDependency esbuild advisory (dev-server only, never shipped). `npm audit fix --force` → vitest 4 (breaking). Pre-existing from Phase 1.

## Scope-limited v0 implementations (real, bounded)
- **LSP = .ts/.tsx only** — `lsp_diagnostics`/`lsp_definition` use the TS compiler API. Other languages (rust-analyzer, pyright) are future.
- **A2A = local in-process** — `A2ABus` routes between in-process agents. Networked interop = ACP server (promoted → ROADMAP E6).
- **Non-streaming providers** — the loop waits for full tool calls; streaming fits behind `LLMProvider` later (locked decision, Phase 1).

## Polish (post-users)
- Streaming live output, richer cockpit UI, multi-language run-code sandboxing, project-room goal namespacing beyond per-dir `.vanta`.

## Brain v2 self-evolving substrate (brain/v2.ts)
**Captured:** 2026-06-11 (BRAIN-COHESIVE consolidation).
**Why parked:** Speculative bootstrap scaffold (Vanta designs her own brain format — jsonl/sqlite/graph/vector). The cohesive facade + structured entries layer covers current needs; self-designed substrates are platform-thinking before evidence.
**Cost to revisit:** Low — the scaffold (`BrainV2Spec`, `evolveSpec`) stays in-tree; wiring it = implementing a spec + injecting its digest through the existing facade.

## REFLECT-CORRECT — cross-session correction persistence (2026-06-14)

**Captured:** 2026-06-14.
**Core insight:** In-session adaptation already works — Vanta adjusts tone, corrects mistakes, and follows feedback within a conversation via context. What doesn't work: that correction evaporating when the session ends. Same mistake next session.

**The gap:** The background review (B3/B4) watches for reusable patterns in tool use and writes skills. It does NOT detect when a user corrects the agent mid-conversation ("no, don't do X" / "you got the tone wrong" / "that approach is wrong because...") and persist that correction to the brain's `reflections` or `user_model` region. The correction lands, takes effect for the session, then disappears.

**What closing this looks like:**
- Post-turn hook that detects correction signals in user messages (negation of a prior action, explicit "don't do that", rephrasing of a failed output)
- Writes a structured entry to `~/.vanta/brain/reflections.md` and/or `user_model.md`: what was tried, what the correction was, what to do differently
- Pre-turn injection surface already exists (brain is injected into the system prompt each session)
- The self-improvement loop (B3) is the natural integration point: add correction-detection as a second reviewer pass alongside the skill-writing pass

**Why parked:** `REFLECT-CORRECT` is already a named pebble in ROADMAP.md Arc A. This entry adds the concrete spec so the pebble has a done-condition when it's picked up. No new infrastructure needed — `writeRunMemory`, brain regions, and B3's post-turn hook are all live; this is wiring + prompt work.

**Cost to revisit:** S — add correction-signal detector in `review/background-review.ts` (or a new `review/correction-detector.ts`), write to `brain/reflections.md` on match, add to `buildSystemPrompt` injection. 1–2 days including tests.

## Parked agent-worktree builds (pruned 2026-06-14)
**Captured:** 2026-06-14. A 2026-06-10 parallel-agent fanout left 16 isolated `worktree-agent-*` worktrees, each with one CC-parity feature commit, never integrated. The worktrees were pruned for a clean repo; **every commit is preserved as a `parked/<id>` git tag** (recoverable, not on any branch). They were built against the **pre-rebuild** codebase (before the 06-13 real-Ink TUI rebuild deleted `src/tui/` and the size-gate decomposition reshaped `repl/`/`context.ts`/`compress/`), so all conflict with current main — recover = re-port onto current main, not merge.

**Why parked, not merged:** stale (4 days, built on since-deleted/refactored code) + all conflict with main + several likely already superseded. Recover any with `git checkout -b recover-<x> parked/<id>` then re-port the diff by hand.

| Tag | Feature | Likely status |
|-----|---------|---------------|
| `parked/a6217a9b43934ee79` | VANTA-SANDBOX — opt-in OS isolation for shell_cmd + run_code | still missing, valuable |
| `parked/ac9ecf1ed89da1e0e` | AUTH-BROWSER — persistent profile for logged-in sites | still missing, valuable |
| `parked/a5ffcc69a49c6ae86` | VANTA-TOOL-RESULT-DISK — persist oversized tool outputs to disk | still missing, valuable |
| `parked/af2e5090de92795ba` | VANTA-SHELL-STALL-DETECT — background shell stall watchdog | still missing, valuable |
| `parked/a8130bd4887679171` | time-based microcompact — clear stale tool results after idle | still missing, valuable |
| `parked/ac637030536a45f69` | client-side secret scanner blocks secrets from memory sync | still missing, valuable |
| `parked/a25c364f2bcccce87` | LSP diagnostic-delta + edit-file tool (was uncommitted; preserved) | check vs current lsp/ |
| `parked/a54f3a6bcaf32c2f7` | compaction-remind + context.ts (was uncommitted; preserved) | check vs current context.ts |
| `parked/a26e763a2529de5ca` | actionable suggestions when context fills (VANTA-CONTEXT-SUGGESTIONS) | check vs current context UX |
| `parked/a8130bd…` / `parked/aac5129481d980bab` | /compress focus instructions + VANTA_DISABLE_COMPACT gate | check vs current /compress |
| `parked/a9499176bf8ac114a` | 'keep going' resumes prior task; negative-keyword recognition | maybe useful |
| `parked/a3f814553d37a522d` | actionable notice when a config file is invalid JSON | maybe useful |
| `parked/acfb2e69ab2f55425` | VANTA-MEM-FRESHNESS — staleness caveat for memories >1 day | likely superseded (brain has confidence/recency) |
| `parked/a30937211b2e36851` | warn when active model id is a known-deprecated model | maybe useful |
| `parked/a2ed381d918efc514` | TUI-KEYS — readline/Emacs composer keybindings | **obsolete** (built on deleted `src/tui/`) |
| `parked/ad52d4ad12952fd6c` | VANTA-PERMISSIONS — pure rule layer + /permissions cmd | likely superseded (`permissions.tsv` + `loadRules` + `ui/grant.ts` exist) |

All are tracked as `CC-*` roadmap cards; per `STRATEGY.md`, CC parity is "a quarry, not a goal."

## AHE stack import — methodology only, not the code (2026-06-16)
Agentic Harness Engineering (https://github.com/china-qijizhifeng/agentic-harness-engineering) is a strong fit for Vanta's harness/Cofounder pillars, but its **implementation stack is parked, deliberately**: Python 3.13 + `uv` + E2B sandboxes + the NexAU component framework — none of it fits Rust+TS. We steal the *ideas* (falsifiable edits → DECISIONS 2026-06-16; the evaluate→analyze→improve loop → roadmap `AHE-EVAL-HARNESS` / `AHE-TRACE-DISTILLER` / `AHE-SELF-EVOLVE`, all horizon). The auto-evolution loop itself stays unbuilt until Vanta has real users + an eval task set + a reward signal (building it sooner = platform-thinking-before-users). Quarry notes: `docs/agentic-harness-engineering.md`. Cost to revisit: re-read the doc; the loop's prerequisites are the two Harness cards.

## Reference-agent cloud/platform half — against local-first (2026-06-16)
Extracted the local-compatible operator slice of a reference agent into 5 horizon cards (VANTA-KANBAN/-BLUEPRINTS/-SKILLS-HUB/-COST-GUARD/-SUGGESTIONS). The rest is **parked, deliberately** — it's the opposite of Vanta's north star (local-first, kernel-gated, no platform, no SaaS): cloud/serverless terminal backends (Modal, Daytona, Singularity, cloud-VM, hibernate-wake), the 6 comms platforms beyond Vanta's scope (already parked, Rule of 3), the web dashboard + account/subscription, and the batch trajectory/datagen pipeline (already parked). Most of that operator surface (cron, webhooks, comms, brain, skills, sessions, subagents, MCP, providers, profiles, voice, pairing, cost tracking) Vanta already has.

## Total-realignment parks (2026-07-30)

The controlling correction started from active commit
`a751cb17dcb768097798b4278882a64103527811`, not stale `origin/main`. It
preserved all 1,319 active records and parked all 22 cards that were open on
that active baseline. They were not deleted; their complete IDs, bodies,
dependencies, sources, and prior notes remain in `roadmap.json`.

Dispositions:

- browser workflow action → hidden behind intent and dependency-gated by
  TRUST-03/TRUST-05;
- streaming audio, native-runtime, startup/stream performance, and EF support
  controls/expiry →
  consolidated into UX-03/UX-04/EVAL-01;
- gateway delivery obligation → consolidated into OP-04/TRUST-04;
- reward-seeking research/evaluation/release cards → deferred to LAB-01/EVAL-01,
  with evaluator-integrity requirements retained under TRUST-06.
- integration-state, Trello, Dropbox, and Box/Drive/Rovo connector work →
  deferred behind TRUST-01/LIFE-01/PACK-01.

The complete 22-card one-to-one mapping is in
`docs/strategy-realignment-correction-2026-07-30.md`. The earlier
`docs/strategy-realignment-2026-07-30.md` records the superseded stale-baseline
first pass. Revival requires its canonical dependency and acceptance owner to
be active; do not revive a duplicate product lane.

## size-gate baseline for vendored desktop-next code (ratchet: only new/worsened violations block)
**Captured:** 2026-10-13. The vendored Hermes renderer under `desktop-next/apps/desktop` carries large pre-existing size-gate violations (for example `src/components/assistant-ui/tool/fallback.tsx` at 1212 lines, plus many functions over 50 lines or complexity 10). The whole-file pre-commit lint blocks any commit that stages such a file.
**Why parked:** Splitting vendored upstream files is not shippable value before the desktop-next milestone; it also makes future upstream diffs harder to read. Interim rule: commit with `VANTA_LINT_BLOCK=0` (warn-only) after verifying the functions you touched are within limits and say so in the commit body. gitleaks and the architecture boundary check always run.
**Cost to revisit:** Add a baseline file (path -> violation count/size) for `desktop-next/`, make the lint compare against it so only new or worsened violations block, then decompose the worst offenders one file per slice.

## Full-access warning: reset control in Settings (2026-10-14)
Captured: the legacy Safety settings had "reset acknowledgement". `resetFullAccessAcknowledgement(root)` exists and is tested in
`desktop-next/apps/desktop/src/store/full-access-warning.ts`, but no settings page calls it.
Why parked: V-019 done criterion is the warning before Full access, not a reset surface; the version bump already re-asks.
Cost to revisit: one row in a Safety settings page (the settings pages that read /api/config are still inert).

## Queued messages are not shown as chat bubbles while the server runs them (2026-10-14)
Captured: when the server drains its queue inside one `POST /api/chat` (or `queue.run`), the live thread shows the streamed text but not the queued user messages, and only the last answer survives as the final bubble. Reopening the chat (or restarting) shows the saved transcript in the right order (proof step b7).
Why parked: V-006 done criterion is the durable queue with edit/reorder/cancel/steer/retry and correct run order, all proven; the live rendering needs a per-instruction boundary event from the server (`queue.started` with the text) mapped to a user bubble plus `message.interim`.
Cost to revisit: one typed SSE event in `vanta-ts/src/desktop/handler-chat-execution.ts` (`claimNextInstruction`), one mapper case in `desktop-next/apps/desktop/src/api/vanta/event-mapper.ts`, a renderer path that appends a user message. About half a day with a real-app proof.

## Stepping through queued edits with the arrow keys loses the words if the save is refused (2026-10-14)
Captured: saving an edit of a server-saved message and then arrow-stepping on to the next one cannot put the typed words back when the server refuses the first save (changed elsewhere). The panel shows why; the typed words of that one edit are gone. Plain Enter-save keeps them.
Why parked: needs the step flow to await the save; rare (requires a second writer and arrow stepping).
Cost to revisit: make `stepQueuedEdit` async or hold the step until `saveRemoteEdit` resolves (`app/chat/composer/hooks/use-composer-queue.ts`).

## Server failure classifier reads "rejected" as "a needed action was not approved" (2026-10-14)
Captured: `classifyDesktopFailure` (`vanta-ts/src/desktop/handler-chat-receipts.ts`) matches /denied|rejected|not approved|approval/ on the error text, so a provider reply such as "the model server rejected the request" shows the user_denied reason. Found while writing the run-recovery integration test (the test uses different wording).
Why parked: shared server code used by the old renderer too; the fix is a classifier ordering decision, not a UI one.
Cost to revisit: put the shared provider-error taxonomy ahead of the text bank for non-auth reasons and add the case to `provider-auth-recovery.test.ts`'s neighbour.

## Messages with attachments stay in the window queue, not the server queue (2026-10-14)
Captured: `POST /api/chat/queue` carries text and images only. A queued message with a file attachment or a frozen terminal selection uses the Hermes window-local queue (localStorage), so it does not survive a cleared profile and is not part of the durable list.
Why parked: V-006 is the durable queue for text; attachments need a queue-side file reference format.
Cost to revisit: extend `turn-queue-images.ts` to files (paths relative to the project) and send `files` from `queue.enqueue`.

## Ideas from the ECC harness (affaan-m/ECC), not its code
**Captured:** 2026-10-14. Audited statically (MIT, v2.2.3, no install-time scripts, no obfuscation, hooks write locally, no injection or exfiltration text found; not every skill read line by line). Not installed: it duplicates what the owner already has (feature and debug orchestrators, learning loop, secret and size gates, cost tracking), and adds 311 skills and 71 agents to every session. Worth reading, not installing: `mcp-dependency-review` (static review of MCP config for mutable package references; extends the local package guard), `loop-design-check` (failure modes of agent loops: spinning, gaming the verifier; relevant to the company tick and heartbeats), `agent-security-hardening` (checklist for agents that process untrusted content), `skill-comply` (shows whether skills and rules are actually followed).
**Why parked:** none of it blocks a v0 criterion; the current work is Desktop Next parity and the startup and offline fixes.
**Cost to revisit:** small (read three skill files, turn the useful checks into Vanta tests); clone is at ~/Documents/GitHub/_vendor/ECC.

## Reachability proof leaks sidebar state between sections (2026-10-23)

Captured: a full `node tools/reachability.mjs` run on build 7 code aborted five sections (chrome, seeded, right, window, thread) with 100 PASS, 15 FAIL of 175 rows (2026-10-14: 177 PASS, 3 FAIL of 269). A failure screenshot shows a healthy app (nav, pinned chat, "Backend ready") but the sidebar left in a project lane ("BETA-NOTES > All projects") by an earlier step, so later steps cannot find "Say hello" or "Filters". A re-run of just chrome and seeded went through with one FAIL (F-050, "New project button missing in Project grouping", which also failed on 2026-10-14).

Why parked: it is the proof's state handling, not an app defect I can show; the card evidence for DN-04/05/09/15-17 therefore still rests on the 2026-10-14 run.

Cost to revisit: small. Reset the sidebar to the default list (Sessions tab, grouping Updated, no lane) at the start of each section in `tools/proof/groups.mjs`; then re-run once and refresh the report. F-050 is a separate real item.

Update 2026-10-23 (same item): added `resetSidebar` before each section in `tools/reachability.mjs`. Full run went from 100 PASS / 175 rows (5 sections aborted) to 147 PASS / 226 rows (3 sections aborted: chrome, seeded, thread). Against the 2026-10-14 report, 14 of 211 shared rows went PASS/INERT to FAIL. Re-running just composer and pages: F-128, F-133, F-137 and F-231 pass (order noise). Still failing in isolation: F-115, F-116, F-122 (composer `+` menu and reasoning pill: the click times out although the screenshot shows the buttons on screen, so likely selector drift), F-232 (Webhooks) and F-236 (Memory Graph). F-105/106/107 (browser pane, webviewTag off) were INERT before and are now FAIL: same cause, a verdict change in the proof. F-070/071 (Bots roster empty: `profiles.list` RPC not mapped in `src/api/vanta/dispatch.ts`) fail in both reports and are a real gap. Next step: print the full Playwright call log for F-115/116/122/232/236 (the report cuts it at the first line) and fix the selectors or the UI, one cause at a time.

Correction 2026-10-23: the "Bots roster empty (F-070/071) is a real gap" line above is wrong. The Bots tab does list Vanta and Research (failure screenshot); the proof tested `/research/` case-sensitively against the title-cased "Research", and its note blamed an unmapped `profiles.list` that `dispatch.ts` already maps (`handlers-profiles.ts`). Fixed the check (`/research/i`) and the stale notes in `rows-profiles.mjs` and `rows-chrome.mjs`; the profiles group now passes F-070, F-071 and F-072. The rest of the row triage above stands.
