# Vanta Agent Master Class

## Purpose and source scope

This is a Vanta-specific operating class distilled from the supplied Hermes Agent
Master Class: `intro.pdf` and Parts 1–12. It deliberately excludes
`2607.14275v1.pdf` at the request of the project owner.

The aim is not to reproduce Hermes. It is to use the useful architectural ideas
to make Vanta a reliable, inspectable desktop workbench. Every proposed capability
is separated from what this snapshot actually evidences.

## The central lesson

An agent is not a chat box with extra buttons. A useful agent runs a controlled
loop:

1. Assemble bounded, relevant context.
2. Select only available capabilities.
3. Act through tools with explicit approvals.
4. Preserve the observable result and recover safely from failure.
5. Verify the outcome at the same level the user experiences it.

Vanta should build this loop from the inside out: provider and session reliability
first; tool and approval truth second; durable learning, automation, and
orchestration only when their foundations have real tests.

## What this Vanta snapshot supports today

| Capability | Evidence in this snapshot | Confidence | Product use now |
| --- | --- | --- | --- |
| Provider routing and per-provider model defaults | `src/providers/index.ts` resolves built-in, OpenAI-compatible, user-declared, local, subscription, and custom routes. | Code-path | Use model/provider selection as the first controlled Vanta experience. |
| Model context-window awareness | `src/providers/openai.ts` maps known context limits and supports an explicit override. | Code-path | Surface context as a guardrail, not a decorative meter. |
| Desktop sessions and lifecycle actions | The React client calls create, open, rename, archive, and delete session endpoints. | Code-path | Teach users to treat a Vanta task as a recoverable session. |
| Per-session/global model choice | `state.ts` and the model picker support both scopes. | Code-path | Make the active model and its scope visible before costly work starts. |
| Streaming activity, stop, retry guidance | The desktop client consumes event streams, exposes Stop, and preserves a retry path. | Code-path | Keep execution observable and interruptible. |
| Permission/approval interface | Typed approval requests and four decisions are rendered and exercised by `overlays.test.tsx`. | Code-path | Keep a kernel approval boundary for consequential actions. |
| Files, artifacts, Canvas, capabilities, and messaging setup surfaces | The desktop client loads dedicated API resources for each. | Code-path | Use as inspectable context/output surfaces; validate the backend before promising them. |
| Native computer use and mobile companion bridge | Described in `desktop-and-tui.md`; implementation is outside this snapshot. | Documented, not executed | Treat as a candidate integration, not a release claim. |

`Code-path` means the code is present but the user-facing flow has not been run
from this snapshot. It does not prove the corresponding endpoint, backend, or
packaged desktop app works.

## What is not evidenced here

Do not claim these as Vanta capabilities yet:

- A durable core agent loop with tool-call iteration, tool availability checks, and
  normalized tool results.
- Persistent curated memory, memory review, or memory write approval.
- A Vanta-owned skill registry with progressive disclosure.
- A scheduler, no-agent watchdogs, scheduled delivery, or job chaining.
- Subagent delegation, budgets, cancellation, or async result collection.
- A durable task board that coordinates agents through claimable work.
- Profile isolation, multi-profile control, or cross-surface session portability.
- A verified browser automation or native computer-use backend.
- A proven messaging gateway or channel authorization/circuit breakers.

The desktop client has affordances or documentation for some adjacent concepts.
That is not proof of their runtime implementation.

## The class

### Module 1 — The observable Vanta turn

**Principle:** chat is the input; an observable, interruptible work loop is the
product.

For every meaningful turn, Vanta should make four things answerable: what context
was used, which model/provider was selected, what actions occurred, and what the
last safe outcome was. The existing event rail, status data, model picker, and
approval overlay are the correct starting points.

**Practice:** model a complete turn as `assemble → select → act → report →
persist`. Make cancellation a normal outcome with an explicit partial-result
receipt, not a crash.

**Do not add yet:** autonomous retries or long-running agents before the basic
turn can be observed end to end.

### Module 2 — Context is a budgeted product surface

**Principle:** stable instructions, project files, selected capabilities, and
conversation history compete for one context window.

Vanta already exposes a context window abstraction. Turn that into a disciplined
policy: preserve a stable system prefix, show why files were attached, record the
model’s actual limit, and treat compaction as a user-visible lineage event. A
summary must never silently impersonate original evidence.

**Practice:** define a context receipt containing model, configured window,
attached files, system instructions version, compaction status, and exclusions.

**Do not add yet:** auto-learning or automatic prompt mutation during an active
task. Stable context is easier to cache, reason about, reproduce, and test.

### Module 3 — Tools are promises, not labels

**Principle:** a model answer proves only that a model answered. It does not prove
that the agent can act.

Vanta’s first agent test must exercise an action requiring the real tool surface
and show the result in the UI. A good first capability contract contains a small,
typed port, a resolver, an availability check, a schema exposed only when usable,
an approval policy, structured results, and a failure mode that users can recover
from.

**Practice:** start with three bounded capabilities: a read-only workspace
inspection, one safe file operation, and one read-only network or browser action.
Each needs a user-visible receipt and an expected failure test.

**Architecture:** use a port + adapter boundary for every capability family with
multiple implementations. Consumers depend on the port; provider/transport/SDK
details stay in adapters; the resolver selects a typed null/error adapter when a
dependency is unavailable.

### Module 4 — Approvals and receipts are the trust layer

**Principle:** capability without a clear boundary becomes a liability. The
existing typed approval request is a strong base: subject, reason, structured
sections, and an explicit decision.

