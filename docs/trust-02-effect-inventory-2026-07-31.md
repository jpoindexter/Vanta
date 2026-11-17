# TRUST-02 Effect Inventory

Date: 2026-07-31
Scope: unprotected TypeScript paths on `codex/trust-02-effect-mediation-20260731`
Roadmap state: `TRUST-02` remains `building`. This inventory is evidence, not a promotion receipt.

## Classification contract

- **Mediated**: the effect reaches `executeEffect`, which durably records `pending`, assesses the exact safe action with the kernel, obtains host approval for `ask`, atomically records `started`, executes once, and settles with minimal metadata.
- **Blocked pending authority**: the operation remains visible but cannot execute until its missing or stale authority is repaired.
- **Trusted infrastructure exemption**: an operator-owned or non-consequential infrastructure path remains outside `executeEffect`; the rationale and test boundary are explicit.
- **Protected / out of scope**: changing the path requires separate authority and is not part of this branch.

## Shared boundary

| Effect path | Classification | Boundary and evidence |
| --- | --- | --- |
| Host effects | Mediated | `vanta-ts/src/effects/execute-effect.ts`; stable intent ID, actor/host/kind, safe action, target class, payload SHA-256, and idempotency key. Model-requested effects include the provider tool-call ID so a replay is deduplicated without blocking a later intentional call with identical bytes. |
| Durable journal and projections | Mediated | `vanta-ts/src/agent/effect-persistence.ts`; filesystem writer exclusion, atomic journal envelope, and metadata-only projections. |
| Kernel unavailable | Blocked pending authority | `executeEffect` settles `blocked` before calling the operation. |
| Journal unavailable | Blocked pending authority | Pending persistence is the first executable gate; its failure prevents the operation. |
| Crash after provider acknowledgement | Blocked pending authority | A claimed `pending` or `started` effect durably settles as `unknown` / `needs human` on replay; the operation is not repeated and the WorkItem requires human readback. |
| Provider rejection | Mediated | A definitive failure settles `failed`; an exception after a possible effect settles `unknown`. |

## Gateway and external delivery

| Effect path | Classification | Boundary and evidence |
| --- | --- | --- |
| Final replies | Mediated | `gateway.final` through `sendGatewayMessage`; settlement asserted in `gateway/stream-run.test.ts`. |
| Progress messages | Mediated | `gateway.progress`; settlement asserted in `gateway/run.test.ts`. |
| Context-reference receipts | Mediated | `gateway.context`; settlement asserted in `gateway/context-refs.integration.test.ts`. |
| Mobile control replies | Mediated | `gateway.mobile-control`; each reply has one settled envelope in `gateway/run.test.ts`. |
| Pairing replies | Mediated | `gateway.pairing` in `gateway/child-ops.ts`. |
| Native file delivery | Mediated | `gateway.native-file`; file bytes are hashed and settlement is asserted in `gateway/stream-run.test.ts`. |
| Authenticated webhook delivery | Mediated | `gateway.webhook` in `gateway/child-ops.ts`. |
| Workflow webhook delivery | Mediated | `webhook-workflow.delivery` in `webhook-workflows/runtime.ts`. |
| Typing indicators | Trusted infrastructure exemption | Ephemeral presence only: no message body, durable mutation, file, launch, or external account action. Existing typing-heartbeat tests prove start/stop behavior. |
| Channel polling and inbound webhooks | Trusted infrastructure exemption | Receive-only transport. Authentication, allowlisting, deduplication, and channel proof tests remain the governing boundary. |

## Scheduler and child processes

| Effect path | Classification | Boundary and evidence |
| --- | --- | --- |
| Authorized scheduled script | Mediated | `scheduler.script.execute`; exact script SHA-256, authority ID, and fire-window idempotency key. |
| Legacy script without authority | Blocked pending authority | Visible in `cron.tsv`; runner returns `needs human` and never calls the script runner. |
| Changed script bytes | Blocked pending authority | Stored `scriptSha256` mismatch invalidates authority and prevents spawn. |
| Manual schedule creation | Mediated | CLI records explicit `operator-cli:*` authority over the exact script bytes. |
| `vanta schedule authorize <id>` | Mediated | Explicit operator command binds the current bytes; mutation tests cover changed and legacy entries. |
| Gateway loop child | Mediated | `gateway.loop.launch`; safe child environment and durable launch claim. |
| Gateway factory child | Mediated | `gateway.factory.launch`; protected factory source is not edited. |
| Model-created loop child | Mediated | `loop.child.launch` in `tools/loop.ts`. |
| Background shell child | Mediated | `shell.background.launch`; sandbox preparation occurs before the effect, while metadata creation and spawn occur inside it. |
| External coding-agent CLI | Mediated | `agent.child.launch`; model-controlled call/build paths use the shared gate and a credential-minimized child environment. |
| In-process subagents | Trusted infrastructure exemption | No operating-system child is launched. Tool execution remains under the existing dispatcher/kernel and effect journal. |

