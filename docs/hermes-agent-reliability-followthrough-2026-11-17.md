# Hermes follow-through: small agent reliability repairs

## Outcome and scope

Make existing agent/MCP behavior truthful and recoverable before adding another shell or feature catalog. Preserve all source work, historical shipped cards, no-replay fences, credentials and the existing two-lane WIP limit. The [canonical roadmap](../roadmap.json) remains authoritative; Trello is a projection.

This follows the [pinned Hermes review](hermes-delivery-priorities-2026-11-17.md) at `27e389359263b7294e2788fee048953fc34b82d1`, not a claim to have reviewed every Hermes commit or installed its runtime. No Hermes application source or assets were copied into Vanta.

## Executed source repairs

### MCP authentication expiry

Owner: `MCP-FLEET-HEALTH-CONTEXT-BUDGET` ([card](https://trello.com/c/R1Z1iJXc)). Broad fleet/context-budget acceptance remains open.

The shared registry used token presence, ignoring its existing millisecond `expiry_date`. An expired token plus an earlier healthy probe incorrectly appeared `ready`. The pre-change regression failed precisely for expired, zero and exact-now expiry.

The shared predicate now requires a known expiry to be strictly in the future. Missing tokens remain unauthorized; unknown expiry preserves the existing compatibility behavior rather than inventing a refresh policy. CLI/Desktop still use the same registry.

Executed checks:

- Registry/auth/CLI/Desktop focused run: 36 passing cases, including missing/future/unknown expiry and explicit-empty tool denial.
- Actual `runMcpCommand(root, ["list"])` invocation in a synthetic isolated profile reports `needs_setup` and `auth needs_auth` despite a healthy prior probe. Network and process-launch guards record zero requests/launches; fixture hashes remain unchanged and the token is absent from output.
- Independent exact consumer files `src/cli/mcp-cmd.test.ts` and `src/desktop/mcp-add-settings.test.ts`: 10 passing cases.

Not established: live OAuth refresh, mounted-server behavior, packaged Desktop UI, or transport-level rejection by direct `connectServer`/`reconnectServer`. The fix reports known expiry; it does not add automatic renewal or prove a working connection.

### Streamed Anthropic cache accounting

Owner: new narrow defect `ANTHROPIC-STREAM-CACHE-USAGE` ([card](https://trello.com/c/45udwYQb)), linked after the existing shipped `HERMES-DELTA-USAGE-ROUTE-LEDGER`. Do not rewrite the shipped card's historical acceptance.

The converter discarded `cache_read_input_tokens` in streamed responses, although non-streaming completion, `Usage.cacheTokens` and the route ledger already support it. A production SDK/provider/consumer replay against a local synthetic HTTP/SSE server reproduced correct text with missing cache usage before the change.

The shared converter retains cache reads from `message_start`, preserves them through cumulative output updates, and accepts explicit later cache updates including zero. Missing/null values do not invent a cache hit. Cache creation is not treated as cache reading; no schema, pricing, TTL or billing claim was added.

Executed checks:

- Converter SDK-parser cases: six red failures before the fix; all ten new cases pass afterward.
- Actual SDK → `AnthropicProvider.stream` → `consumeStream` → existing durable route-ledger readback: exact text, 10 input/5 output/1,000 cache tokens, one local HTTP request and one accounted call. Billing remains `unknown`.
- Parent combined provider/MCP/auth/cost run: nine files, 65 passing checks. The consumer tests above were separate; counts overlap the agents' focused runs and must not be added as unique coverage.
- `npm run typecheck` in `vanta-ts`: exit zero.

Not established: a live paid Anthropic request, vendor billing reconciliation, or installed CLI/Desktop delivery. Tests use synthetic input and a loopback server, not an owner's conversation or credentials.

## Dependency-ordered work remaining

1. Review and checkpoint these two source repairs; keep package delivery distinct from source acceptance.
2. Preserve interrupted child work for **inspection**, with stable parent/child/root ownership and awaited private checkpoints. A fresh process must inspect exact partial work without any model/tool replay or grant restoration. Existing unresolved-result review holds remain. Remaining execution budget must never be silently reset.
3. Reproduce cold-start typing with the actual mounted composer lifecycle. Vanta keeps a floating editor mounted and already has destination-owned draft handling; absence of a Hermes-style buffer is not proof of a Vanta defect.
4. Diagnose configured fallback entries without inference; test an exact selected route only with explicit live-probe authority. Never let successful fallback mask a broken entry or claim a static check proves inference.
5. Reproduce adopted-reply/late-tail reconnect behavior before changing production streaming. Existing session identity/no-second-POST protections stay intact.

The MCP, child recovery and reconnect cards now contain bounded ordered checklists. No broad card was blanket-closed and no Building/Next lane was added. Owner/live-account/hardware/visual/unfamiliar-person gates remain separate.

## Delivery boundary

The normal installed Desktop remains the previously delivered signed/notarized `0.1.3` at `b2847a8f6665a5294d25478dd3cb20ac140a5da6`; the normal CLI pin is unchanged. This document records source work after that package, not a new app installation, release or update. Protected `main`, repository safeguards and GitHub Actions settings are unchanged.

REA JavaScript analysis was refused by the tool host's approval policy even with filesystem access. No workaround, runtime REA graph or Hopper analysis is claimed. The current work is grounded in inspected source and executed narrow behavior, not an extraction claim.
