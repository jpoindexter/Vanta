# Open-card execution — October 8, 2026

Outcome: implement and execute the acceptance of the existing open Vanta cards,
then synchronize canonical status, projections, Trello and published code.

## Starting state

- Branch `codex/librechat-shell-adapter-20261002`, starting at
  `38d88582861cf3eed8baf24ff7d236bfef52c5f2`; remote synchronized.
- Refreshed `origin/main` remains 119 commits behind this feature branch.
- Canonical inventory: 1 Building, 4 Next, 7 Horizon; 12 open. No status changes
  are justified by the initial read alone.
- Trello refresh contains all 12 open records. Parked and explicitly deferred
  cards are separate from this execution queue.
- GitHub Actions remains disabled. PR #60 is draft; no merge or release is
  implied by a card implementation or branch push.
- The previously reported installed path `/Applications/Vanta.app/Contents/Resources/app.asar`
  is absent on today's host. October 3 package evidence is historical; new
  installed-app acceptance requires resolving the current application path.
- Current local `npm audit --json` reports 28 runtime-tree advisories
  (3 critical, 12 high, 13 moderate) and 64 website-tree advisories
  (18 critical, 26 high, 17 moderate, 3 low). These are October 8 lock audits,
  distinct from default-branch GitHub alert counts. Dependency repair remains
  a separate required integration gate; no clean-security claim is supported.
- Refreshed GitHub alerts after the first push: 145 open (76 high, 58 medium,
  11 low), confirmed through the paginated API. Main protection requires one
  approval and disallows force pushes and deletion. Actions remains disabled.

## Work ownership and sequence

1. Trust implementation: shared Git command isolation, hostile-repository
   execution proof and caller coverage.
2. Operator implementation: effective capability descriptions in prompts and
   truthful available-tool recovery, with existing engine and host policies.
3. Read-only acceptance audit: exact remaining clauses across all 12 cards,
   including canonical persistence and Desktop workflows.
4. Parent: integration, affected checks, current rendered/launcher proof,
   evidence records, canonical projections, Trello and normal branch pushes.

Workers have disjoint source ownership. Only the parent changes roadmap and
publication records. No worker changes private state, credentials, Rust,
protected factory source, or MANIFESTO.md. Protected callers found during the
Git audit remain an explicit coverage gap until their concrete changes receive
the required authority.

## Closure rule and re-entry

A whole card closes only after every retained Done clause executes. Partial
implementation stays open with exact remaining gaps. Preserve all shipped
history, IDs and existing acceptance contracts; regenerate generated views.
Use affected tests and real paths, without repeating the full repository suite.

Re-entry: refresh HEAD and the worker diffs, run the shared Git and effective
capability proof, then resolve the installed application before Desktop claims.
Independent implementation can continue while external/profile/human acceptance
is unavailable. Paid work and the unfamiliar-person test remain deferred.

## Executed attention correction

Ordinary completed conversations were generating Needs-human work from words
such as "blocked", "unavailable" and "human setup" in model explanations.
The added four-case regression first failed three cases. The classifier now
refuses to create an unresolved obligation from a `done` outcome; the existing
typed blocked/failure paths remain available. Nine focused tests pass, including
an actual `createConversation().send()` with a local fixture provider and an
empty persisted ticket list. A direct classifier replay also returned no item.

This closes that false-alarm defect only. OP-03 remains open for exact structured
WorkItem/action/blocker keys, lifecycle resolution, expiry and cross-channel
quiet/refusal policy. No private tickets or user state were edited.

## Delivered units and closure decision

