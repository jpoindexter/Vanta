# Payment transactions

Vanta payment execution is test-only and fail-closed. A strict transaction
contract fixes the merchant, item, currency, exact minor-unit total,
per-purchase cap, daily or monthly cap, credential type, and expiry before any
provider is contacted. Production credentials and real-money mode are not
accepted by the version-1 schema.

```bash
vanta payments preview contracts/api-credit.json
vanta payments execute contracts/api-credit.json --approve pay_api_credit_20260711
vanta payments receipts
vanta payments authorization
vanta payments readiness --json
vanta payments x402-wallet create --yes
vanta payments x402-wallet status --json
```

```json
{
  "version": 1,
  "environment": "test",
  "id": "pay_api_credit_20260711",
  "provider": "stripe_link",
  "capability": "delegated_fiat",
  "merchant": { "name": "Example merchant", "url": "https://merchant.example" },
  "item": { "name": "API credit", "quantity": 1 },
  "currency": "usd",
  "currencyExponent": 2,
  "amountMinor": 25,
  "caps": { "perPurchaseMinor": 25, "periodMinor": 100, "period": "day" },
  "credential": { "type": "link_cli", "storage": "provider_cli" },
  "expiresAt": "2026-07-12T00:00:00.000Z"
}
```

`preview` reads the append-only receipt ledger and shows the amount against the
current period cap. `execute` requires the exact transaction ID; `--yes` is not
accepted. The agent-facing `payment_transaction` tool asks again inside the
tool with a fresh approval. Auto mode does not answer this prompt, and the UI
does not offer a persistent allow choice.

After approval, Vanta locks the ledger, rechecks expiry, caps, and replay, and
records a reservation before contacting the provider. Concurrent transactions
therefore cannot both spend the same remaining cap. Final receipts are mode
`0600` under `.vanta/payments/receipts.jsonl`. They include the authorization
decision, exact amount, redacted provider state, and cleanup assertions, but no
raw CLI output, credential, card data, API key, or durable environment value.

The authorization journal at `.vanta/payments/authorization.jsonl` separately
records `previewed -> operator_approved -> provider_challenge -> scoped_token ->
executing -> receipt_recorded`. Each event carries the same SHA-256 binding over
amount, payee, currency, item, expiry, network, and resource. It records that a
scoped credential existed, never the credential itself. Illegal transitions or
a changed binding fail closed.

## Provider boundary

| Path | Capability | Implemented behavior | Current proof |
| --- | --- | --- | --- |
| Stripe Link | `delegated_fiat` | Exact spend request with `--request-approval`; only allowlisted IDs/status leave the adapter | Real Vanta process plus executable test fixture passed; Spain is currently rejected by Link agent access |
| MPP over HTTP 402 | `http_402` | Bounded probe; exact amount/currency/network/resource/merchant/item/expiry validation; scoped-token request; paid retry | Deterministic adapter tests passed; no live paid endpoint receipt |
| Stripe Projects | `saas_provisioning` | Runs the plugin in a private temporary workspace, requires generated keys to exactly match approved aliases, moves values into native Keychain storage, registers only vault references, and removes plaintext before success | Real child-process fixture passed; live Stripe Projects account not run |
| Adyen Agentic | `delegated_fiat` | Typed readiness entry only | External enrollment and adapter required |
| x402 | `http_402` | Current v2 `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` flow; exact contract match before a scoped native-Keychain signer; one paid retry; settlement validation | Real wallet creation and scoped resolution passed; Base Sepolia and Solana Devnet fixtures passed; the live facilitator advertised both networks; funded settlement remains external |
| Visa TAP | `merchant_recognition` | Local RFC 9421/Ed25519 conformance signer, pinned-registry verifier, replay guard, operation binding, content-digest binding, and consented identifier filter | Public sample topology passes locally; production agent signing remains disabled pending Visa onboarding |

`vanta payments readiness` reports the current region, supported regions,
test/live availability, required enrollment, credential custody, challenge
type, and a terminal state for every known rail. Set `VANTA_PAYMENT_REGION` to
the ISO country code used for provider routing. `unsupported_region`,
`enrollment_required`, and `unavailable` stop before the adapter is invoked;
Vanta does not retry them in a loop.

