---
id: payment-transactions
title: Payment transactions
sidebar_position: 8
---

# Payment transactions

Vanta has a provider-neutral, test-only authorization boundary for delegated
fiat, merchant recognition, and Stripe Projects provisioning. Real-money
execution remains disabled. Crypto is not an operator workflow or release
requirement.

```bash
vanta payments preview contracts/purchase.json
vanta payments execute contracts/purchase.json --approve pay_purchase_20260711
vanta payments receipts
vanta payments authorization
vanta payments readiness --json
```

Every required version-1 transaction contract selects `delegated_fiat` and
fixes the merchant, item, currency, exact minor-unit amount, payee,
per-purchase and period caps, credential type, expiry, and a unique transaction
ID. Execution requires that exact ID, then rechecks the ledger under a lock
before reserving the amount. Replays and concurrent cap overruns are refused.

Agent-triggered payments use a fresh approval prompt. Auto mode cannot answer
it and “don't ask again” is unavailable. Stripe Link also requires its external
approval. Credentials remain inside the provider CLI or vault signer; Vanta
passes a scrubbed process environment and stores only mode-0600 redacted
receipts. A separate authorization journal records preview, approval, provider
challenge, scoped-credential issuance, execution, and receipt phases against
one immutable binding hash. It never stores the credential.

`vanta payments readiness` reports region support, test/live availability,
external enrollment, credential custody, challenge type, and terminal state
for Stripe Link, Adyen Agentic, and Visa TAP. Legacy HTTP 402/x402 compatibility
may still appear in diagnostics, but it is excluded from required product
proof. Visa has a local conformance lab. Adyen remains a limited-
access provider candidate, not an implemented adapter or a currently available
European substitute for Stripe Link.

The external-proof verifier tracks Adyen separately. It requires an authorized
`adyen_agentic` delegated-fiat receipt plus hash-verified provider evidence bound
to that exact event ID. The aggregate payment gate accepts Link or Adyen only
when its acceptance packet binds the exact selected fiat receipt. Candidate
receipts alone never ship a card. The operator explicitly declined crypto on
2026-07-18; x402 remains dormant test-only compatibility, mainnet remains
code-disabled, and wallet funding must not be requested unless that decision is
reversed.

Visa TAP is implemented only as a local public-protocol conformance lab. Its
RFC 9421/Ed25519 signatures bind merchant authority, path, time window, nonce,
key ID, operation tag, and checkout body digest. A pinned registry supplies the
public key; replay, mutation, unknown key, and cross-operation attempts fail;
the merchant receives only consented identifiers. Production Visa signing and
payment credentials remain disabled until formal scheme onboarding.

Stripe Projects runs in a private temporary workspace, accepts only the exact
generated aliases named in the approved contract, writes values through the
native macOS Keychain adapter, registers only vault references, and removes plaintext before
success. A real child-process fixture passed this path. Stripe Link agent access
rejected the current Spain-based account as an unsupported region. A live
approved fiat rail and live Stripe Projects account have not both run;
production payment paths remain unreachable until their exact release receipts
exist.

See the repository's
[`docs/payment-transactions.md`](https://github.com/jpoindexter/vanta/blob/main/docs/payment-transactions.md)
for the contract schema and provider-status table.
