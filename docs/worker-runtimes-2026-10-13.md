# Worker runtimes (2026-10-13)

Track E. A company ticket can now be handed to the Vanta native loop or to an external agent CLI
(Claude Code, Codex, Hermes, any CLI declared in `agents.json`). This page is the reference for the
interface, the security model, how to add a runtime, and what is and is not verified.

Source: `vanta-ts/src/worker-runtimes/`. Engine glue: `vanta-ts/src/desktop/company-run-*.ts`.
Route and event contract: `vanta-ts/src/desktop/CLAUDE.md`. Boundary: single owner, one kernel
(DECISIONS 2026-06-19); no multi-tenancy was added.

## Interface

`types.ts`. Data shapes are Zod schemas; the registry parses every `RunOutput`.

```ts
type WorkerRuntime = {
  id: string; displayName: string;
  selfApproving: boolean;                       // the CLI approves its own actions
  detect(ctx: { env }): Promise<DetectResult>;  // installed? version? auth state from the CLI's own status command
  run(input: RunInput): Promise<RunOutput>;
  resume?(input: RunInput & { sessionRef }): Promise<RunOutput>;
};
type RunInput = { ticket, instruction, cwd, signal: AbortSignal, onEvent(e), access?: "read-only" | "edit", maxBudgetUsd? };
type RunOutput = {
  status: "completed" | "failed" | "aborted" | "refused";
  summary: string; error?: string;
  workProducts: Array<{ kind: "report" | "code"; source: "final-message" | "git-diff"; content; files[] }>;
  usage?: { inputTokens?; outputTokens?; costUsd?: number | null };   // absent / null = not reported, never 0
  sessionRef?: { runtimeId; sessionId; cwd }; model?: string;
};
```

`registry.ts` holds runtimes by id, runs them behind a guard (a throw or malformed result becomes a
failed `RunOutput`), and `detectAll`. `default-registry.ts` registers: `vanta-native` (wraps the
company engine port, so there is still one in-process loop), `claude-code`, `codex`, `hermes`, and
every CLI in `agents.json`.

A hired worker's `adapter` selects the runtime: a provider id (`openai`) is the Vanta loop on that
backend, `cli:<runtime id>` is an external CLI. `port-bridge.ts` adapts any registry runtime to the
engine's `WorkerRuntime` port, which is the seam the run engine already supervises.

## Runtimes

| id | Invocation (prompt on stdin, never argv) | Events and result | Usage and cost | Access mapping |
|---|---|---|---|---|
| `claude-code` | `claude -p --output-format stream-json --verbose --permission-mode <m> [--model] [--max-budget-usd N]`; resume adds `--resume <id>` | stream-json lines: init (session id, model), assistant/user messages, final `result` | tokens (input + cache writes + cache reads, output) and `total_cost_usd` -> `reported` | edit = `acceptEdits`, read-only = `plan`. Never `--dangerously-skip-permissions` |
| `codex` | `codex exec --json -s <sandbox> -C <cwd> [-m] -o <tmpfile> -`; resume is `codex exec resume --json -c sandbox_mode=... <id> -` | JSONL: `thread.started`, `item.*`, `turn.completed/failed`. Final message from the `-o` file, else the last `agent_message` | tokens only; `costUsd: null` -> `not-reported` | edit = `workspace-write`, read-only = `read-only`. Never the bypass flag |
| `hermes` | `hermes [-m] --usage-file <tmp> -z <prompt>` (one-shot) | plain stdout is the final message | usage file if Hermes writes one (field names unverified, see gaps) | **self-approving**: one-shot mode bypasses Hermes approvals, so access is not enforced by Vanta |
| any `agents.json` entry | `cmd` + `args` with `{prompt}` / `{model}` substituted; `"promptVia": "stdin"` keeps the prompt out of argv | plain text | none | self-approving unless `"selfApproving": false` |

Flags were checked against `claude --help` (2.1.222), `codex exec --help` and `codex exec resume
--help` (0.144.1), `hermes --help` (0.21.7) on this machine. The Claude flag set is asserted equal to
the existing `call_agent` coding invocation in a test, so the two cannot drift apart silently.