Build on it by storing an immutable receipt for every attempted action:

- request, capability, and normalized arguments;
- policy decision and actor;
- execution start/end, result, and error class;
- produced or changed artifacts; and
- links back to the owning session and goal.

**Practice:** an approval UI test is not enough. Run a real action that requires
approval, deny it, allow it, and assert the resulting state and receipt.

### Module 5 — Sessions before memory

**Principle:** durable sessions are a prerequisite for any learning claim.

The desktop client presents session lifecycle controls, but persistence needs an
end-to-end test before Vanta layers policy or memory over it. First prove that a
task survives app restart and can be reopened with its messages, selected model,
receipts, and referenced artifacts intact.

Only then introduce a deliberately small fact store. Facts should be explicit,
scoped, editable, attributable, and budgeted. Procedures belong in reviewed skill
documents, not in an unbounded memory dump.

**Practice:** keep memory writes opt-in until provenance, approval, rollback, and
scope are all testable.

### Module 6 — Skills are reviewed operating procedures

**Principle:** a skill should say when it applies, the concrete procedure, known
pitfalls, and the verification command or observable result.

Vanta can use this idea now as a content contract for its existing skill system.
It should not imply a new Vanta runtime until the skill discovery and loading
behavior is implemented and tested. Progressive disclosure is the correct target:
load a short index first; load a full procedure and supporting files only when the
request matches it.

**Practice:** begin with one reviewed Vanta skill: `desktop-smoke-test`. It must
define preconditions, exact automated and manual checks, expected screenshots or
receipts, and recovery steps.

### Module 7 — Automation is a later reliability project

**Principle:** scheduled work needs fresh, self-contained context, idempotence,
exclusive execution, durable output, explicit delivery, and an error channel.

That makes automation valuable, but it is not the first Vanta release slice.
After Vanta has a verified turn and session persistence, begin with one
read-only/no-agent watchdog. It should use deterministic code, produce output only
on change or failure, and never invoke a model just to check a condition.

**Do not add yet:** natural-language cron creation, job chains, or cross-channel
delivery. They multiply state and credential failure modes.

### Module 8 — Delegate only for independent reasoning work

**Principle:** subagents buy parallelism and context isolation only when their
goals are complete on their own.

Use a child for bounded comparative research, a code review, or a multi-file
analysis. Use a script for deterministic mechanics. A child should receive a
self-contained goal, limited tools, a budget, timeout/cancellation rules, and one
structured final result. It should not mutate shared memory or recursively spawn
work by default.

**Do not add yet:** autonomous multi-agent swarms or a board UI. They conceal
failures until the single-agent turn, capabilities, and receipts are trustworthy.

### Module 9 — Coordinate work only after direct chat stops being enough

**Principle:** use a durable task board for work that is long-running,
multi-stage, asynchronous, or owned by multiple agents. Otherwise, direct
sessions are lower-friction and easier to debug.

If Vanta needs this later, the minimal state machine is `todo → in_progress →
review → done | cancelled`, with atomic claiming, assigned owner, dependencies,
event notes, and an auditable transition log. The board is shared in-flight state;
it is neither long-term memory nor a chat transcript.

### Module 10 — Treat browser and computer control as high-risk integrations

**Principle:** prefer the least powerful surface that can complete the work.

Use an API or deterministic script first. Prefer browser automation for web-only
tasks. Use native computer control only for work with no safe web/API alternative.
Both require a recorded target, screenshot/accessibility evidence, approval for
consequential actions, prompt-injection handling for untrusted screen content, and
an after-action verification.

The snapshot documents this direction but does not contain the backend necessary
to claim it is live.

## The Vanta build order

1. **Prove the existing desktop workbench.** Run the real desktop smoke path,
   provider selection, session lifecycle, stream/stop/retry, and approval path.
2. **Build one tool vertical slice.** Typed port, resolver, availability gate,
   approval, receipt, success/failure integration tests, and a desktop test.
3. **Make sessions durable and inspectable.** Add restart/reopen tests before
   compaction or memory.
4. **Add one reviewed skill.** Prove discovery, loading, application, and the
   verification step through a real Vanta task.
5. **Add a deterministic watchdog.** Read-only, no model, idempotent, silent on
   healthy checks, loud on failure.
6. **Add delegation only after a single turn is trustworthy.** Start with one
   limited child and a structured receipt.

## What Vanta should intentionally skip for now

- A large dashboard or additional primary navigation destinations.
- “Agent memory” that changes prompts invisibly or cannot be rolled back.
- Automatic skill creation or curation before provenance and review exist.
- Multi-provider fallback used as a substitute for diagnosing failing tools.
- Broad messaging integrations before authorization and channel failure behavior
  are proven.
- Batch processing and multi-agent coordination before a single vertical slice is
  fully tested.
- Native UI control when an API, browser automation, or deterministic script is
  safer and cheaper.

## Definition of a working Vanta capability

A capability is working only when this whole path has been executed:

`user instruction → Vanta selects the available capability → any required
approval appears → capability acts → desktop shows the actual result/receipt →
success and failure state persist in the session`.

A unit test, static render, typecheck, or direct adapter call is useful evidence,
but it does not establish the complete user path.

## First assignment

Use [the first-run test matrix](vanta-first-run-test-matrix.md) to establish the
baseline. Do not start the memory, scheduler, delegation, or coordination modules
until the P0 desktop/session/provider/approval checks have evidence.
