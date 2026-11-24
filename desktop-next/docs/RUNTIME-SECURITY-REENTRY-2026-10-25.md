# Runtime security re-entry — 2026-10-25

Read-only triage on parent source900b7510 plus its preserved pending changes.
No live/shared edit, install, commit, push, owner profile or account action.
No patch is proposed as a compatible fix for the highest-reachability finding.

## Refreshed result

Actual npm audit --omit=dev --json from vanta-ts remains6package findings:
0critical/5high/1moderate. Raw:
/tmp/vanta-runtime-production-refresh-20261025.json.

- zod3.25.76: high; patched package line starts4.6.6.
- openai5.23.2: high only through its Zod dependency, not a separately reported
  direct OpenAI vulnerability. Its optional peer requires Zod^3.23.8.
- adm-zip0.6.0: high; onnxruntime-node1.24.3 propagates moderate.
- sharp0.35.3: high; @huggingface/transformers4.2.0 propagates high through
  sharp and onnxruntime-node. These are not four independent exploit paths.

These counts describe this dependency tree, not GitHub alerts, the assembled
Desktop closure, all ecosystems or executed exploitation.

## Loaded core: no compatible patched bump

Read installed package files plus official npm metadata: latest published
Zod3 is3.25.76; latest OpenAI5 is5.23.2 with Zod^3.23.8 peer. The supported
patched Zod4.6.7 path is a major API/semantic migration, not a patch override.
Runtime has415non-test Zod import sites, including gateway parsing, provider
catalogs, tool argument schemas and Desktop server boundaries. OpenAI client
is imported by src/providers/openai.ts. Existing ZodTypeAny and schema-generic
consumers require deliberate compatibility verification.

One public-API, non-network disconfirming check used8safe strings and max1.
Both runtime Zod3 and patched4.6.7's zod/v3 compatibility export reject the
array only AFTER invoking all8element parsers. Therefore upgrading the package
number and rewriting imports to zod/v3 would hide an audit warning without
fixing this behavior. Do not do that. No OOM/stress test was run.
Raw: /tmp/vanta-runtime-zod3-bounded-proof.json.

Official sources: [Zod fix release](https://github.com/colinhacks/zod/releases/tag/v4.6.6),
[reviewed advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

## Compatible lower-exposure patches exist, but are not the core fix

Root overrides already force adm-zip0.6.0 and sharp0.35.3 across their optional
ML parents. Compatible patch targets0.6.1 and0.35.5 exist. They retain value for
a full CLI/local-ML dependency install, but all four ML-chain packages are
absent from the actual installed /Applications/Vanta.app runtime closure.
The packager explicitly excludes them; it does not exclude winnow itself.

Code-path inspection: adm-zip is required by onnxruntime-node's install-utils,
not its normal inference entry point. winnow loads Transformers dynamically
only in makeLocalLogprobScorer; no Vanta caller was found. Current pruning's
default path is model-free. This is not a claim about every future plugin or
optional local-ML usage; no capability should be deleted to quiet the audit.

[AdmZip0.6.1 advisory](https://github.com/cthackers/adm-zip/security/advisories/GHSA-8238-w5pm-2374),
[Sharp0.35.5 advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w).
The latter's specific RCE description concerns glibc-based Linux conditions,
not proof of exploitation on this Mac.

## Exact next decision

Start a separate isolated Zod4 and compatible supported OpenAI SDK major
migration, preserving every schema validation, provider format and failure
contract. First inventory/default/record/error-shape differences, run a scoped
typecheck diagnostic, then adapt affected consumers with real public boundary
tests. A naked major override or v3 alias is not acceptable. Any protected
factory source change requires the owner's explicit permission before editing.
Do not weaken schema constraints or omit protected files to make checks pass.

Alternatively the optional ML override patches can be a separate low-risk
CLI-install maintenance slice, with archive/native image proofs and exact
closure audit. They do not supersede the loaded core migration or establish
security-green status. This worker's assigned no-majors boundary is retained.