`agents.json` (in `VANTA_HOME`, the same file `call_agent` reads):

```json
{ "agents": { "aider": { "cmd": "aider", "args": ["--message", "{prompt}"], "modelFlag": "--model" } } }
```

Optional extras: `"promptVia": "stdin"`, `"selfApproving": false`. Names must be lowercase
letters, digits and dashes and may not reuse `claude-code`, `codex`, `hermes`, `vanta-native`. Hire with
`adapter: "cli:aider"`.

## Dispatch

1. `POST /api/company/tickets/assign` (or a cadence tick, or `answer`/`revise`) calls `startRun`:
   atomic checkout, pause and budget gates, `ports.runtime(state, worker)`.
2. The external port's `run()` probes the CLI. Not installed or not signed in: the run fails with that
   message and no card is shown.
3. Launch gate (`launch-gate.ts`): kernel `assess` of the exact action; project-scoped saved rules;
   approval card. The card is skipped only for a saved project Always rule and never for a
   self-approving CLI.
4. `runExternalAgent` (the same function `call_agent` uses) spawns the CLI behind the kernel effect
   gate with the scrubbed child env, in the project root, in its own process group. Pausing the worker
   aborts the signal and kills the group.
5. Output lines are parsed into events (`run.progress` in the activity feed and over SSE). A tree
   snapshot before and after gives the changed files.
6. The engine records the run (usage, cost, basis), meters `agent:`/`dept:` scopes, writes the work
   products with `runtimeId` and `runId`, and closes the ticket only through the outcome and review gates.

Headless hosts (`vanta heartbeat`, `vanta company tick`) call the same `startRun` through
`headless-dispatch.ts`. They have no card to show, so `headless-gate.ts` launches only when the owner
already saved an Always rule for `call_agent` in the project, and otherwise the ticket is blocked with
the reason. They skip paused workers. Workers on the Vanta loop are not started headlessly.

## Security model

- Nothing bypasses the kernel, approvals or the effect gate. The same primitives as `call_agent` are
  used: `runExternalAgent`, `buildSafeChildEnv`, the kernel `assess`, project-scoped rules.
- The kernel `assess()` is a keyword denylist and the sandbox is the boundary (SECURITY.md section 6).
  An external CLI is an autonomous agent: approval is for the launch, not for its individual steps. Claude
  Code and Codex keep their own permission mode and sandbox on (edit access only; no bypass flags).
  Hermes one-shot and undeclared CLIs approve their own actions, and the card says so.
- Prompts go on stdin, so they do not appear in argv or `ps`, and are redacted (`redactSecrets`) first.
  Hermes needs the prompt in argv (`-z`); it is redacted but visible to `ps`. The approval card shows a
  redacted preview and the prompt sha256.
- The child gets only `PATH HOME USER LANG ...` (`buildSafeChildEnv`). API-key env vars are not
  forwarded; the CLI must be signed in through its own login. Vanta never reads `~/.claude` or `~/.codex`.
- Detection runs fixed commands (`<cli> --version`, `claude auth status`, `codex login status`) with
  the scrubbed env and keeps only the exit code of the status command. A user-declared CLI is never
  executed to probe it (PATH presence only).
- Output and events reach logs through `redactSecrets` / `redactForLog`. Final messages are redacted
  before being stored as work products.
- No new network exposure: one new GET route on the existing boundary-protected desktop server.
- The CLI runs in the project root, so it also reads that repo's own CLAUDE.md or settings. Run it only in
  projects you trust (Claude Code skips its own trust dialog in `-p` mode).

## Cost semantics

`reported`: the CLI returned dollars (Claude Code's `total_cost_usd`; a client-side figure that can
differ from billing, and notional on a subscription). `estimated`: tokens times the pricing table
(native loop only). `not-reported`: no dollars; adds nothing to USD totals and counts in `runs.notReported`.
A CLI that reports tokens but not dollars (Codex) gets `usage` and `costUsd: null`. Tokens are only
recorded when both input and output were reported. A failed, stopped or paused run keeps what it spent.
The spend ledger needs integers, so a reported cost with unknown tokens writes 0 tokens there; run records
keep `usage: null`.

