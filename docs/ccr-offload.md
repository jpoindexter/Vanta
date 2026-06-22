# CCR offload disposition

Measured by `vanta eval ccr` over this install's live `.vanta/events.jsonl` + `.vanta/ccr` store. Re-run anytime to refresh.

| metric | value |
|---|--:|
| events scanned | 2646 |
| stashed originals (.vanta/ccr) | 142 |
| retrieve_original calls | 17 |
| result-offload deliveries (>50K grep-pointer path) | 0 |
| **whole-retrieve rate** (retrieves / stashes) | **12.0%** |
| **verdict** | **KEEP** |

## Reading

The whole-retrieve rate is the deciding signal. Vanta's CCR makes re-expansion **optional** (an `original_id` in a footer), unlike the forced full-retrieve that made CCR net-negative (a known failure mode). A **low** rate means the compressed/skeletoned view sufficed and CCR saved tokens; a **high** rate means the agent pulls originals back whole and pays the double-context tax.

- **keep** (<1/3): compressed view usually sufficed — CCR nets positive on the live tool path.
- **scope** (1/3–2/3): restrict CCR to history-compaction, off the live tool path.
- **retire** (≥2/3): the double-context tax dominates — drop CCR from the live tool path.

## Caveat

Single-install sample; result-offload (the >50K path) fires rarely, so most stashes come from the code-skeleton + JSON-view compressors. Treat the verdict as directional and re-run as usage grows.
