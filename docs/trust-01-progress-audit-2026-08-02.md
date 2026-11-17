# TRUST-01 universal effect gateway progress audit

Date: 2026-08-02
Branch: `codex/trust-01-universal-effect-gateway-20260802`
Base HEAD: `c469c9fa4101570a178f6ba52b2404120a709e91`
Observed `origin/main`: `4911ae44bbb35beef4511ba298475ba5a82b7e1c`

## Verdict

**PASS. The written `TRUST-01` Done contract is executed for the supported local Vanta and signed macOS hosts, and the roadmap card is `shipped`.**

The local implementation, adversarial evidence, signed macOS package, all three separate Google capability grants, and affected packaged-host paths are green. The sanitized live Google proof refreshed Gmail without sending, rejected CR/LF header injection before approval, and created, conditionally updated, exactly read back, and cleaned up one opaque Calendar event and Drive file. It logged no provider content, account identity, or credential. This does not claim cross-platform packaging, notarization, merge, release, publication, deployment, or coverage of effect paths added after the checked inventory.

## Before and after

### Before

- Ordinary agent dispatch, Desktop terminal, MCP serve, pipelines, workflow hosts, voice transcription, vision watch, and several self-mediated tools did not share one complete effect boundary.
- Some tools with real effects were labeled as effect-free reads.
- Durable effect claims could bind payload-dependent keys in ways that let changed arguments create a new claim rather than fail as drift.
- Calendar and Drive mutations lacked the complete stable-operation, immutable-ID, conditional-write, exact-readback, and compensation behavior required by the card.
- The inventory validator detected only a narrow literal `tool.execute(...)` pattern and could report zero unmediated effects without detecting named executors or browser/provider/sensor primitives.
- `TRUST-01` was `next`.

### After

- A default-deny tool effect policy routes every non-pure tool through `executeToolEffect`; only an explicit local inspection set bypasses it.
- Dispatcher, Desktop terminal, MCP serve and its approval bridge, pipeline steps, workflow steps, voice transcription, vision watch, MCP tools, plugins, shell, loops, self-repair, and other registered effect paths use the shared executor or an explicitly classified adapter.
- Authority is bound to scope, operation ID, and a SHA-256 descriptor over effect kind, target class, action, and payload hash. A different child effect must receive an explicit capability from the central gateway.
- Inner approval requests consume an exact reusable decision only when action, operation, and scope match. Distinct actions return to the central gateway for kernel assessment and a fresh operator decision.
- Claims are created before execution, payload drift fails closed, settled effects replay without repeating, interrupted consequential effects remain unknown, and provider bodies/credentials are not journaled.
- Gmail header CR/LF rejection remains covered. Google Gmail, Calendar, and Drive authority remains separate and incremental.
- Calendar create/update use stable operation identity, client-supplied immutable IDs, ETags, readback, and compensation. Drive create/update use reserved immutable IDs, Drive v3 monotonic-version preflight, exact byte readback, advanced-version verification, and version-guarded compensation. Drive v3 does not expose atomic update CAS, so the adapter does not claim it.
- The checked effect surface pins 409 production sources and 1,074 primitive calls. Eight remaining direct executors have explicit rationales; unknown/unmediated executors are zero under the executed validator.
- The exact signed app passes nine source and nine packaged desktop flows, trusted terminal execution, hostile-origin denial, three-process continuity recovery, capture-only privacy, and a real local `say` → Whisper transcription.
- Runtime dependency overrides remove the five previously reported high-severity `adm-zip`/`sharp` findings; `npm audit --omit=dev` now reports zero vulnerabilities and the transcription real path still passes.
- Vanta `src/**/*.test.ts(x)` files are excluded from the app archive. The rebuilt `app.asar` has no Vanta test source and its unpacked contents have zero Gitleaks findings.
- Gmail, Calendar, and Drive authority were granted separately. The live proof passed and cleaned up both temporary provider records.
- `TRUST-01` is `shipped` for the executed hosts and exact written Done contract.

## Diff inventory

- 61 repository paths before final audit rendering: 50 tracked changes and 11 untracked files.
- Tracked diff before final audit rendering: 1,586 insertions and 921 deletions.
- New checked artifacts include the complete effect-surface inventory, inventory generator, gateway implementation, and gateway tests.
- Protected paths changed: zero (`src/**` Rust kernel, `vanta-ts/src/factory/**`, and `MANIFESTO.md`).
- No external reference-implementation or unrelated-project source, data, credential, or artifact was copied into the repository.

## Independent adversarial review

The independent reviewer was allowed to fail the implementation repeatedly. Findings were corrected rather than waived:

1. Named direct executors, vision watch, self-mediated tool bypasses, and payload-bound replay keys.
2. Capture/transcription read exemptions and duplicate inner policy boundaries.
3. Mutating `life_search`/`recall`, descriptor-unbound authority, and MCP/pipeline/voice host bypasses.
4. MCP JSON-RPC correlation IDs incorrectly reused as durable operation IDs.
5. Final exact-tree verdict: **PASS — no remaining blockers found.**