## Adding a runtime

1. Write a `CliSpec` (see `claude-code.ts`): `id`, `displayName`, `command`, `selfApproving`, a
   `DetectSpec` (use `authArgs` only if the CLI has a status command), `build(context)` returning `{ args, stdin? }`
   (prompt on stdin if the CLI can read it), optional `buildResume`, and a `createParser()` that turns
   output lines into `RunEvent`s and a `ParsedRun` (final message, failed?, usage, session id).
2. `createCliRuntime(spec, deps)` does the rest: redaction, gate, tree snapshot, execution, output mapping.
3. Register it in `default-registry.ts`. A hired worker uses `cli:<id>`.
4. Tests: argv (and a parity check against `buildAgentInvocation` if `call_agent` knows the CLI), parser
   fixtures labelled recorded or synthetic, and one `fakeSpawn` run. Do not add a path that launches without `deps.gate`.

For a CLI that only needs flags and plain text, skip code: declare it in `agents.json`.

## Verification

Run on this machine (2026-10-13): detection of all three CLIs through the registry, using an isolated
`VANTA_HOME`.

| Runtime | installed | version | auth (exit code of the CLI's status command) |
|---|---|---|---|
| claude-code | yes | 2.1.222 | unauthenticated (`claude auth status` exits 1; the CLI reports it is logged out) |
| codex | yes | 0.144.1 | authenticated (`codex login status` exits 0) |
| hermes | yes | 0.21.7+495.g6e7b83a | unknown (no status command), self-approving |

Not run: no agent was launched. Claude Code is signed out here, and Codex and Hermes need a login or a
configured provider, so the owner-safe-smoke condition (needs no login) was not met. Everything below was
unit or integration tested against recorded or synthetic output and fake processes:

- `worker-runtimes/*.test.ts`: argv builders, parsers, registry, detection, launch gate, tree diff against
  a real temp git repo, custom CLI through a real child process (stdin delivery, exit codes, process-group
  kill on abort), headless dispatch.
- `desktop/company-external-runtime.test.ts`: the company routes with a fake CLI process on real stores in
  a temp `VANTA_HOME`: hire `cli:claude-code`, ticket, assign, approval card, run, two work products with
  provenance, usage and reported cost, Budgets view, approve both, close; decline; Always scoped to the
  project; pause with the card open; pause mid-run; budget stop and queued next ticket; kernel block;
  signed-out CLI; unknown runtime; Codex not-reported cost.

Fixtures: `worker-runtimes/__fixtures__/`. `--version` outputs are recorded from the real CLIs. The
claude and codex stream fixtures are SYNTHETIC, written from the documented event formats; they have not
been checked against a real run.

## Known gaps

- Real runs are unverified: stream formats, Hermes' usage-file field names (the reader accepts several
  spellings and reports nothing otherwise), Codex's current event names. First real run should refresh the fixtures.
- Gemini, cursor-agent and opencode are built into `call_agent` but have no ticket runtime; declare them in
  `agents.json` to use them (text output, no usage).
- No per-ticket git worktree. Two workers editing one project at once is not isolated, and the changed-file
  diff of one can include the other's edits. Failed runs leave their edits in place (the error names them).
- Mid-run budget caps exist only for Claude Code. Others are stopped after the fact.
- Claude Code in edit access cannot run arbitrary shell (nothing can answer its prompts), so a ticket that
  needs to run tests will report it was denied. Widening that needs an explicit allow-list design.
- `resume` is implemented and tested for Claude Code and Codex but the engine does not use it yet:
  an answered or revised ticket starts a fresh run with the thread in the prompt.
- The hire route has no `model` field, so a CLI worker runs the CLI's default model.
- API-key-only CLI auth is not supported because secrets env vars are not forwarded.
- One approval card per session: simultaneous launches queue behind it (10 minute wait, then refused).
- The effect gate hashes argv, not stdin; each launch has its own operation id so repeat launches are not
  deduplicated, and the exact prompt is bound by the sha256 in the approval action only.
- Headless Vanta-loop workers are not started by `vanta heartbeat`; `vanta company tick` still only flips
  those tickets to running, as before.
