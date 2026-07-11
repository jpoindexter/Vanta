# Webhook workflows

Webhook workflows turn signed internet events into kernel-gated Vanta work. The
builder ships templates for GitHub pull requests, inbound email, form/subscriber
events, and generic JSON posts.

## Create and inspect

```bash
vanta webhook workflow new github-pr \
  --id review-pr \
  --name "Review PR" \
  --deliver telegram:123456
vanta webhook workflow test review-pr
vanta webhook workflow enable review-pr
vanta webhook workflow show review-pr
```

Creation prints the route, a test payload, and the HMAC secret once. It also runs
a configuration dry-run and leaves the workflow disabled. The secret is stored
separately under `.vanta/webhook-workflows/secrets/` with mode `0600`; list and
show commands never print it again.

## Run

Start `vanta gateway` or install the background service. Enabled workflows listen
on `VANTA_WORKFLOW_WEBHOOK_PORT` (default `7790`) at their displayed route:

```text
POST http://<gateway-host>:7790/webhooks/review-pr
X-Hub-Signature-256: sha256=<HMAC-SHA256 of the raw body>
```

Vanta rejects unsigned, disabled, unknown, non-POST, and over-1 MB requests. A
valid request receives `202 Accepted`; execution continues through the normal
gateway agent handle and its kernel approval boundary. Configure remote ingress
with TLS and do not expose the listener directly without a trusted reverse proxy.

## Receipts and controls

`vanta webhook workflow show <id>` displays recent dry-run, authenticated-route,
and delivery receipts. Receipts store a body hash and byte count, not the event
body. Use `enable` and `disable` to arm or stop a route. `vanta home` summarizes
enabled and disabled webhook workflows in Operator Home.
