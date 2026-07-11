---
id: payment-transactions
title: Payment transactions
sidebar_position: 8
---

# Payment transactions

Vanta has a test-only payment boundary for Stripe Link, HTTP 402 Machine
Payments Protocol, and Stripe Projects provisioning. Real-money execution
remains disabled.

```bash
vanta payments preview contracts/purchase.json
vanta payments execute contracts/purchase.json --approve pay_purchase_20260711
vanta payments receipts
```

Every version-1 contract fixes the merchant, item, currency, exact minor-unit
amount, per-purchase and period caps, credential type, expiry, and a unique
transaction ID. Execution requires that exact ID, then rechecks the ledger
under a lock before reserving the amount. Replays and concurrent cap overruns
are refused.

Agent-triggered payments use a fresh approval prompt. Auto mode cannot answer
it and “don't ask again” is unavailable. Stripe Link also requires its external
approval. Credentials remain inside the provider CLI; Vanta passes a scrubbed
process environment and stores only mode-0600 redacted receipts.

HTTP 402 responses are bounded and validated before payment. Amount, currency,
Stripe method, resource, merchant, item, and expiry must match the approved
contract. A denial, timeout, mismatch, malformed result, corrupt ledger, or
replay stops without exposing provider output.

Stripe Projects runs in a private temporary workspace, accepts only the exact
generated aliases named in the approved contract, pipes values into macOS
Keychain, registers only vault references, and removes plaintext before
success. A real child-process fixture passed this path. Live Stripe Link, a
live paid MPP endpoint, and a live Stripe Projects account have not run; the
production payment paths remain unreachable until the release receipts exist.

See the repository's
[`docs/payment-transactions.md`](https://github.com/jpoindexter/vanta/blob/main/docs/payment-transactions.md)
for the contract schema and provider-status table.