| Card | October 8 result | Remaining acceptance |
| --- | --- | --- |
| CAPABILITY-GROUNDED-SYSTEM-PROMPT | Shipped: its retained fixture contract executed | Live credentials/OS/network setup are explicitly not established by this contract |
| REPOSITORY-GIT-PROBE-EXECUTION-ISOLATION | Next: canonical broker, authorized factory adapters and hostile-repository proof implemented | Bootstrap installer, arbitrary interpreter Git and remaining transport/race coverage |
| LOCAL-STATE-ATOMIC-RECOVERY-BOUNDARY | Next: canonical session store uses atomic writes, writer exclusion, typed corruption and explicit recovery | Other 13 truth stores, complete CAS adoption, memory consolidation and cross-host recovery |
| DESKTOP-OPERATOR-DOSSIER-HIERARCHY | Building: demonstrated interaction regressions repaired; signed chat-first update installed and observed | Whole redesigned flow, live research/document path, approved native observe/action/readback and deferred human proof |
| CONTROL-PLANE-INSTRUCTION-WRITE-BOUNDARY | Next: named standing-order files now require fresh exact file-tool approval | Shell/code/hooks, plugins/workers/workflows, arbitrary renamed aliases, concurrent replacement and activation/receipt contract |
| BROWSER-WORKFLOW-ACTION-BOUNDARY | Next, unchanged | Canonical browser action authority and full failure fixtures plus packaged authenticated journey |
| TRUST-03 | Horizon, unchanged | Exact envelope drift, atomic consumption, replay/crash and delegation-grant contracts |
| TRUST-05 | Horizon, unchanged | All input-channel quarantine and privileged-operator/restart acceptance |
| TRUST-06 | Horizon, unchanged | Protected factory/Lab production isolation, candidate holdouts and promotion boundaries |
| OP-03 | Horizon: completed prose no longer creates false attention | Structured exact blocker keys, lifecycle/expiry/resolution and interruption/cross-channel policy |
| UX-04 | Horizon, unchanged | Whole cross-host accessibility, memory/consent and resumable first-usefulness acceptance |
| BROWSER-AUTHENTICATED-WORKSPACE | Horizon, unchanged | Owned profile/takeover/revocation/recovery and real authenticated read/reversible-action evidence |

Canonical totals: 1,363 records, 1,289 shipped, 1 Building, 4 Next, 6 Horizon,
63 Parked. Exactly one whole card changed status. All previously shipped
records, IDs, dependencies and Done clauses are retained.

### Capability grounding

The catalog is assembled from actual post-policy provider-call schemas, with
truthful Plan/provider-health state and retry refresh. CLI/TUI gallery and
Desktop HTTP use the same registry boundary; assembly performs no model request
or prompt/InstructionsLoaded hook. Disabled and explicitly empty MCP servers
remain empty. Stable prompt prefix remains byte-identical.

Executed 99 tests in nine focused files, including 640 subset/mode cases, real
loopback HTTP, command/shared assembly and MCP mounting. This is the exact
stated fixture contract, not live account, network, native permission or arbitrary
plugin certification. The Trello mirror moved to Done and its completion flag
was returned true by the mutation response.

### Git broker

The shared process boundary neutralizes repository execution sinks and isolates
global/system configuration. Configuration probe failure fails closed. HTTPS
authentication stays scoped and out of argv; repository client certificate and
proxy execution authority are rejected before network use. The shell route
retains its existing sandbox/wrapExec path; remote/background Git refuses rather
than silently inheriting authority.

Executed 153 affected tests in 21 files, a final 40-test Git/shell/release set,
and `node --import tsx scripts/git-repository-isolation-proof.mjs` (initial 12 steps,
four denied approvals, zero executable markers or provider calls). A real local
TLS authentication fixture also passed. Static effect inventory is 414 sources,
1,094 primitive calls and eight direct executors with no unmediated static
findings at the first checkpoint; final regeneration after factory routing is
413 sources, 1,090 primitive calls, eight direct executors and zero unmediated
static findings. Static coverage is not every runtime/transport acceptance.

Jason explicitly authorized the prepared four-file factory Git broker patch
during this execution. `vcs.ts`, `executor.ts`, `verifier.ts` and
`verify-checks.ts` now route existing Git calls through the same broker; only
imports, substitutions and unused locals changed (10 insertions, 14 deletions).
The broker supports the adapter's existing scoped `clean` verb as a write,
without adding a new model-tool verb or changing factory authority/promotion.
Three actual factory caller regressions first failed and then passed; final
factory/Git checks are 53 tests in six files, typecheck passed and all five
affected production files are size-clean. The updated standalone proof has
13 steps, four denied approvals and zero markers/provider calls. Rust and
MANIFESTO.md remain unchanged. No real-checkout `clean` or factory cycle ran.

### Session recovery

Session writes use exclusive owner-only same-directory temporaries, flush,
atomic rename and supported directory sync under cross-process writer exclusion.
Alive writers are not evicted by age; dead-lock reaping has exclusive ownership.
Optional version checks reject stale writes. Corrupt/schema/read failures are
actionable rather than empty successful sessions; read-only lists retain healthy
entries and diagnostic rows. Last-good recovery retains the suspect source.

Executed 49 tests in five files, including actual child-process crash before
rename, two-process rename/archive, and real loopback corrupt-session HTTP.
Further regression checks proved corrupt resume leaves the current session
unchanged and healthy search/artifacts remain available. Completed-turn false
attention passed nine focused tests. No private state was repaired or discarded.

## Executed gates and boundaries

