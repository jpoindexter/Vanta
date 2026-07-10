# Vanta Public API v1

Vanta API v1 is a loopback HTTP interface for trusted external programs. Agent turns use the same `prepareRun` and `createConversation` path as the CLI and desktop app, so tool calls still pass through kernel safety policy and web-style approvals.

## Start

```bash
vanta api token create "local integration"
vanta api serve 7791
```

The token is printed once. Vanta stores only its SHA-256 hash in `~/.vanta/public-api-tokens.json`. The server binds `127.0.0.1` by default; put an authenticated TLS proxy in front of it instead of exposing the raw port to a network.

Every request requires `Authorization: Bearer <token>`. A client channel is selected with `X-Session-Id`; the SDK generates one and keeps it stable for the life of the client. Revoke a credential immediately with `vanta api token revoke <id>`.

## HTTP contract

Base URL: `http://127.0.0.1:7791/api/v1`

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/status` | Kernel, provider, model, tools, session, and active goals |
| `GET` | `/sessions` | Persisted session summaries |
| `POST` | `/sessions` | Start a session; returns `{ id }` |
| `POST` | `/sessions/open` | Open `{ id }`; returns messages and metadata |
| `POST` | `/input` | Send `{ message }`; returns final text, usage, events, and session id |
| `GET` | `/events` | SSE stream of versioned `output.delta`, `activity`, and `turn.completed` events |
| `GET` | `/approvals/current` | Current blocked approval or `null` |
| `POST` | `/approvals/resolve` | Resolve `{ id, decision }` where decision is `allow`, `always`, `deny`, or `never` |

Errors are JSON `{ "error": "..." }`. Missing, unknown, and revoked bearer tokens receive `401`. API routes return `403` unless the server was started through `vanta api serve` or embedded with `publicApi: true`.

## Streaming

Each SSE frame has a named event and JSON data. The contract is additive within v1.

```text
event: output.delta
data: {"apiVersion":"v1","type":"output.delta","sessionId":"...","delta":"hello"}
```

```text
event: activity
data: {"apiVersion":"v1","type":"activity","sessionId":"...","label":"done · 1 iteration(s)","ok":true}
```

Every input ends with `turn.completed`, including an `ok` boolean. The SDK's `streamInput()` waits for the SSE handshake before posting input and closes the stream after this terminal event, avoiding first-chunk races. Approval-required turns remain pending until another request resolves `/approvals/current`; kernel `block` decisions cannot be overridden.

## SDK and plugin contract

`@jpoindexter/vanta-operator-sdk` exports `VantaClient`, all API v1 types, `VANTA_API_VERSION`, and the plugin manifest contract. Build a registry-ready tarball with `npm run sdk:pack`.

The release workflow publishes the scoped package to GitHub Packages and proves a fresh registry install. Consumers authenticate npm for the `@jpoindexter` scope against `https://npm.pkg.github.com` using a GitHub token with `read:packages`.

Plugin manifests use `contractVersion: 1` with `id`, `name`, `version`, `entrypoint`, and `capabilities`. `isVantaPluginManifestV1` validates that stable envelope. Breaking fields require a new contract version; v1 changes are additive only.
