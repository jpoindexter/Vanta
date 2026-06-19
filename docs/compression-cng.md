# Compression CNG — pass-rate measurement (no logprobs)

Measured: 2026-06-19T08:48:07.628Z · provider `codex` · model `gpt-5.5`
Corpus: 1 task(s) × 1 rollout(s) · baseline pass@1 100% (37 output tokens, all compression off)

CNG per dimension runs the corpus WITH vs WITHOUT that compression dimension on the configured provider. A dimension is **net-positive** iff it saved output tokens AND did not regress pass@1 (`tokensSaved > 0 && passDelta >= 0`). A default is flipped ON only where the signal is both net-positive and large enough to trust (>= 6 rollout-observations) — conservative by design.

| dimension | base tokens | treat tokens | saved | base pass@1 | treat pass@1 | Δpp | net-positive | flipped |
|---|---|---|---|---|---|---|---|---|
| skill-distilled | 37 | 37 | 0 | 100% | 100% | 0 | no | no |
| skill-subset | 37 | 53 | -16 | 100% | 100% | 0 | no | no |
| prune | 37 | 53 | -16 | 100% | 100% | 0 | no | no |

## Flip decisions

- **skill-distilled** — keep current default: insufficient signal (1 obs < 6) — record only, do not flip
- **skill-subset** — keep current default: insufficient signal (1 obs < 6) — record only, do not flip
- **prune** — keep current default: insufficient signal (1 obs < 6) — record only, do not flip

## Caveat

This is a SMALL-N directional signal. The live run above is intentionally capped (few tasks, one rollout) so it completes in minutes, not a marathon. The numbers indicate direction, not a statistically settled effect size. Re-run with the full corpus and `VANTA_EVAL_ROLLOUTS>=2` for a flip-grade signal. Defaults were flipped ONLY where the measured CNG was clearly net-positive on a sufficient signal; everything else is recorded and left unchanged.