| Command / gate | Exit / result | Scope |
| --- | --- | --- |
| `npm run typecheck` | 0 | Runtime TypeScript |
| `npm run desktop:renderer:typecheck` | 0 | Desktop renderer TypeScript |
| `npm run desktop:pack` | 0 | Production renderer, kernel binary and Developer ID signed local package; not release/notarization |
| Focused capability tests | 0; 99 tests / 9 files | Fixture contract described above |
| Focused Git affected tests | 0; 153 tests / 21 files | Changed adapter/broker boundaries |
| Final Git/shell/release tests | 0; 40 tests / 4 files | Sandbox retained, writes and release adapter regressions |
| Standalone Git hostile-repository proof | 0; 12 steps | Real repository execution markers and denied writes |
| Authorized factory/Git regressions | 0; 53 tests / 6 files | Actual fixture adapters, scoped clean compatibility, routing only |
| Final standalone Git proof | 0; 13 steps | Includes actual factory status/inventory callers; four denied approvals, zero markers/provider calls |
| Session persistence/recovery tests | 0; 49 tests / 5 files | Crash/concurrent writers/corruption API |
| Needs-human tests | 0; 9 tests / 2 files | Ordinary done outcome quiet; typed blockers retained |
| Parent compatibility regression set | 0; 35 tests / 7 files | Resume, healthy search/artifacts and related consumers |
| Final parent compatibility set | 0; 17 tests / 3 files | Messaging/artifact/resume compatibility |
| Explicit changed production size lint | 0; 56 files | Zero violations/missing at pre-package checkpoint |
| Changed-source Semgrep | 0; 57 files, plus 4 authorized factory files | 74 rules; zero findings |
| Tracked/non-ignored snapshot Gitleaks | 0; 4,684 files / 22.66 MB | No findings at pre-final-source checkpoint; redacted |
| Architectural boundaries | 0; 5 boundaries | Static import contract, not runtime certification |
| Roadmap generator tests | 0; 7 tests | Generated projection/history and graph validation |
| Canonical schema/history comparison | 0; 1,363 records | One status change; 1,288 earlier shipped records/IDs/Done/dependencies unchanged |
| Full TypeScript suite | Not run | Owner requested affected checks, not another whole-suite run |

Counts overlap; they are separate executed commands, not an additive unique-test
total. Early failed package runs are retained as regression evidence below.
The subsequent complete behavior run and narrower final build proofs have
separate archive identities; no proxy or old run is attributed to a new archive.

## Continued Desktop regression work

The document-link investigation reproduced loss of the originating link's DOM
identity during unchanged Markdown rerenders. Memoized markup now retains that
link; the focused renderer tests prove red then green. The Mini return uncovered
a real hit-target overlap: prompt-jump markers covered part of Copy response.
The final correction keeps the original symmetric transcript/composer gutters,
places markers entirely within the left gutter and keeps focus indication
inside the frame. Existing alignment assertions remain unchanged; nine actual
Copy hit points and accessibility checks were added, not substituted for them.

The rebuilt signed candidate at ASAR
`de371c53a75c3e1d2acdfcf0f521720baa01ad29287f1fd5b3ae6204736f8c75`
passed 52 complete interaction checks, including those corrections, then failed
the explicit queued-retry path: Queue next reported "no turn is running" while
the UI indicated a streaming turn. This was failure evidence, not an
installation receipt. The later correction and successful runs supersede it
as current status, without deleting its diagnostic history.

Turn admission now uses explicit request/session acknowledgments instead of
assuming a UI streaming flag means the server admitted a turn. Starting is
visible, queued drafts remain until acknowledgment, Stop survives delayed or
lost admission and is idempotent, and stale acknowledgments cannot re-trigger
a send. Both chat-first and Classic use the shared contract. Focused admission
checks passed (48 tests across eight files, then five final helper regressions).
The omitted `provider_auth` recovery-receipt disposition was also reproduced
and corrected: schema/store/chat-concurrency checks passed 34 tests in three
files. Document/link checks passed 48 tests in six files.

The forced first-launch project-folder chooser is removed. Explicit workspace
selection and saved restoration remain available; normal New chat starts with
the composer. Host checks passed 28 Node tests and one tray test. No account
permissions, preferences, history or operator state were reset.

### Exact package and installation identities

| Archive SHA-256 | Executed command and result | Boundary |
| --- | --- | --- |
| `93cb901402eba33fd77667b87affb705e07534de2fa8f3f2b916955bc7445147` | `node scripts/desktop-chat-first-proof.mjs`: exit 0, 77 checks | Core chat/queue/Stop/draft/history/workbench/Mini/approval restart fixtures; before first-launch dialog removal |
| `7d28c723ad8f0063abc010a40cc0e4b818ec377386f089eab5b22476761b2ee3` | `node scripts/desktop-first-launch-proof.mjs`: exit 0, two checks; `node scripts/desktop-instruction-boundary-proof.mjs`: exit 0, four checks | Actual signed Electron, disposable state, first launch/restart and exact file-tool approval; before final shadow adjustment |
| `e7016146dc6f23d7c0350defb0fa2b9d69f836fcf5682e04671e948b79fe1e36` | `node scripts/desktop-chat-first-proof.mjs --quiet-controls-only`: exit 0, 16 checks | Final light/dark/forced-colors elevation, controls, menus, narrow layout, actual native `hasShadow()`; zero fixture model requests |

