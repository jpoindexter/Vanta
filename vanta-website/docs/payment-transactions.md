---
id: payment-transactions
title: Payment transactions
sidebar_position: 8
---

# Payment transactions

Vanta has a test-only payment boundary for Stripe Link and HTTP 402 Machine
Payments Protocol workflows. Real-money execution remains disabled.

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

Current proof is intentionally limited: the full Vanta command path passed with
an executable test adapter, but live Stripe Link, a live paid MPP endpoint, and
vault-only Stripe Projects provisioning have not passed. The production
`link-cli` path remains unreachable until those release receipts exist.

See the repository's
[`docs/payment-transactions.md`](https://github.com/jpoindexter/vanta/blob/main/docs/payment-transactions.md)
for the contract schema and provider-status table.
