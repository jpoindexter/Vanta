# Hermes post-release fixed-point audit — 2026-09-03

## Verdict

The repeated comparison reached a fixed point after corrections: the final full
pass found no additional distinct Vanta outcomes. This audit adds two confirmed
internal security/reliability cards to **Next**, three bounded follow-up cards to
**Parked**, strengthens six existing owners, parks the two deferred human
proof cards, and fixes a build-order defect that could misorder dependency chains
longer than ten links.

This is roadmap and generator work only. It does not implement the new behavior,
ship a Vanta release, prove Hermes's release claims, or complete the deferred
unfamiliar-person test. No Hermes source, runtime, assets, branding, tests,
credentials, local state, or checkout entered Vanta.

## Current source corpus

The frozen release-history audit remains the authoritative comparison for all 31
published releases. This supplement covers what that audit explicitly excluded:
current Hermes source after v0.21 and the refreshed documentation index.

| Fact | Observed value |
| --- | --- |
| Published release bodies | 31 |
| Latest release | `v2026.8.31` / v0.21.0 |
| v0.21 tag object | `6e8f8418e6378eb2617e4de074e13dedd091b8af` |
| v0.21 release commit | `29112bef099274229cadff79cdff7bf7b99c4b77` |
| Hermes `main` | `562ee8ab76a703b7f524172cae0b1d52f9f94bd3` |
| Commits after v0.21 | 932 total; 914 non-merge subjects |
| Current indexed documentation | 209 unique pages |
| Newly indexed page since the frozen 208-page audit | `user-guide/local-models` |
| Release API SHA-256 | `e4f54d1fc2ae477ffdeba0040dd0881e014fe78391db709117906580f465c1da` |
| `llms.txt` | 39,404 bytes; SHA-256 `3c5871c44f2ae58c1c1d1b60b258d7ad84f79b270a97bfd0e9d8f3921ae13962` |
| `llms-full.txt` | 4,095,994 bytes; SHA-256 `70804c15e515a18196faee5c8e812f89150b5d421460bc077b8e833976a344ea` |

Official sources:

- [Hermes releases](https://github.com/NousResearch/hermes-agent/releases)
- [Hermes v0.21 release](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31)
- [Hermes documentation index](https://hermes-agent.nousresearch.com/docs/llms.txt)
- [Hermes Local Models guide](https://hermes-agent.nousresearch.com/docs/user-guide/local-models)

The audit enumerated all 914 non-merge subjects, grouped them by subsystem, and
inspected representative source and test changes for claims that affected Vanta.
That is complete classification, not a claim that every line in every commit was
deep-read.

## New distinct outcomes

### Next — `REPOSITORY-GIT-PROBE-EXECUTION-ISOLATION`

Hermes commit
[`f6234d0`](https://github.com/NousResearch/hermes-agent/commit/f6234d00c5d59450adea1d7edd30ad3859375c79)
documents a host-command execution class in automatic Git context gathering:
repository-local configuration and attributes can invoke fsmonitor, hooks,
external diff, or textconv before an agent's ordinary approval boundary.

Vanta's current `runGit` and related direct Git call sites invoke the system Git
with a working directory and process limits but do not centrally neutralize
repository, global, or system execution sinks, nor consistently add
`--no-ext-diff` and `--no-textconv` to diff-rendering commands. The new card owns
one canonical Git process boundary and requires a real armed-repository proof.
This is a confirmed code-path gap, not evidence that a Vanta user was exploited.

### Next — `LOCAL-STATE-ATOMIC-RECOVERY-BOUNDARY`

Vanta has strong atomic persistence in several newer stores, but its default
filesystem session adapter still writes the live JSON file directly and converts
read, parse, and schema failures into a missing-session result. Other canonical
stores retain direct-write variants. Current Hermes state, backup, quarantine,
and repair work makes the missing shared boundary concrete.

The new card owns failure-atomic writes, concurrency control, quarantine,
last-known-good recovery, visible degraded state, and stable identity across
sessions, WorkItems, runs, approvals, receipts, schedules, settings, and
continuity. It does not claim that every current store is corrupt.

### Parked — `LOCAL-MODEL-AUTOFIT-CONTEXT-LIFECYCLE`

Vanta already ships the local runtime controller, MLX/llama.cpp lifecycle,
first-inference wizard, download queue, and resource ledger. The new Hermes Local
Models guide exposed one distinct remaining operator outcome: one inventory that
can judge hardware fit, provenance, format, useful context, quality, and runtime
lifecycle before the operator hand-tunes engine settings. It remains Parked until
observed setup failures or repeated manual tuning justify the work.

### Parked — `DESKTOP-BROWSER-VISUAL-COMMENT-DRAFT`

The second complete pass found that the release audit named in-app browser
control but had not separated Hermes commit `10f2a2096`'s comment-mode outcome.
Vanta has browser previews and visual verification, but no retained contract for
pinning numbered regions, attaching short notes and bounded crops, and placing
that bundle into the composer without sending it. The new prepare-only Desktop
card remains Parked behind the browser action boundary and operator dossier.

### Parked — `LEARNING-SKILL-MEMORY-ROUTING`

Hermes advanced again during the confirmation loop. Commit `562ee8ab` makes a
useful distinction that Vanta does not yet enforce centrally: procedure,
task-class preferences, and corrections learned while doing a task belong in an
approval-gated reusable skill; durable memory is the exception for facts and
preferences that genuinely apply across sessions and domains. Vanta's current
post-turn reviewer can propose skills, but its separate memory classifier broadly
marks corrections and preferences durable. The parked card owns that routing
decision without reopening the shipped self-learning primitive or authorizing
silent writes.

## Existing owners strengthened

| Current Hermes signal | Vanta owner | Disposition |
| --- | --- | --- |
| Slow context reads must remain inside a turn deadline | `HARNESS-UNIFIED-DEADLINE-FAILURE-CONTRACT` | Done contract strengthened; no duplicate card |
| Schedule doctor must separate job, execution, and delivery truth | `SCHEDULE-CONTINUITY-CHANGE-SUPPRESSION` | Done contract and re-entry trigger strengthened |
| Live fan-out needs process, file-descriptor, and output budgets | `DELEGATION-LIVE-STEERING-BUDGET` | Resource dimensions added to existing budget contract |
| Deferred tool schemas need concrete validation before exposure | `TOOL-DISCOVERY-SCALE-QUALITY` | Invalid-schema fixtures added to the parked outcome |
| Desktop update and repair must stage, verify, swap, and recover | `DESKTOP-NATIVE-RESILIENCE-SHELL` | Existing owner retained; no second updater card |
| Usage-less empty responses and cut text-serialized tool calls need deterministic settlement | `HARNESS-UNIFIED-DEADLINE-FAILURE-CONTRACT`; `TOOL-CALL-REPAIR` | Existing empty-response owner tightened and partial-markup storage/display case added |

## Complete subsystem disposition

| Post-release subsystem | Vanta disposition |
| --- | --- |
| Git/config execution security | New Next Git-probe isolation card |
| SessionDB, backup, quarantine, repair, and recovery | New Next shared local-state boundary |
| Cron handoff, continuity, no-change suppression, and delivery truth | Existing schedule continuity card strengthened |
| Context loading, compression, timeouts, and blank turns | Existing unified deadline and compaction owners |
| Tool search, MCP schema validation, catalog health, and discovery | Existing tool-discovery and MCP fleet owners |
| Delegation, fan-out, steering, timers, process and descriptor pressure | Existing live-steering budget owner strengthened |
| Desktop updater, backend lifecycle, connection health, and recovery | Existing native resilience and connection lifecycle owners |
| Local models, Ollama, MLX, llama.cpp, fit, and context sizing | Existing shipped runtime stack plus one parked auto-fit outcome |
| Browser sessions, authenticated profiles, refs, takeover, cleanup, and visual comments | Existing browser action/authenticated-workspace cards plus one parked visual-comment draft outcome |
| Gateway, messaging, provider, profile, and bot breadth | Existing owners or rejected breadth; no duplicate card |
| TUI layout, model controls, queue, approvals, and restart continuity | Existing shipped or retained UI owners |
| Learning, skills, memory, task corrections, and preferences | Existing self-learning and memory owners plus one parked cross-store routing contract |
| Web/search/file/media/citation refinements | Existing tool and provenance owners |
| Telemetry, paid services, Bot Mode, pets, fleet branding, visual skins | Rejected as strategy or product-identity mismatch |

## Repeated-pass method

Each pass used the same gates:

1. refresh official release, tag, source-head, and documentation facts;
2. enumerate and classify every post-release non-merge subject;
3. compare each group with canonical roadmap IDs and relevant Vanta source;
4. reuse an existing owner when its Done contract covers the outcome;
5. add a card only for a distinct user outcome with dependencies, stop rules,
   re-entry evidence, and executable proof;
6. regenerate all derived roadmap projections;
7. verify schema, uniqueness, dependencies, self-dependencies, cycles, ordering,
   status counts, forbidden content, protected paths, secrets, and build output;
8. repeat after every correction until one complete pass returns zero new items.

Pass 1 found eleven correction units: three distinct outcomes, five
existing-owner strengthenings, the deferred-human-proof status mismatch, stale
public counts, and the long-chain generator defect. Findings are counted by
product or system owner rather than inflated by changed-file count. Pass 2 found
two additional corrections: the live
`DECISIONS.md` ordering still treated the deferred human test as the sole Next
card, and browser visual comments were named in the source inventory but lacked
a distinct outcome. Pass 3 refreshed the upstream source and caught three new
Hermes commits: they added no new Vanta card, but tightened the existing
empty-response and tool-call-repair contracts. Pass 4 caught one more upstream
commit and added the distinct learned-knowledge routing card after checking
Vanta's actual skill-review and memory-classification paths. Pass 5 is the
zero-new-finding confirmation recorded below.

## Resulting roadmap state

The canonical roadmap contains 1,361 unique cards:

- 1,288 Shipped;
- 4 Next;
- 0 Building;
- 8 Horizon;
- 61 Parked.

The dependency-ready Next sequence is:

1. `REPOSITORY-GIT-PROBE-EXECUTION-ISOLATION`
2. `CONTROL-PLANE-INSTRUCTION-WRITE-BOUNDARY`
3. `LOCAL-STATE-ATOMIC-RECOVERY-BOUNDARY`
4. `BROWSER-WORKFLOW-ACTION-BOUNDARY`

`DESKTOP-OPERATOR-DOSSIER-HIERARCHY` and
`DESKTOP-COLD-OPERATOR-RELEASE-PROOF` are Parked at the operator's request until
the voluntary unfamiliar-person run resumes. `GROW-01` remains Parked and no
paid research, participant, recruiting, CI, hosting, outreach, or service spend
is authorized.

## Validation

Pass 5 refreshed the official sources again after every Pass 4 correction and
found the same 31 releases, 932 post-release commits, 914 non-merge subjects,
209 indexed documentation pages, and recorded hashes. Re-running the complete
disposition and projection checklist returned **zero new cards, owner changes,
status changes, or projection corrections**. This is the fixed point for the
frozen sources recorded here.

| Gate | Exit | Observed result | Does not establish |
| --- | ---: | --- | --- |
| Official-source confirmation pass | 0 | Confirmed 31 releases, 932 commits, 914 non-merge subjects, 209 pages, and recorded hashes | Future Hermes changes |
| Build-order tests | 0 | 4/4 passed, including a reversed 16-link dependency chain | Application behavior outside roadmap ordering |
| Canonical roadmap schema and graph | 0 | 15 files / 173 tests passed; 1,361 unique records; zero missing, self, duplicate, or cyclic dependencies | New card implementation |
| TypeScript typecheck | 0 | Canonical `vanta-ts` typecheck passed | Runtime execution of unimplemented cards |
| Roadmap generation | 0 | 12 open cards; 0 Building, 4 Next, 8 Horizon; generated public projection updated | Website publication |
| Documentation dependency policy | 0 | Bounded exception only: 2 `image-size` advisories expanded through 19 packages, review before 2026-10-01 | A fully advisory-free dependency graph |
| Dependency and image-input tests | 0 | 7/7 passed | Future upstream safety |
| Website typecheck and production build | 0 | Both passed; affected image parsers remained disabled and build inputs clean | Deployment or hosted-route behavior |
| Repository-owned secret scan | 0 | 2,178 Git commits plus the exact tracked/non-ignored snapshot; zero findings | Secrets outside repository-owned content or unknown detector gaps |
| Protected and forbidden path scan | 0 | Zero Rust kernel, factory, `MANIFESTO.md`, local `.vanta`, Hermes checkout/source, Nightcode, or quarantine paths in the change set | Historical content outside this change set |
| Whitespace check | 0 | `git diff --check` passed | Semantic correctness by itself |

The exact final validation was executed after the last roadmap correction. The
worktree remains intentionally uncommitted and unpushed pending explicit
publication authority.

## Remaining boundaries

- The two new Next cards and the existing instruction/browser boundaries still
  require implementation and their exact real-path proofs.
- The unfamiliar-person Desktop proof remains deliberately deferred.
- GitHub Actions remain disabled and were not used.
- No commit, push, tag, merge, release, deployment, or publication is part of
  this audit.
- Future Hermes commits or documentation changes require a new dated refresh;
  a fixed point applies only to the frozen sources above.
