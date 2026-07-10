# Microsoft Teams

Vanta receives Teams messages through an Azure Bot Framework messaging endpoint and sends replies through the Bot Connector API. It does not require WSL or a separate bridge process.

## Configure

1. Register an Azure Bot and Teams app.
2. Put the app credentials in `vanta-ts/.env`:

```env
VANTA_TEAMS_APP_ID=<application-id>
VANTA_TEAMS_APP_PASSWORD=<client-secret>
VANTA_TEAMS_ALLOWLIST=<optional-conversation-or-user-ids>
```

3. Run the gateway:

```sh
vanta gateway
```

When Teams is configured, the gateway listens on `127.0.0.1:3978` and accepts Bot Framework activities at `/api/messages`. Put a TLS reverse proxy or tunnel in front of that listener, then set the Azure Bot messaging endpoint to:

```text
https://<your-public-host>/api/messages
```

Use `VANTA_MESSAGING_WEBHOOK_PORT` to change the port. Set `VANTA_MESSAGING_WEBHOOK_HOST=0.0.0.0` only when a trusted reverse proxy on the same host needs a non-loopback listener; do not expose the raw HTTP listener directly to the internet.

## Security

Every inbound activity requires a Bot Framework bearer token. Vanta verifies its RS256 signature against Microsoft's OpenID signing keys, checks issuer, application audience, lifetime, and the activity service URL, then applies `VANTA_TEAMS_ALLOWLIST` before an agent turn runs. Signing keys are cached for one hour.

## Verify

```sh
vanta gateway verify-channels
vanta gateway channel-proofs teams
```

`verify-channels` checks adapter readiness. `channel-proofs teams` is the stronger
release evidence: it stays empty until an authenticated activity passes the
allowlist, reaches the agent, and every reply part receives a successful Bot
Connector HTTP response. Receipts contain hashes of conversation/activity ids,
never message text or raw identifiers.

The local test suite proves JWT validation and the full HTTP activity to Connector
reply path with injected network boundaries. The roadmap card remains building
until an Azure-hosted Teams conversation creates the same receipt with real
credentials.
