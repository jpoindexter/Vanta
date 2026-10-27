# Agent cancellation and MCP entry — 2026-10-27

## Priority and boundary

Owner priority: useful agent work and access from Codex/other clients through MCP
matter alongside Desktop usability, ahead of further cosmetic polishing. Keep
the existing agent and stores; do not replace the engine with another shell or
interpret a client connection as new authority. No new active card is created.

## Cancellation: source repair, not installed

Actual `runTurn` previously returned `done` when a streaming provider yielded its
final result and then Stop arrived before EOF, or when a non-stream provider
resolved after Stop. The real Desktop receipt mapper therefore returned `done`.
An already-aborted returned tool also entered the tool iteration/journal path.

The loop now accounts for a successful provider response, then checks the live
signal before text handling or tool dispatch. Returned usage is preserved rather
than silently losing potentially charged tokens. Ordinary completion stays done;
the existing streaming AbortError behavior is unchanged. No policy or tool grant
changes, no retry and no provider-specific branch.

Parent regression on canonical source: three failures before, then **30 passing
checks across five focused files**, full runtime typecheck, strict changed-source
size and whitespace checks. Tests execute real `runTurn` and the real receipt
mapper with controlled providers. They cover both late-abort races, retained
usage, zero tool iterations/execution after cancellation, existing AbortError and
uncancelled success. Each test owns its temporary root and cleans only that root.
The initial returned-tool red fixture failed on a nonexistent absolute path;
the corrected private-root fixture reproduces the actual unwanted tool iteration.

Parent backup: `agent-cancel-parent-20261027-1FAWaP`. Frozen independent V2:
`agent-cancel-settlement-v2-20261027-Dwjydt`. V1 is retained; review found that its
early guard would lose returned usage, so it was not adopted.

Not proven: installed/native Stop, later MessageDisplay-hook cancellation,
complete workflow cancellation, remote accounts, every effect disposition or
whole interruption continuity. Existing queued-turn draining already checks the
controller; this is not a claim that a new queue-continuation bug was fixed.

## MCP: real entry verified, not whole agent delegation

The existing `vanta mcp serve` exposes bounded tools, not a full conversation/run
controller. Its default ten-tool exposure is read-oriented. Calls use the real
effect gateway and kernel. A headless server cannot turn an Ask into approval.
The optional approval-resolve tool is not enabled by this work.

An actual stdio client completed initialize, tools/list, read_file,
resources/list and approval-resource read against the current compiled CLI and
real Rust kernel. Default exposure refuses write_file. A separate explicit
read/write exposure still refuses an existing-file overwrite in headless mode;
the exact original bytes remain. JSON-RPC stdout stays clean and the refusal
retains `isError: true` on the wire. Ten checks pass per pairing.

The same ten checks pass using the actual installed app executable, installed
runtime and bundled kernel, all with a fresh private HOME/project/profile/port.
No installed files or owner data were changed. Those processes were stopped
deliberately after proof; successful shutdown is not described as natural exit.

The first mixed-environment probe used the signed app executable with the
source checkout's native dependencies and failed startup with a native-binding
error. The supported pairings above passed; no signature/library bypass or
dependency reinstall was used. The first driver also mishandled an already-exited
child; its failure is retained and the driver now records stdout/stderr promptly.
Packet: `mcp-agent-entry-20261027-yNfhqN`.

This is not a Codex/Claude GUI connection: no global client configuration was
changed. It proves the stdio entry and bounded tool behavior only. MCP server
cancellation notifications currently do not reach per-call controllers. The
agent cancellation repair above uses a different execution path and does not
close that gap. The client also currently flattens explicit MCP tool errors into
text; independent reproduction found a false-success journal outcome. That
separate repair remains in review, not declared fixed here.

## Next

Later [MCP tool-error source repair](mcp-tool-error-truth-2026-10-27.md) corrects
the false-confirmed boundary while retaining uncertain partial effects. The
owner's latest priority makes Desktop maintenance-only and agent execution/MCP
primary. Whole delegation, continuity and unknown-effect queue handling remain
open; this is not installed delivery or client GUI configuration.

Integrate the reviewed MCP error propagation without treating an error as proof
that an external effect did nothing. Then verify a useful agent workflow and
client lifecycle/cancellation before expanding exposure. Rebuild/install a
combined candidate with rollback; preserve visual/parity/human gates. Do not
close whole trust or Desktop cards on these bounded results.
