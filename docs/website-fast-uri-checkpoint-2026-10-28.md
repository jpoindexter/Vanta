# Website URI dependency — 2026-10-28 source checkpoint

The existing website `fast-uri` override changes from 3.1.5 to compatible 3.1.9.
Only that manifest value and the existing lock record's version, resolved URL
and integrity change. Every other package record, license, funding field and
non-dev classification is retained. No dependency-policy exception or major
override is introduced. Canonical postimage hashes match the tested candidate.

The actual consumer is webpack-dev-server 5.2.6 → schema-utils 4.3.3 → Ajv
8.20.0 → fast-uri. Ajv already accepts `^3.0.1`. Private before/after dependency
copies reuse verified fixed-package bytes; no registry install or canonical
node_modules mutation occurs.

## Executed checks

Ten finite checks per phase exercise actual Ajv/schema-utils and the actual
webpack-dev-server options schema. They cover encoded references, local schema
references, ordinary invalid/unknown fields, valid configuration, invalid port,
unknown options, malformed authority ports and ordinary URI resolution. All
20 checks exit naturally 0 with empty stderr, including parent replay.

The old validator already rejects the unresolved encoded reference, but its
error reports an interpreted `javascript:` missing reference. The patched leaf
rejects the malformed scheme before that interpretation. No foreign schema is
fetched and no ordinary application SSRF or schema acceptance is established.
This is the real validator/options schema, not a running website server.

Fresh matched npm lock-only audits report **36 → 35** package rows: high
**8 → 7**, critical **17 → 17**, moderate **2 → 2**, low **9 → 9**. Only
`fast-uri` disappears; all other 35 rows are exactly identical. Earlier 38-row
audit receipts remain historical; their difference is not attributed to this
patch. Both current audits exit 1 because advisories remain, not a transport
failure. Separate private empty configuration/cache paths avoid owner registry
configuration. An initial config-resolution failure and the earlier caller
fixture correction remain retained rather than counted as passing checks.

## Boundaries

No full website build, canonical installation, deployment, agent network path,
default-main alert reduction or overall security clearance is claimed. Running
website dependencies still need a separately verified installation/build; this
checkpoint changes declared source selection only. Installed agent10 and CLI70
are unchanged, and the delivered application-source fingerprint stays identical.

No main merge, release/tag, CI, paid service, policy waiver, protected Rust/
factory change, legacy retirement or card completion occurs. Existing original
work is preserved. Private receipts are in `website-fast-uri-20261028-9WFuXb`
and `live-client-recovery-20261028-6B8EuN`.
