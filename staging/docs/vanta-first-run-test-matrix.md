# Vanta First-Run Test Matrix

## Current execution status

This repository is a focused source snapshot. It has no `package.json`, lockfile,
or local dependency tree, and the desktop smoke script references an Electron entry
point that is not present here. Therefore the real Vanta desktop flow cannot be
executed from this checkout without fabricating setup. This is a test-environment
gap, not evidence that the app fails.

| Claim | Evidence status | What the evidence does not establish |
| --- | --- | --- |
| The desktop smoke test defines a useful behavior suite. | ✅ Executed inspection: `scripts/desktop-layout-smoke.mjs` contains healthy, recovery, files, and responsive model-picker checks. | It cannot launch without the missing app/dependencies. |
| Provider resolution exists in source. | ◐ Code-path: provider resolver and colocated tests are present. | It has not been compiled or exercised against configured providers. |
| The model picker has a rendering test. | ◐ Code-path: `overlays.test.tsx` asserts visible provider/model behavior. | It has not run in Vitest or in Electron. |
| Session, approvals, streaming, and stop are represented in the desktop client. | ◐ Code-path: client API calls and state transitions were inspected. | It does not prove server endpoints, persistence, or a user-visible round trip. |

No row above earns a “working” claim for the product. The next section turns the
available test intent into the first executable test run once the full checkout is
available.

## P0 — recover an executable test environment

### Preconditions

- Use a complete Vanta checkout, not this artifact-only snapshot.
- Confirm its pinned `package.json` and lockfile are present.
- Install dependencies using the project’s documented package manager.
- Use non-production credentials and a disposable test workspace.
- Do not add dependencies or generated files to this snapshot to force a run.

### Commands to run from `vanta-ts/`

```bash
npm run desktop:native
node scripts/desktop-layout-smoke.mjs
```

Run the narrow colocated tests that correspond to the behavior you changed, for
example the provider, model-switch, and overlay tests. Use the full checkout’s
test command and lockfile-defined runner rather than inventing a command here.

### P0 acceptance criteria

| ID | User path | Expected observable result |
| --- | --- | --- |
| P0-1 | Launch the native desktop app. | A new session screen loads; the titlebar/composer remain visible. |
| P0-2 | Open the model picker, choose a session model, then set a global default. | The visible current model changes for the session; the default state is clear and survives refresh. |
| P0-3 | Send a bounded prompt and press Stop while it is active. | The stop state is visible; no false success receipt is shown; partial result/retry guidance remains. |
| P0-4 | Trigger a policy-gated action; deny it, then repeat and allow it. | The request shows subject/reason/context; denial does not act; approval executes once and creates a receipt. |
| P0-5 | Create, rename, archive, reopen, and restart the app. | The session and its messages remain available after restart. |
| P0-6 | Attach a long-path file list at compact and desktop widths. | No horizontal overflow, clipped controls, or inaccessible file rows. |
| P0-7 | Force a core API failure. | The recovery state is visible, usable, and does not leave the shell overlapping its composer. |

P0 passes only when these flows are executed in the native desktop app. A green
static component test or smoke sub-check does not substitute for the end-to-end
paths.

## P1 — first real tool vertical slice

Start with a bounded, low-risk read-only capability such as workspace inspection.
Do not start with browser automation, native computer control, scheduling, or
delegation.

### Contract

| Boundary | Requirement |
| --- | --- |
| Port | A small typed interface accepts task-shaped input and returns a typed result/error. |
| Adapter | Concrete filesystem/transport logic stays behind the port. |
| Resolver | It chooses an enabled adapter or a typed unavailable adapter exactly once. |
| Availability | The model never receives the tool definition when the prerequisites are absent. |
| Approval | Read-only behavior is declared; an escalation to write/destructive behavior requests approval. |
| Receipt | Input summary, policy decision, timestamps, result/error, and session association are persisted. |

### Test cases

| ID | Test | Expected result |
| --- | --- | --- |
| P1-1 | Resolver unit test: configured dependency. | The expected adapter is selected. |
| P1-2 | Resolver unit test: missing dependency. | A typed unavailable result is returned; the agent loop does not throw. |
| P1-3 | Tool schema integration test: dependency missing. | The capability is absent from the model-visible schema. |
| P1-4 | Tool schema integration test: dependency present. | The schema is visible and uses the typed argument contract. |
| P1-5 | Desktop end-to-end: request the real read-only task. | Vanta invokes the capability and shows the actual output plus receipt. |
| P1-6 | Desktop end-to-end: expected tool failure. | Vanta displays a recoverable, specific failure and preserves the session. |
| P1-7 | Safety regression: request an escalated action. | Approval is required; deny leaves no changed artifact. |

## P2 — persistence before learning

Run these before introducing memory, skills with write access, or compaction.

| ID | User path | Expected result |
| --- | --- | --- |
| P2-1 | Start a task, take a model/tool action, quit during/after it, relaunch, reopen. | Messages, selected model, tool receipt, and artifact references are restored. |
| P2-2 | Simulate interrupted persistence. | The app recovers to a coherent last-known state; no phantom success is shown. |
| P2-3 | Resume an archived session. | Lifecycle state changes without losing its history. |
| P2-4 | Force context pressure and compaction. | The UI records the compaction event and retained/excluded context. |

## P3 — only after P0–P2 are executed

| Capability | First bounded experiment | Stop condition |
| --- | --- | --- |
| Skill loading | Load one reviewed test skill for the desktop smoke workflow. Start with the local `context-engineering-skills` pack, whose doctor is read-only by default. | The skill cannot prove its own verification step. |
| Durable facts | Save one explicit, scoped fact with approval and rollback. | Missing provenance, scope, or edit/revoke controls. |
| Watchdog | Run one no-agent read-only health check on a deterministic schedule. | It sends normal-state noise or invokes a model unnecessarily. |
| Delegation | Run two independent read-only research children with fixed budgets. | Child work can mutate shared state or lacks a collected receipt. |
| Browser/native control | Complete one test-site action with approval and after-action verification. | A safer API/script alternative exists or screenshot content can steer actions. |

## Test reporting template

Record each run in the implementation PR or the relevant staging document:

```text
Test ID:
Environment: full checkout revision, OS, provider/model, desktop build mode
Input / fixture:
Observed result:
Receipt / screenshot location:
Status: pass | fail | blocked
What this result does not establish:
Follow-up:
```

This avoids the common failure mode where a unit test, an adapter call, or a
successful model response is reported as proof that the Vanta user flow works.
