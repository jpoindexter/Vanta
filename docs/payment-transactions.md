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
| Stripe Projects | `saas_provisioning` | Runs the plugin in a private temporary workspace, requires generated keys to exactly match approved aliases, moves values into Keychain through stdin, registers only vault references, and removes plaintext before success | Real child-process fixture passed; live Stripe Projects account not run |
| Adyen Agentic | `delegated_fiat` | Typed readiness entry only | External enrollment and adapter required |
| x402 | `http_402` | Typed readiness entry only | Testnet adapter is the next dependent card |
| Visa TAP | `merchant_recognition` | Typed readiness entry only | Conformance harness and scheme onboarding remain separate |

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

External release acceptance is capability-based but still evidence-bound. It
requires one named `delegated_fiat` authorization receipt, one named `http_402`
settlement receipt with a successful paid-resource response, and an acceptance
packet containing both exact event IDs. Existing Link and MPP version-1
receipts are read as `delegated_fiat` and `http_402` respectively without
rewriting or changing their original meaning.