Final shadow build also passed nine focused elevation/gutter/theme tests,
production Desktop build and strict Developer ID signature verification. The
frame overlay cannot intercept input; forced colors replaces shadows with
system boundaries. Native screenshots confirmed the installed workspace's
soft sidebar seam. Window-only screenshot cropping does not independently
prove the outer compositor shadow's exact spread.

The guarded installer verified the tested archive before staging and after
replacement, refusing a running app. Normal Quit preceded the update. Exact
installed path: `/Applications/Vanta.app`; latest installation time
`2026-10-08T16:49:11.450Z`; receipt and retained previous `7d28…` bundle:
`/Users/jasonpoindexter/Library/Application Support/Vanta Local Updates/update-gGNMc3/`.
Opened the exact installed application; normal-profile chat history, New chat,
editable composer and white/grey interface were observed. No model message was
sent and no normal-profile approval or native control acceptance is inferred.
The whole Codex-like navigation/conversation/activity redesign remains Building.

## Continued protected-instruction subset

Actual dispatch-to-file-tool fixtures first failed 12 of 15 cases: Full access
silently created named standing-order files and edited AGENTS.md despite a
denied confirmation callback. The classifier now requires fresh confirmation
for root/nested/case-varied standing filenames, agent/skill definitions and
Claude settings, including resolved path, exact byte count/hash, reason and
project scope. Hard-linked files conservatively disclose unresolved aliases.
Ordinary source creation retains routine permission behavior.

After repair, 111 focused tests across five files passed, including 18 new
cases; runtime typecheck and both production size checks passed. Full access,
Auto, Accept edits, Always rules and spent approvals do not waive this exact
confirmation. Denials preserve bytes and receipts omit full instruction bodies.
The dedicated signed-package proof subsequently passed four checks against
the `7d28…` archive: Full access plus stored Always still asks freshly and denial
preserves bytes; Allow once executes the exact write with redacted receipt;
restart Auto asks freshly; ordinary source creation remains prompt-free. Eight
fixture model completions exercised the actual Electron/HTTP/kernel/file-tool
path with disposable state. The whole card remains Next: shell/code/hooks,
MCP/plugins, workers/workflows, arbitrary renamed aliases, concurrent replacement
and crash/activation/effect-receipt coverage remain unclosed.

## Publication checkpoints

- `f482136674ecf0951c114ba172163bc25869f24c`: Git broker, adapters and the
  explicitly authorized four factory substitutions. Normal push returned exact
  local/remote SHA equality. Staged Gitleaks, 38-production-file size gate,
  five architecture boundaries and whitespace passed in the real commit hook.
- `124357bc958509077c56a8d7200a1bf1bbeda6c3`: capability grounding, durable
  session recovery and attention corrections. Staged Gitleaks,
  22-production-file size gate and architecture checks passed. Normal push
  returned the exact remote SHA; refreshed tracking divergence is 0/0.
- `ae2920766ca3f374b1859b5263ec3c962211792d`: demonstrated provider-auth
  recovery receipt schema regression and its colocated test. No new authority.
- `99f0a783`: exact standing-instruction file-tool approval and packaged proof.
  Commit hook: two production files size-clean, five architecture boundaries
  passed and staged secret scan clean.
- `d25c64ac`: Desktop admission, document-link focus, first-launch friction,
  layered elevation/native shadow and generated renderer assets. Commit hook:
  eleven production files size-clean, five architecture boundaries passed and
  staged secret scan clean.

Final source gates: runtime and renderer typechecks passed, 73 changed TypeScript
production files had zero size violations/missing paths, five architecture
boundaries passed, and affected Semgrep found zero findings under 74 rules.
The Electron host and first-launch proof also passed their size checks.
Final tracked/non-ignored snapshot secret scan passed: 4,695 regular files,
22.70 MB, zero findings. Final schema/architecture tests passed 24 checks in two
files; generator/history tests also passed. Final committed-range secret scan,
protected-path inventory and publication SHA are recorded in draft PR #60.

The current branch remains a draft feature stack, not current `main` or a
public release. No force push, tag move, merge, paid workflow or Actions run.
