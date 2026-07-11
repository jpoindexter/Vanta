---
id: shopify-operations
title: Shopify operations
sidebar_position: 9
---

# Shopify operations

Vanta provides bounded Shopify Admin GraphQL reads plus typed product and
inventory mutations. Arbitrary GraphQL, checkout, refunds, returns, customer
export, and deletion are excluded.

```bash
vanta shopify read config/shopify.json products --limit 25
vanta shopify preview plans/product.json
vanta shopify apply plans/product.json --approve shop_product_launch_20260711
vanta shopify receipts
```

A strict store profile fixes the `*.myshopify.com` domain, quarterly API
version, vault credential alias, and declared Shopify scopes. Reads select only
bounded operational fields. Order queries omit customer names, email, phone,
addresses, and payment data by default.

Mutations require write plus verification-read scopes, expiry, a unique plan
ID, an idempotency key, an exact preview, and fresh approval. Auto mode cannot
answer or persist that approval. Vanta reserves the plan under a lock, executes
once, checks `userErrors`, then reads the resulting object back. Receipts are
mode `0600` and contain hashes and object IDs, not tokens, provider bodies, or
customer data.

The implementation has passed a real local HTTP fixture and the complete
tool/CLI path. It remains pre-release until the same read and verified mutation
pass against a Shopify development store.

See the repository's [full Shopify guide](https://github.com/jpoindexter/Vanta/blob/main/docs/shopify-operations.md).
