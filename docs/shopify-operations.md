# Shopify operations

Vanta exposes bounded Shopify Admin GraphQL reads and two typed mutations:
product updates and absolute inventory quantity changes. Checkout, refunds,
returns, customer export, arbitrary GraphQL, and destructive product deletion
are not part of this surface.

## Store profile

```json
{
  "version": 1,
  "store": "vanta-dev.myshopify.com",
  "apiVersion": "2026-04",
  "credentialVaultAlias": "SHOPIFY_DEV_TOKEN",
  "scopes": ["read_products", "write_products", "read_inventory", "write_inventory"]
}
```

Only `*.myshopify.com` stores and quarterly version strings are accepted. The
profile names a vault alias, never an access token. Grant that alias separately
for read and write use on the exact store:

```bash
vanta secrets vault add SHOPIFY_DEV_TOKEN \
  --backend 1password \
  --ref op://Vanta/shopify-dev/token \
  --scope shopify:vanta-dev.myshopify.com:read,shopify:vanta-dev.myshopify.com:write
```

The adapter resolves the token only while creating the HTTPS request. It does
not return raw headers, provider bodies, or the token to the model or receipt.

## Reads

```bash
vanta shopify read config/shopify.json products --limit 25
vanta shopify read config/shopify.json orders --limit 10 --query "created_at:>2026-07-01"
vanta shopify read config/shopify.json inventory --limit 25
```

Reads permit 1-100 records and fixed GraphQL documents only. Product reads
return identity, title, status, total inventory, and update time. Order reads
return order identity, creation time, financial status, and shop-money total;
customer names, email, phone, addresses, and payment data are deliberately not
selected. Inventory reads return item/SKU/tracking plus available quantity and
location identity. A missing declared scope stops before vault resolution.

## Mutations

```json
{
  "version": 1,
  "operation": "product_update",
  "profile": { "...": "store profile fields" },
  "id": "shop_product_launch_20260711",
  "idempotencyKey": "00000000-0000-4000-8000-000000000000",
  "expiresAt": "2026-07-12T00:00:00.000Z",
  "input": {
    "id": "gid://shopify/Product/123",
    "status": "DRAFT"
  }
}
```

```bash
vanta shopify preview plans/product-draft.json
vanta shopify apply plans/product-draft.json --approve shop_product_launch_20260711
vanta shopify receipts
```

The CLI requires the exact plan ID. The `shopify_operations` agent tool uses a
fresh approval that auto mode cannot answer or persist. After approval, Vanta
locks the mode-`0600` receipt ledger, refuses replay, records a reservation,
executes the typed mutation, checks Shopify `userErrors`, and issues a second
read query to verify the resulting product or inventory quantity.

Inventory writes use Shopify's `@idempotent(key: $idempotencyKey)` directive.
Product updates retain the local idempotency key and replay guard; Shopify
product updates are field-setting operations and do not advertise that
directive. Receipts store operation, target ID, scopes, idempotency key,
request/result hashes, state, and verification status. Tokens, provider bodies,
and customer data are not persisted.

## Proof status

Executed tests start a real local HTTP server and prove bounded order reads,
token-only request headers, typed mutation, `userErrors` stop, and a separate
verification request. CLI/tool tests prove exact/fresh approval, denial, replay,
and receipt behavior. A real Shopify development-store read and mutation have
not been executed, so `HERMES-SHOPIFY-OPERATIONS` remains blocked until that
external acceptance receipt exists.
