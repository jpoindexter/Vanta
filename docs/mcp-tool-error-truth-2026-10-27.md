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

The loop's `stoppedReason` is still `done` in that last case: the loop ended, but
the action was not verified. A separate controller investigation found that this
distinction needs consistent receipt/queue handling; it is not closed by the MCP
client repair. Do not broadly convert all unverified answers into failures:
ordinary chat and successful reads can also carry an unverified completion state.
Current-instruction unknown effects need turn-owned evidence, safe recovery and
no automatic queued continuation or blind replay. That follow-up remains open.

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

## Still not delivered or complete

No new package/install, live provider/account, Codex GUI registration, full MCP
agent controller or MCP cancellation proof. A clean stdio child exit can still
leave pending client requests unsettled. No global Codex config was changed.
Queued-edit candidate remains frozen; Desktop polish is not resumed. Whole
agent/trust/Desktop cards remain open; no main merge, release/tag or paid service.