## Plugins and MCP

| Effect path | Classification | Boundary and evidence |
| --- | --- | --- |
| Plugin worker launch | Mediated | `plugin.worker.launch`; Node permission model, contained entry, capability grants, and safe child environment. |
| Plugin mutating host services | Mediated | Log write, storage write, schedule registration, and panel registration use request-scoped idempotency. Storage read remains read-only. |
| Automatic MCP mount | Mediated | `mcp.server.launch`; transport creation, initialization, and discovery occur inside the boundary. |
| Model-selected `mount_mcp` | Mediated | `mcp.server.launch` in `tools/mount-mcp.ts`; safe environment and exact launch hash. |
| MCP OAuth reconnect from `mcp_auth` | Mediated | `mcp.server.connect`; authorized-token state changes the launch identity without persisting the token. |
| MCP tool calls | Mediated | `mcp.tool.call`; arguments are hashed, provider acknowledgement is retained, and exceptions remain `unknown`. |
| Chicago computer-use MCP launch | Mediated | `mcp.server.launch` in `mcp/chicago-connect.ts`; raw calls remain inside the already kernel-gated `vision_action` tool. |
| Desktop and CLI connector test/reconnect panels | Trusted infrastructure exemption | Explicit operator-owned management actions, connector trust state, safe MCP child environment, and connector receipts. They are not reachable as autonomous model calls. |
| Configured `mcp_tool` hooks | Trusted infrastructure exemption | Operator-authored hook configuration; existing hook trust/sandbox policy and safe child environment apply. No autonomous config creation is added here. |
| MCP skill discovery | Trusted infrastructure exemption | Read-only skill catalog discovery; no MCP operation is invoked on behalf of a model. |

## Self-repair

| Effect path | Classification | Boundary and evidence |
| --- | --- | --- |
| Mark last-known-good | Mediated | `self-repair.mark`; exact compartment and commit SHA. |
| Narrow rollback | Mediated | `self-repair.rollback`; exact SHA and owned path set, kernel assessment, and fresh host approval on `ask`. |
| Limb sandbox test | Mediated | `self-repair.sandbox-test`; bounded command hash and existing OS sandbox. |
| Brainstem and skeleton rollback | Protected / out of scope | Existing hard denial remains before approval or effect execution. |
| Unscoped limbs rollback | Blocked pending authority | Existing refusal remains because no narrow owned path set exists. |

## Child environment audit

`buildSafeChildEnv` is used by scheduled scripts, gateway loop/factory children, plugin workers, MCP stdio servers, external coding-agent CLIs, shell/background execution, and loop wake children in this scope. Synthetic enumeration tests assert that provider keys, Google/Gmail credentials, authorization headers, and gateway tokens are absent.

## Protected and excluded paths

| Path | Classification | Result |
| --- | --- | --- |
| Root `src/**` Rust kernel | Protected / out of scope | Unchanged. |
| `vanta-ts/src/factory/**` | Protected / out of scope | Unchanged. Gateway may launch the existing factory command but does not edit its source. |
| `MANIFESTO.md` | Protected / out of scope | Unchanged. |
| Live provider/account verification | Protected / out of scope | No live credentials or external-account effects are used. |
| Release, publication, deployment, notarization, or merge | Protected / out of scope | Not performed by this branch or its CI. |

## Acceptance evidence

Local verification runs:

- kernel unreachable, denial, allow-once, definitive failure, journal failure, and crash/replay cases;
- gateway final, file, mobile, progress, and context settlements;
- scheduler missing/stale authority refusal and exact authorization;
- plugin and MCP launch/operation tests;
- child-environment credential enumeration;
- cross-process filesystem writer-lock tests;
- protected-path and secret scans.

Repository-level GitHub Actions are disabled. No hosted workflow is required for this
evidence and no workflow was dispatched.

### 2026-08-01 local closure addendum

- The desktop visual proof passed all 36 current shell captures at the unchanged
  `1.100%` mismatch limit after the intentionally replaced shell baselines were
  regenerated and visually sampled.
- The production dependency audit excluding optional dependencies reports zero
  vulnerabilities. The full production lock graph still reports five high-severity
  findings in `winnow`'s unused optional local-ML chain, for which no upstream fix is
  available.
- The packaged desktop dependency proof builds the app and inspects both `app.asar`
  and `app.asar.unpacked`; the unused `@huggingface`, `@img`, `adm-zip`,
  `global-agent`, `onnxruntime-*`, and `sharp` packages are absent.
- The website production audit reports zero vulnerabilities.
- The package proof produced and locally signed a macOS app using the existing local
  identity. It did not notarize, upload, publish, deploy, or release that app.

These checks prove the bounded paths above and the packaged dependency boundary.
They do not prove live account delivery, every packaged TRUST-02 behavior, protected
Rust/factory changes, notarization, or that `TRUST-02` is shipped. The roadmap card
therefore remains `building`.
