# Skill-to-LoRA (S2L) — design spike + go/no-go

Spike for roadmap card **S2L-LORA-SKILLS**. Source: *Skill-to-LoRA: From Using Skills to
Learning Behaviors for Token-Efficient LLM Agents* (Zhang & Qi, 2026, arXiv:2606.16769).
**This is a design assessment only — no training or serving infra is built. Decision: see
the recommendation. Build requires explicit sign-off.**

## What S2L does

Instead of injecting a `SKILL.md` into the runtime prompt every step, S2L converts each
skill into a **skill-specific LoRA adapter** offline, then at inference drops the skill text
entirely and loads the adapter by `skill_id`. Pipeline:

1. **Self-distillation** — use the full `SKILL.md` to synthesize task inputs + target
   outputs (behavioral demonstrations).
2. **QLoRA training** — freeze the base model, train one small LoRA per skill on those demos
   (paper: rank 16, ~6M params, ~24MB/skill).
3. **Dynamic serving** — at runtime keep only `skill_id` metadata; load the matching LoRA.

Reported (SWE-Skills-Bench, Qwen3.6-27B via vLLM): **65/210 pass** vs 54 (full skill text)
vs 59 (no skill), **−6.6% per-step tokens**, robust to wrong-skill retrieval.

## How it maps to Vanta

Vanta already minimizes skill *text* cost — and as of this cluster, two of S2L's three stages
exist in spirit on the text side:

| S2L stage | Vanta today |
|---|---|
| self-distillation (demos from SKILL.md) | **SKILL-DISTILL-EXAMPLES** (shipped) — `distillSkill` already synthesizes worked demos |
| only-relevant skills at runtime | **SKILL-TASK-SUBSET** (shipped) + recall-on-demand |
| behavior in LoRA weights, no skill text | **not present** — this is the S2L-specific piece |

So the open piece is purely the **parameterized** half: train + serve per-skill LoRAs.

## Requirements & feasibility on Vanta's backends

- **API providers** (OpenAI / Anthropic / Gemini / OpenRouter): **infeasible** — no custom
  LoRA loading. S2L cannot apply to Vanta's default frontier path.
- **Ollama** (local default): supports adapters via a Modelfile `ADAPTER` directive, but each
  adapter is baked into a model variant — there is no efficient per-request hot-swap across
  many skills. Multi-skill dynamic activation is awkward/heavy. **Partial at best.**
- **vLLM** (what the paper used): real dynamic multi-LoRA serving. Vanta does **not** run
  vLLM today; adopting it is a new serving path (a new provider + ops surface).

Training cost: QLoRA per skill needs a PEFT/transformers/bitsandbytes stack + base weights +
GPU/MPS. The paper trained a 27B base on a server; on an M4 Pro (48GB) QLoRA is realistic for
small bases only, slow for 27B-class. One adapter **per skill** also means a training/versioning
pipeline keyed to skill edits.

## Risks (from the paper's own limitations)

- **Lossy** — the adapter learns the dominant behavior; rare edge cases / exact configs aren't
  fully retained (text recall covers these today, losslessly).
- **Interpretability** — behavior in weights is not inspectable like a `SKILL.md`.
- **One-skill-per-task** — no multi-skill composition; many real flows need several skills.
- **Plus:** robust to wrong-skill retrieval (degrades gracefully vs full-text prompting).

## Recommendation — **NO-GO for now** (revisit on two triggers)

The text-side wins already shipped (distill → worked demos, task-subset → only relevant skills,
recall-on-demand) capture much of S2L's token benefit **with zero training/serving infra and no
loss of inspectability or losslessness** — which fits Vanta's local-trusted-operator, mostly-API
posture. The LoRA route's prerequisites (a vLLM serving path; a per-skill QLoRA training
pipeline; local-only applicability) are a large, infra-heavy bet for a marginal token delta over
what's now in place.

**Revisit when both hold:**
1. Vanta gains a self-hosted serving path (vLLM or equivalent dynamic-LoRA backend), and
2. A measured ceiling shows text-side skill compression (distill + subset) is insufficient —
   i.e., the eval/CNG shows skills still cost too much or that distilled text underperforms.

**If GO is later approved**, the minimal first step is a *single-skill* spike: distill one stable
skill → QLoRA on a small local base → serve via Ollama `ADAPTER` → measure pass-rate vs the
distilled-text form (CNG). Do not build the multi-skill training/serving pipeline before that
single-skill result justifies it.
