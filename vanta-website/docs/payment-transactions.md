---
id: payment-transactions
title: Payment transactions
sidebar_position: 8
---

# Payment transactions

Vanta has a provider-neutral, test-only authorization boundary for delegated
fiat, HTTP 402, merchant recognition, and Stripe Projects provisioning.
Real-money execution remains disabled.

```bash
vanta payments preview contracts/purchase.json
vanta payments execute contracts/purchase.json --approve pay_purchase_20260711
vanta payments receipts
vanta payments authorization
vanta payments readiness --json
```

Every version-1 transaction contract selects `delegated_fiat` or `http_402`
and fixes the merchant, item, currency, exact minor-unit amount, payee, network,
resource, per-purchase and period caps, credential type, expiry, and a unique
transaction ID. Execution requires that exact ID, then rechecks the ledger
under a lock before reserving the amount. Replays and concurrent cap overruns
are refused.

Agent-triggered payments use a fresh approval prompt. Auto mode cannot answer
it and “don't ask again” is unavailable. Stripe Link also requires its external
approval. Credentials remain inside the provider CLI or vault signer; Vanta
passes a scrubbed process environment and stores only mode-0600 redacted
receipts. A separate authorization journal records preview, approval, provider
challenge, scoped-credential issuance, execution, and receipt phases against
one immutable binding hash. It never stores the credential.

HTTP 402 responses are bounded and validated before payment. Amount, currency,
contract-selected network, resource, merchant, item, and expiry must match the
approved contract. A denial, timeout, mismatch, malformed result, corrupt
ledger, unsupported region, missing enrollment, or replay stops without
exposing provider output or retrying indefinitely.

`vanta payments readiness` reports region support, test/live availability,
external enrollment, credential custody, challenge type, and terminal state
for Stripe Link, MPP, Adyen Agentic, x402, and Visa TAP. x402 has a guarded v2
testnet adapter; Adyen and Visa remain named future rails, not falsely reported
as implemented adapters.

The x402 adapter accepts only `exact` payments on Base Sepolia or Solana
Devnet through the no-key `x402.org` test facilitator. It validates resource,
network, asset, atomic amount, and onchain payee before calling an injected
vault signer, retries the protected request once with `PAYMENT-SIGNATURE`, and
validates `PAYMENT-RESPONSE`. Mainnet IDs and plaintext wallet keys are rejected.
Both fixture networks and the facilitator's live support response passed on
2026-07-18; this is not evidence of a funded wallet or real-money settlement.

Stripe Projects runs in a private temporary workspace, accepts only the exact
generated aliases named in the approved contract, pipes values into macOS
Keychain, registers only vault references, and removes plaintext before
success. A real child-process fixture passed this path. Stripe Link agent access
rejected the current Spain-based account as an unsupported region. A live
approved fiat rail, live paid HTTP 402 endpoint, and live Stripe Projects
account have not all run; production payment paths remain unreachable until
their exact release receipts exist.

See the repository's
[`docs/payment-transactions.md`](https://github.com/jpoindexter/vanta/blob/main/docs/payment-transactions.md)
for the contract schema and provider-status table.
