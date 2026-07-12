---
id: api
title: HTTP API reference
sidebar_position: 5
---

# HTTP API reference

Vanta runs several local HTTP servers. All bind to `127.0.0.1` and every action stays kernel-gated.

## Kernel API — `127.0.0.1:7788`

The Rust kernel's JSON API (the boundary the agent layer calls). See [The kernel](../kernel.md).

| Method + path | Purpose |
|---------------|---------|
| `GET /api/status` | Health + counts |
| `POST /api/assess` | Body = an action → returns the `Verdict` (allow / ask / block) |
| `GET /api/goals` · `POST /api/goals` | Read / append goals |
| `GET /api/approvals` · `POST /api/approvals` | Read / resolve the approval queue |
| `POST /api/log` | Append an event to the audit chain |
| `POST /api/run` | Run a safety-gated native action |
| `GET *` | The cockpit HTML UI |

**Assess example:**
```bash
curl -s 127.0.0.1:7788/api/assess \
  -d '{"action":"delete the database"}'
# → {"risk":"block", ...}
```

## Agent server (ACP) — `vanta acp [port]` (default 7792)

Exposes the agent loop over HTTP/JSON-RPC for editors. See [Integrations](../integrations.md).

| Method + path | Purpose |
|---------------|---------|
| `GET /` | Capability registry (`agent.json`) |
| `POST /run` | Execute an instruction → response |
| `GET /status` | Health |

## Authenticated operator API — `vanta api serve [port]` (default 7791)

Create a bearer token, then start the versioned API:

```bash
vanta api token create "remote supervisor"
vanta api serve 7791
```

| Method + path | Auth | Purpose |
|---------------|------|---------|
| `GET /api/v1/live` | no | Cheap process liveness; no setup, session allocation, or store writes |
| `GET /api/v1/readiness` | bearer | Bounded kernel, provider/config, state-store, disk, gateway/channel, active-turn, background, and delegated-worker status |
| `GET /api/v1/status` | bearer | Compatibility alias for readiness |
| `GET/POST /api/v1/sessions` | bearer | List or start sessions |
| `POST /api/v1/input` | bearer | Run a turn through the kernel-gated agent loop |
| `GET /api/v1/events` | bearer | Stream turn events over SSE |
| `GET/POST /api/v1/approvals/*` | bearer | Inspect and resolve pending approvals |

Readiness always returns HTTP 200 after successful authentication. Inspect its top-level
`ready`/`degraded` status and per-check status/counts. It never returns secret values, paths,
commands, payloads, identifiers, or raw errors. Checks cap kernel wait time, inspected entries,
and bytes per file. A configured channel without a fresh gateway observation is degraded.

The TypeScript SDK exposes `client.live()`, `client.readiness()`, and the compatibility
`client.status()` method.

## OpenAI-compatible proxy — `vanta proxy [port]` (default 7791)

Speaks the OpenAI API and routes through Vanta's provider layer.

| Method + path | Purpose |
|---------------|---------|
| `POST /v1/chat/completions` | OpenAI-shaped completion → routed to your model |
| `GET /v1/models` | List available models |

Point any OpenAI-API client at it:
```bash
OPENAI_API_KEY=vanta
OPENAI_BASE_URL=http://127.0.0.1:7791/v1
```

## Vanta as an MCP server — `vanta mcp serve`

Exposes a bounded, read-only allowlist of Vanta tools over MCP (stdio). Every call is gated by `assess()`: `block`/`ask` → an `isError` result (headless), only `allow` executes. Bound by `VANTA_MCP_SERVE_TOOLS`. See [MCP integration](../mcp.md#as-a-server--expose-vanta).

## Roadmap board — `vanta roadmap serve`

Serves the drag-and-drop roadmap board (`GET /roadmap/board`, `POST /roadmap/move`).
