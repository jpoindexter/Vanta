# MCP tool-error truth — source checkpoint, 2026-10-27

## Owner priority

The owner considers the current Desktop a useful working base. Stop further
shell comparisons, visual expansion and polish for now. App work is maintenance,
agent-blocking reliability and delivery of agent updates only. Focus on useful
agent execution, external-client access, continuity and trustworthy outcomes.
This is not authorization to retire legacy capabilities or waive parity/human
acceptance; those deferred gates remain open.

## Repair and scope

The MCP client previously flattened a server's `isError:true` tool result into
ordinary text. The real mapped tool and effect journal then recorded a confirmed
success. A partial external mutation followed by an error could be misreported.

Two small production changes repair that boundary:

- `McpClient.callTool` rejects explicit tool errors with a typed error, retaining
  the complete existing text diagnostic or a nonempty fallback. Successful string
  results and JSON-RPC/transport errors keep their contracts.
- The mapper lets that error follow the existing uncertain-effect path and adds
  the diagnostic to its result. The journal and action receipt are `unknown`,
  verification is `unverified`, the work item needs human readback, and the tool
  returns `ok:false`. No success acknowledgement or automatic retry is created.

An error does not prove that nothing happened. The rejected V1 proposal recorded
an inner `failed/none` despite an outer unknown; a simulated partial write exposed
that contradiction. V1 remains retained, not integrated. No effect/kernel API,
approval policy, protocol version, lifecycle or historical receipt migration was
changed. New tests also replace the existing shared `/tmp` server fixture with
per-test owned temporary roots; prior shared temporary records were not deleted.

## Executed proof

Parent packet: `mcp-error-parent-20261027-IbDT65`. Independent V2:
`mcp-tool-error-v2-20261027-996TGW`.

- Canonical regression: three failures before; **79 focused tests in seven files
  pass** after. Runtime typecheck, strict production/new-test size and whitespace
  pass. The existing server-test describe wrapper remains oversized, unchanged.
- Independent installed Node-mode client→mapper→real journal proof: one fixture
  mutation then tool error leaves unknown receipt/effect and needs-human work.
  Same-operation replay sends no second call or mutation. Generic RPC uncertainty,
  successful outputs, block and denied-Ask behavior remain.
- Parent actual `runTurn`→real child stdio connector→real mapper/persistence proof:
  one partial fixture write, one failed tool observation containing the diagnostic,
  no retry, unknown/unverified receipt and no confirmed receipt. The controlled
  provider runs twice; final completion state is unverified. Safety is an injected
  allow-only fixture, not live Rust or an external account.

At that checkpoint, the loop's `stoppedReason` was still `done`: the loop ended, but
the action was not verified. A separate controller investigation found that this
distinction needs consistent receipt/queue handling; it is not closed by the MCP
client repair. Do not broadly convert all unverified answers into failures:
ordinary chat and successful reads can also carry an unverified completion state.
Current-instruction unknown effects need turn-owned evidence, safe recovery and
no automatic queued continuation or blind replay. The subsequent bounded
[agent/controller correction](agent-uncertain-effect-settlement-2026-10-27.md)
now executes that halt and recovery path in source; its explicit limits remain.

## Useful agent path, separately verified

Existing `vanta acp serve` passed an actual external-client→CLI→Rust→read_file→
write_file flow in a private named profile, creating an exact 278-byte draft.
Eleven flow checks plus seven gate/receipt/usage/cleanup checks pass. A second
provider-wait turn cancels, its socket closes, the draft stays unchanged, stdout
is JSON-RPC only and stdin EOF yields natural exit 0. Packet:
`acp-agent-flow-20261027-YMVvfe`.

The model is a deterministic loopback fixture, not live research or evidence of
model intelligence. No permission request was needed for the new in-project file,
so approval round-trip is unproven. Synthetic usage is correctly recorded locally;
cancellation telemetry remains generically classified, ACP omits usage updates,
and its runner still creates a fresh conversation per prompt. Multi-turn resume,
real model/mode switching and arbitrary session CWD behavior are not established.

## Terminal connection lifecycle — subsequent source checkpoint

Clean child exit (0), signal termination and explicit client close previously
left pending requests unsettled. The shared client now rejects pending and later
requests after terminal closure. Closing twice sends no new request and closes
the transport once. Stdio waits for stream closure, retaining a complete final
response; temporary HTTP failures remain recoverable on the same client.

Parent packet: `mcp-lifecycle-parent-20261027-79DISQ`; independent candidate:
`mcp-lifecycle-20261027-kuXfrJ`. The parent reproduced the three hangs against
canonical source, then reran the same actual child/client path using the installed
Electron executable in Node mode. All three now reject, including later calls.
The parent also ran 109 focused tests in nine files and runtime typecheck; all
passed. This is current source executed by that runtime, not a newly installed
bundle or an external connector. No remote cancellation or rollback is implied.
A live nonresponding server, or a descendant holding inherited streams open,
still requires explicit close or a caller-owned timeout. HTTP close does not
newly abort an already-issued request.

## Actual launcher delivery gap

Read-only audit packet: `agent-launcher-audit-20261027-FfBIFd`. At source
`b82c5340`, normal `vanta` still selected the detached October 3 checkout at
`d2be37c3`, 399 ancestry commits behind, with eight modified tracked and five
untracked files. That work must survive. `vanta-next` separately opens home1;
the Desktop installer explicitly leaves normal `vanta` unchanged. Neither entry
automatically adopts current agent source.

Stage and prove a separate pinned runtime with the actual CLI Node before any
owner-approved launcher selection. Existing `VANTA_REPO` registration persists
the remembered path; it is not a read-only one-shot. Keep the old checkout,
launcher and pointer for rollback, and verify profile/configuration continuity
separately. Do not blindly run the existing updater: its detached-HEAD targeting,
partial autostash, misleading failure exit and hard-reset rollback are unsuitable
for preserving this installed work. No owner launcher or runtime state changed.

## Still not delivered or complete

No new package/install, live provider/account, Codex GUI registration, full MCP
agent controller or MCP cancellation proof. Terminal-client settlement is proven
only in the bounded source paths above. No global Codex config was changed.
Queued-edit candidate remains frozen; Desktop polish is not resumed. Whole
agent/trust/Desktop cards remain open; no main merge, release/tag or paid service.