The production payment executables are deliberately unreachable. Developers
can point `VANTA_PAYMENT_TEST_LINK_CLI` or
`VANTA_PAYMENT_TEST_STRIPE_PROJECTS_CLI` at isolated test wrappers; without
those variables, provider execution stops before spawning a process. Stripe
Projects also requires macOS and `VANTA_KEYCHAIN=1`. Its contract names every
generated alias in `provisioning.credentialVaultRefs`; extra, missing, empty,
or duplicate aliases fail before vault registration. Enabling real money
requires a separate release decision after live sandbox/test-mode Stripe Link
and MPP receipts.

```json
{
  "provider": "stripe_projects",
  "credential": { "type": "stripe_cli", "storage": "provider_cli" },
  "provisioning": {
    "service": "neon/postgres",
    "credentialVaultRefs": ["DATABASE_URL"]
  }
}
```

MPP contracts add a request block:

```json
{
  "provider": "mpp",
  "capability": "http_402",
  "credential": { "type": "link_cli", "storage": "provider_cli" },
  "request": { "url": "https://api.example/report", "method": "GET", "network": "stripe" }
}
```

The initial response must be HTTP 402 with `WWW-Authenticate`. A changed total,
currency, contract-network mismatch, resource, merchant, item, excessive precision, or
expired challenge stops before a spend request is created. Denial, timeout,
malformed output, corrupt ledger data, and replay all fail closed with redacted
operator output.

x402 contracts use the current v2 header protocol and are narrower than MPP.
Only `exact` payments on Base Sepolia (`eip155:84532`) or Solana Devnet
(`solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`) are accepted. The contract binds
the test facilitator, asset, onchain payee, atomic amount, protected resource,
and vault signer alias before the first request:

```json
{
  "provider": "x402",
  "capability": "http_402",
  "currency": "usdc",
  "currencyExponent": 6,
  "amountMinor": 1000,
  "credential": { "type": "wallet_signer", "storage": "vault", "ref": "X402_TEST_SIGNER" },
  "request": {
    "url": "https://api.example/paid",
    "method": "GET",
    "network": "eip155:84532",
    "scheme": "exact",
    "asset": "0x...",
    "payTo": "0x...",
    "facilitator": "https://x402.org/facilitator"
  }
}
```

Vanta rejects a resource, network, asset, payee, or amount mismatch before the
signer is called. Run `vanta payments x402-wallet create --yes` once on macOS to
generate a test wallet. Vanta stores the private key through the native
Keychain adapter and registers only `X402_TEST_SIGNER` for the `payment:x402`
scope. The command repairs that alias when its backing credential is missing,
but never replaces a valid configured wallet. The signer receives only the
vault alias and validated requirement; private keys never enter the contract,
receipt, process arguments, or logs. A signed payload must repeat the same
binding, and the paid response must carry a successful settlement on that
network. `vanta payments x402-wallet status --json` derives only the public
address and reads the official Base Sepolia USDC contract balance through the
configured RPC, returning the Circle public faucet URL while unfunded. Mainnet
network IDs are rejected by the schema. The real Keychain
lifecycle and scoped CLI resolution passed on 2026-07-18. The generated wallet
was unfunded, so a live facilitator settlement and paid-resource receipt remain
an external proof gate. Any future real-money enablement is a separate operator
decision.

## Visa TAP conformance

Run the public-protocol compatibility lab with:

```bash
npm run payment:visa-tap:conformance
```

The lab follows Visa's published agent → registry → CDN verifier → merchant
topology. It creates RFC 9421-style `Signature-Input` and `Signature` headers
with Ed25519, binding `@authority`, `@path`, `created`, `expires`, `keyId`,
`nonce`, and either `agent-browser-auth` or `agent-payer-auth`. Vanta also
covers `content-digest` when a body exists so an altered checkout payload fails
verification. Wrong domain/path, expiry, replay, unknown or changed keys,
unpinned registries, and cross-operation signatures all fail.

The merchant helper retrieves only the public key from a pinned registry and
returns only identifiers covered by explicit consumer consent. The lab does
not store a Visa credential, PAN, CVC, or Payment Passkey, and it is not proof
that Vanta is a Visa-approved agent. Production signing is not wired into the
payment provider. Visa certification and restricted client material remain an
external release prerequisite.

External release acceptance is capability-based but still evidence-bound. It
requires one named `delegated_fiat` authorization receipt, one named `http_402`
settlement receipt with a successful paid-resource response, and an acceptance
packet containing both exact event IDs. Existing Link and MPP version-1
receipts are read as `delegated_fiat` and `http_402` respectively without
rewriting or changing their original meaning.
