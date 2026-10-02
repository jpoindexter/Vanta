# Vanta: one agent, one workspace, several ways in

## Outcome and constraints

Owner: Jason. The product is a general-purpose, local-first ambient agent, not an interview edition, a chatbot-only redesign, or a developer dashboard with new colors. The full journey is: invoke → give context → work → intervene → inspect the result → resume or schedule. White/grey surfaces and restrained Vanta violet are the default; dark remains optional.

Keep the existing engine, tool policy, credentials, conversation records, schedules, and artifacts. A small presence must not create a second assistant or silently watch the screen, record audio, broaden authority, or send anything. Technical project/runtime choices are optional context, not prerequisites for a conversation. Paid work and unfamiliar-participant acceptance remain deferred.

## Evidence, not inferred parity

- **Observed:** the installed Vanta application previously presented a task contract before the first message (owner screenshots). The current integrated candidate opens an editable chat instead, but that alone does not complete this redesign.
- **Observed before this repair:** native Quick Ask opened a separate `/companion` renderer without main-window progress or Stop. The candidate now opens the same native workspace in mini mode instead. Remote companion remains a separate, explicitly paired capability; it is not the desktop avatar.
- **Observed:** Codex inspection was attempted through the permitted native application tool, which refused access to `com.openai.codex`. This restriction was not bypassed. The owner's screenshots are visual evidence; no claim is made that Codex's installed internals were extracted.
- **Reviewed public source:** [Codex app-server at ca466061](https://github.com/openai/codex/blob/ca466061d64f0b44f416135c7fd06aa7af850bbc/codex-rs/app-server/README.md): durable thread state, provider/model capability reporting, cancellation, and policy boundaries. This is the public harness, not evidence that the native desktop renderer is available to clone. Its license is Apache-2.0.
- **Reviewed public source:** [Goose ThemeContext](https://github.com/aaif-goose/goose/blob/aa294302fe501b5c2bf6a196288530c3384f6b26/ui/desktop/src/contexts/ThemeContext.tsx), [LauncherView](https://github.com/aaif-goose/goose/blob/aa294302fe501b5c2bf6a196288530c3384f6b26/ui/desktop/src/components/LauncherView.tsx), and [App](https://github.com/aaif-goose/goose/blob/aa294302fe501b5c2bf6a196288530c3384f6b26/ui/desktop/src/App.tsx): saved semantic themes, lightweight invocation, and explicit navigation to ongoing work. Apache-2.0; no source copied.
- **Public product reference:** [Codex application](https://openai.com/index/introducing-the-codex-app/) and [ChatGPT Work](https://openai.com/index/chatgpt-for-your-most-ambitious-work/) support using conversation, work, review, and documents together. They do not establish Vanta feature parity.
- Hermes/Vellum reviews remain pinned in `docs/upstream-agent-desktop-adoption-2026-10-01.md` where available in the canonical planning checkout. This work does not relabel those earlier reviews as a new exhaustive audit.

## Fresh upstream source comparison

These are bounded code reviews, not claims to have inspected every feature or run those products. No upstream source, runtime, branding, credentials, or repository checkout was copied into Vanta.

| Reviewed source | Relevant pattern | Vanta decision and remaining proof |
| --- | --- | --- |
| [Hermes composer popout](https://github.com/NousResearch/hermes-agent/blob/7200e0f5ae0c55a4a2e4a3aabc653f5c12b3204f/apps/desktop/src/app/chat/composer/hooks/use-composer-popout.ts) | Visible-surface ownership, clamped floating geometry, focus only on the owning surface | Implement full/mini presentation on the same BrowserWindow; restore geometry and panels. Do not build two independently sending chat controllers. Multi-monitor native testing remains separate from the simulated bounds test. |
| [Hermes composer drafts](https://github.com/NousResearch/hermes-agent/blob/7200e0f5ae0c55a4a2e4a3aabc653f5c12b3204f/apps/desktop/src/app/chat/composer/hooks/use-composer-draft.ts) | Draft identity belongs to the editor that loaded it; switching, pending debounce and hidden panes must not overwrite another thread or steal focus | Preserve current Vanta draft/queue identity tests; extend the contract to attachments, selection and hidden-window re-entry. Same-window mini proof does not prove cross-project attachment recovery. |
| [Buzz agent status](https://github.com/block/buzz/blob/448407a972ca9da0c1e13d49ee2c2170821be8a2/desktop/src/features/agents/ui/AgentStatusBadge.tsx) | Distinguish process running, starting, and actual activity instead of one optimistic online badge | Avatar exposes only Connecting, Ready, Working or Needs you from the active workspace; Ready means available, never task verified. Background-agent notification accuracy remains open. |
| [Buzz project conversation panel](https://github.com/block/buzz/blob/448407a972ca9da0c1e13d49ee2c2170821be8a2/desktop/src/features/projects/ui/ProjectConversationPanel.tsx) | Stable conversation/root identity, separate loading/error/retry states and explicit write capability | Apply those criteria to project switching and reconnect. Do not import Buzz's social/network infrastructure merely to imitate its chat layout. |

The native Codex inspection restriction is a concrete research limitation. Owner-provided screenshots plus the public harness and official product documentation guide interaction requirements, not a claim that Vanta is a Codex clone.

## Workflow contract

| Moment | What the person sees and does | System obligation | Observable acceptance |
| --- | --- | --- | --- |
| Invoke | Open Vanta, choose Mini Vanta, or optionally show its small avatar | Same running application and conversation; no automatic screen/audio capture | Move mini → full while streaming; draft, approval, Stop, and session remain intact |
| Begin | Ask naturally; optionally attach a file, select a model, or add project context | No compulsory agent/host/branch form; default scope remains explicit | Ordinary chat and an optional project task both work without an unintended request |
| Connect | Find apps and models in one Connections destination | Distinguish configured, authenticated, reachable, and action-ready | Failed or expired connection gives one concrete repair action, not false Ready |
| Work | See a concise activity line, expandable evidence, and queued instructions | Preserve live progress, queue, cancellation, and ownership across presentation changes | Stop actually stops the current turn; queued messages remain editable and deliver once |
| Decide | A specific approval appears with scope, effect, and duration | Remember routine rules only when storage succeeds; fresh-only actions still ask | Same permitted routine action works in a later chat; denied/fresh-only action does not inherit it |
| Inspect | Open output beside its conversation; find it again later | Keep provenance, source links, paths, and verification level visible | Actual document opens; unsupported formats and readback limits are stated |
| Leave/resume | Hide the workspace; return through menu bar/avatar/history | Hiding is not cancellation; quitting is explicit; no second conversation controller | Same unfinished work and draft survive hide/show and an appropriate restart |
| Background | See schedules, waiting decisions, blocked work, and finished results | Quiet unless something is actionable; no fake success inferred from process liveness | A real scheduled execution and its result/decision return to the originating work |

## Dependency-ordered execution

**Now — coherent local workspace.** Integrate and validate chat continuity, white/grey appearance, current model discovery, routine permission persistence, truthful failure states, and safe local app replacement. Replace native Quick Ask with compact/full views of the same window. Add an optional, non-surveilling avatar that only opens this workspace and shows a small factual state. Close the demonstrated companion authentication gap before relying on that route.

**Next — whole-flow coherence.** Simplify Connections, Today, Schedules, Outputs, and Settings around the contract above; retire duplicated presentation paths only after retained capabilities have replacement proofs. Tie background work and decisions back to their conversation. Prove a normal-profile research → document workflow and a bounded native-app action, including denial and interruption. A new sidebar label or screenshot is not enough.

**Later — expanded ambient capability.** Explicit opt-in context capture, robust real-profile browsing, safe scheduled computer actions, richer result previews/editing, notification controls, and optional avatar personalization. Each depends on demonstrated permissions, cancellation, and trustworthy outcome reporting. No continuous capture, autonomous posting, credential migration, or extra permissions are implied by the redesign.

Reserve capacity for regressions before expanding the next surface. Review after every installed end-to-end slice. Keep canonical roadmap statuses unchanged until their own acceptance criteria are executed. No blanket clearing of cards or PRs.

## Done and re-entry

The whole redesign is done only when the normal installed app executes the complete workflow above, retains existing capabilities, passes keyboard/accessibility and failure-path checks, and the canonical roadmap and GitHub documentation match that evidence. Automated fixture checks, source tests, and signed packages are separate evidence layers; they do not substitute for live provider/account or human usability evidence.

Current re-entry: the application source checkpoint is published at `c272e25d`
in draft PR #59; its changed-source size gate is clear. The normal installed
app has now executed real-provider research to a cited file and read it back.
That run exposed an inert document link. See the
[document-link repair and live evidence](desktop-document-link-repair-2026-10-02.md).
After unlocking, use the guarded update and click the existing result in the
normal app; preserve the owner's unsent draft and never submit it as a probe.
Then continue Connections/background/results coherence and bounded native
observe/action/readback. The whole workflow remains in progress.

## Executed October 2 checkpoint

The section below records the earlier documentation-only checkpoint. The
[application source checkpoint](development-checkpoint-2026-10-02.md) supersedes
its uncommitted-source and size-gate status, without upgrading its historical
package or native-interaction evidence.

**Historical publication boundary:** the documentation/roadmap checkpoint did not contain
the locally installed application implementation. Those application changes are
preserved, uncommitted in the execution worktree while their integration size gate
is unresolved. A checkout of this documentation commit cannot reproduce the
installed package below. Package hashes and local evidence are not Git-head claims.

The exact installed ASAR is
`b77ef4a81bfc92711654b2a40eb733d2897f6d64480ff201d09cfde99e55821a`,
installed at `2026-10-02T16:24:30.430Z`. A rollback package and machine-readable
receipt are retained in the local Vanta Local Updates application-support folder.
No operator state, credentials, CLI installation or existing checkout was replaced.

| Gate | Command or path | Exit and observed result | Boundary |
| --- | --- | --- | --- |
| Canonical TypeScript suite | `npm test -- --reporter=dot` in `vanta-ts/` | 0; 1,588 files, 14,445 passed, 3 skipped | Source/runtime regression proof, not a live-account result |
| Verified local replacement | `npm run desktop:rebuild` | 0; both typechecks, 7 installer tests, production package, Developer ID signature/deep verification, 51 packaged checks, exact-hash installation | Local package only; no notarization, release or deployment |
| Mini/full/avatar interaction | Packaged `desktop-chat-first-proof.mjs` inside the updater | 0; same session/draft/Stop during streaming; compact permission control visible; no shortcut collision; avatar has only bounded bridge; zero renderer errors | Fixture provider and disposable state; simulated project-folder selection and monitor bounds |
| Companion trust boundary | Focused companion, client and trusted-origin tests; subsequent full suite | 43 focused tests passed after red regression | Disabled companion no longer trusts arbitrary loopback; not a physical paired-device run |
| Native context attachments | Installed `desktop:context:smoke` on preceding `bc2ee772…` package | 0; 13 conditions including native picker, file/folder drag, safe-file filtering and structured submission | Earlier package; source harness attempts initially failed at composer readiness and remain recorded |
| Normal profile | Native app controls on preceding `bc2ee772…` package | Light appearance, Astra/6.1 catalog, unsent draft, mini/full/avatar re-entry observed | Latest `b77ef4a8…` native attempt reported Mac locked; don't promote earlier evidence to exact-latest proof |
| Live research | Installed CLI with real Codex and two MDN pages | Actual 1,423-byte, 162-word cited file read back | Not normal Desktop or native-app control; earlier failed source fetch remains failure evidence |
| Secret scan | `bash scripts/secret-scan` at repository root | 0; 2,180 commits plus tracked/non-ignored snapshot; zero findings at the retained application checkpoint | A fresh publication scan is recorded separately; never infer that ignored operator state was audited |
| Static security | Semgrep `p/security-audit` over nine changed native/server/client/updater sources | 0; 22 executed rules, zero findings | 225 rules loaded, not all executed; not a dependency audit |
| Integration size baseline | Explicit analyzer over 80 changed production sources | Not green: 45 current violations versus 54 baseline; eight new/expanded findings | Blocks application publication; do not call aggregate integration locally green |
| Canonical planning | Build-order, current projection and website generators; projection/build-order tests | 0; 7 tests; 1,362 records, 1,288 shipped, 1 Building, 4 Next, 7 Horizon, 62 Parked | No shipped status added by this work; website deployment and Git publication are separate |

Fresh source reviews are documented above. The whole redesigned product is **in
progress**. The coherent Connections/Today/Schedules/Outputs/Settings journey,
background-result ownership, project/browser parity, normal Desktop live work,
native assistive proof, size/security integration and deferred unfamiliar-person
acceptance are not complete. No GitHub PR is closed merely to make the list empty.

### Documentation publication gate

After importing the retained canonical roadmap and adding its schema test, the
full suite passed again: 1,588 files; **14,446 passed, 3 skipped**, exit 0. Both
typechecks, all five architectural boundaries, 173 focused roadmap tests and
seven generator tests passed. The three changed projection modules have no size
violations after extracting dependency validation from the graph walk. This does
not clear the separate application-source size debt. Schema/graph/semantic
round-trip and generated build-order comparisons passed; all 1,341 prior IDs
and all 1,288 shipped statuses are retained. The baseline comparison initially
hit a diagnostic subprocess output-buffer limit; rerunning with an explicit
bounded 8 MiB buffer passed without changing roadmap data.

The publication secret scan covered 2,180 history commits and the current
tracked/non-ignored snapshot (zero findings). The staged documentation diff was
also scanned with redaction and had zero findings. No protected Rust, factory,
MANIFESTO, operator state, upstream checkout/source or quarantine path is staged.
GitHub Actions was refreshed and remains disabled. Publishing this scoped
documentation checkpoint neither publishes the pending application implementation
nor merges or closes another PR.