The final regression proves two identical accepted MCP calls can reuse JSON-RPC response ID `44` while executing as two distinct server-owned invocations.

## Executed verification

| Command or criterion | Result | What it establishes | What it does not establish |
|---|---:|---|---|
| `npm test` | exit 0; 1,520 files; 14,002 passed; 3 skipped; 0 failed | Exact final TypeScript tree passes the complete local suite | Deployment or untested future paths |
| `npx tsx scripts/trust-01-google-live-proof.ts` | exit 0; Gmail refusal true and sent false; Calendar create/update/readback/cleanup true; Drive create/update/readback/cleanup true; persisted provider content false | Separate live Google authority and sanitized mutation behavior | Other Google accounts or every provider failure mode |
| Focused TRUST-01 matrix | exit 0; 24 files; 269 passed | Gateway, authority, provider, permission, host, drift, and recovery paths | Complete product usefulness |
| Final MCP/authority regression | exit 0; 3 files; 43 passed | Descriptor binding and JSON-RPC ID reuse behavior | Cross-process client retries without a supplied idempotency contract |
| `npm run trust:effect-ledger` | exit 0; 4/4 mutation checks | 409 sources, 1,074 primitives, 8 explicit direct adapters, 0 unknown executors | Undiscovered runtime-generated code outside the checked source tree |
| `npm run typecheck` | exit 0 | Runtime TypeScript contracts compile | Runtime behavior |
| `npm run desktop:renderer:typecheck` | exit 0 | Renderer TypeScript contracts compile | Native packaged execution |
| `node scripts/desktop-flow-proof-suite.mjs` | exit 0; 9 source + 9 packaged flows | Exact signed app covers shell, recovery, schema trace, 500-turn navigation, queued turns, runtime profiles, attachments, sessions, Outputs, and Connect | External provider mutations |
| Packaged local-origin/terminal smoke | exit 0; 9 hostile requests denied; trusted terminal effect executed | Signed app denies hostile local origins while retaining trusted terminal capability | Every possible browser exploit |
| Packaged continuity restart | exit 0; 3 launches; 3 receipts; 0 serious accessibility violations | Process restart, exactly-once prepared read, expired uncertainty, refusal reset, snooze, and skip | OS crash at every possible instruction boundary |
| Native capture-only proof | exit 0; packaged capture true; provider called false; persisted false | macOS capture works without upload or persistence | Vision-provider interpretation |
| `VANTA_TEST_VOICE=1 ... whisper-stt.test.ts` | exit 0; 6/6 | Real local `say` → Whisper → transcript path | Microphone hardware quality in every environment |
| `npm run desktop:dist` plus deep `codesign --verify` | exit 0; app and DMG valid | Exact macOS app and DMG were rebuilt and satisfy their designated requirement | Notarization or public distribution |
| Website `npm run build` | exit 0 | Roadmap/public documentation production build | Publication |
| `cargo test --quiet` | exit 0; 70 passed | Existing Rust kernel tests remain green | Rust was not changed |
| `npm audit --omit=dev` | exit 0; 0 vulnerabilities | Shipped npm dependency graph has no known audit finding after pinned transitive remediation | Zero-days or non-npm components |
| Semgrep over 56 changed/untracked files | exit 0; 0 findings | No configured static-analysis finding in the payload; full-tree findings were four localhost-only test requests | Absence of all possible vulnerabilities |
| Gitleaks full history | exit 0; 2,974 commits; 0 findings | No configured secret finding in Git history | Word-shaped secrets that do not match a rule |
| Gitleaks unpacked signed `app.asar` | exit 0; 0 findings | The exact rebuilt app archive contains no configured secret finding | Runtime state outside the package |
| `git diff --check` | exit 0 | No whitespace errors | Semantic correctness |
| Protected-path scan | exit 0; 0 paths | Required protected source remained unchanged | Behavior outside those paths |

## Artifact hashes before this report

| Artifact | SHA-256 |
|---|---|
| `roadmap.json` | `06463001052339fc3623a7e8ded20c332975cbfb00c7d2fe85cf6f1e0c7d5599` |
| `docs/trust-01-effect-ledger-2026-08-02.json` | `db70c5f4b5b99fc1616da82e15cc27edbb2d0d4dfaca79fe17cb2283b911ea2b` |
| `docs/trust-01-effect-surface-inventory-2026-08-02.json` | `ee02a7b47a704226164f4cc7c38437e5ecbb7ac47cda7be9eab656410568cc4e` |

## Remaining work before promotion

None. The written Done contract has been executed. Paid GitHub Actions are not used; commit, push, and the non-release checkpoint remain repository delivery steps rather than product proof.

## Git state

- Commit created: no.
- Push performed: no.
- Tag created: no.
- Merge/release/deployment: no.
- Worktree intentionally dirty with the reviewed 61-path implementation, exact package hygiene, this audit, and its receipt.
