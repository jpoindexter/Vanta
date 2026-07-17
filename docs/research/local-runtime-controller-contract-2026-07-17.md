# Local runtime controller contract

**Roadmap:** `LOCAL-RUNTIME-CONTROLLER-CONTRACT`
**Implemented:** 2026-07-17

## Outcome

Vanta now owns a transport-neutral controller boundary for configured local and remote inference hosts. The adapter exposes three operations:

- `discover()` inspects every configured host without allowing one failed host to hide the others;
- `inspect(hostId)` returns one redacted current snapshot;
- `events(hostId, options)` yields a bounded lifecycle/resource stream with resumable cursors.

The contract lives in `vanta-ts/src/runtime-controller/`. Controller-specific HTTP, WebSocket, process, SSH, or vendor adapters implement the low-level `RuntimeControllerTransport`; desktop and CLI surfaces consume only Vanta's normalized contract.

## State model

The operator state distinguishes:

- offline
- authentication required
- idle
- starting
- running
- stopping
- failed
- degraded

Transport health and kernel policy readiness are separate fields. A reachable engine whose Vanta kernel policy is missing, unknown, or not ready is `degraded`, never trusted/running. An old observation is also degraded and marked `stale` while retaining bounded resource telemetry for diagnosis.

Snapshots expose only host ID, label, local/remote kind, lifecycle, engine/model identity, bounded memory/GPU utilization, queue depth, observation time, epoch, and sequence. Endpoints, credential references, credential values, stack traces, raw controller errors, and unknown payload fields are omitted.

## Event continuity

Each event stream is capped at 1,000 events and 10 reconnects, with lower defaults. It emits typed receipts for:

- current snapshots;
- missing sequence ranges;
- controller epoch/restart changes;
- stale observations;
- reconnect attempts.

Reconnect resumes from the last accepted epoch and sequence. Controller errors trigger a redacted reconnect receipt, never raw error text. Abort signals stop the stream at a safe boundary.

## Verification

Executed:

```bash
npx vitest run src/runtime-controller/adapter.test.ts --maxWorkers=1
npm run typecheck
```

Ten tests prove configured local and remote discovery, every lifecycle state, reachable-but-untrusted degradation, missing and rejected credentials, offline isolation, stale telemetry, event loss, controller restart, reconnect cursor continuity, payload/error redaction, unknown-host failure, and stream caps.

This proves the Vanta-owned adapter contract and deterministic transport fixtures. It does not prove a specific Ollama, LM Studio, vLLM, Modal, or Daytona transport; those adapters and desktop runtime controls build on this boundary in later cards.
