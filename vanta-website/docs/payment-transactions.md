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
vanta payments x402-wallet create --yes
vanta payments x402-wallet status --json
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
testnet adapter and Visa has a local conformance lab. Adyen remains a limited-
access provider candidate, not an implemented adapter or a currently available
European substitute for Stripe Link.

The external-proof verifier tracks Adyen separately. It requires an authorized
`adyen_agentic` delegated-fiat receipt plus hash-verified provider evidence bound
to that exact event ID. The aggregate payment gate accepts Link or Adyen for
delegated fiat and MPP or x402 for HTTP 402, but only when its acceptance packet
binds the exact selected pair. Candidate receipts alone never ship a card.

The x402 adapter accepts only `exact` payments on Base Sepolia or Solana
Devnet through the no-key `x402.org` test facilitator. It validates resource,
network, asset, atomic amount, and onchain payee before calling a scoped vault
signer, retries the protected request once with `PAYMENT-SIGNATURE`, and
validates `PAYMENT-RESPONSE`. `vanta payments x402-wallet create --yes` creates
the test wallet through a native macOS Keychain adapter and registers only the
`X402_TEST_SIGNER` alias for `payment:x402`; no key enters argv, logs, contracts,
or receipts. `vanta payments x402-wallet status --json` exposes only the public
address and live Base Sepolia USDC balance, plus Circle's public faucet URL when
unfunded. Mainnet IDs and plaintext wallet keys are rejected. Both fixture
networks, a real Keychain lifecycle, scoped CLI resolution, and the
facilitator's live support response passed on 2026-07-18. The generated wallet
was unfunded, so a live settlement and paid-resource receipt remain an external
proof gate; this is not evidence of real-money settlement.

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
approved fiat rail, live paid HTTP 402 endpoint, and live Stripe Projects
account have not all run; production payment paths remain unreachable until
their exact release receipts exist.

See the repository's
[`docs/payment-transactions.md`](https://github.com/jpoindexter/vanta/blob/main/docs/payment-transactions.md)
for the contract schema and provider-status table.
