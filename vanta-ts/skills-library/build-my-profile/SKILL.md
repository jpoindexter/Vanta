---
name: build-my-profile
description: Build or update an organized operator profile in Vanta's brain so Vanta can draft in the operator's voice, review documents and websites to their standard, and recommend purchases by their criteria. Gathers ONLY from authorized sources (Vanta brain/memory, mounted vault, files the operator names, public web, the live conversation), self-scores sufficiency against those three goals, and saves to the user_model brain region. NEVER stores IDs, payment data, passwords, tokens, or secrets. Use when the operator says "learn about me", "build my profile", "remember everything about me", or asks Vanta to write in their voice or review to their standard.
created: 2026-06-24
updated: 2026-06-24
---
# Build My Profile

Turn scattered, authorized signal about the operator into ONE organized, durable profile in the brain, scoped to three jobs: draft in their voice, review documents and sites to their standard, and recommend purchases by their criteria. The profile is only as good as it is safe and grounded — gather from sources the operator actually authorized, never fabricate a preference, and never store a secret.

## Sources (authorized only)

- **Vanta brain + memory** — `recall` existing user_model / identity / preferences FIRST; build on it, don't duplicate.
- **Mounted vault / knowledge base** — `vault_search` (or equivalent) for notes about the operator: their person/entity note, builder profile, stated preferences.
- **Files the operator names** — read only the paths they point you at, in scope.
- **Public web** — `web_search` / `web_fetch` the operator's PUBLIC footprint (sites, repos, profiles) for durable facts. Public only.
- **The live conversation** — the operator's own messages are the best available tone sample.

NOT authorized — do not attempt: browser history, memories stored in other AI services, private accounts/inboxes without an explicit per-source grant, anything behind a login the operator has not handed you. "Scrape everything" is never the plan.

## Steps

1. **Inventory first.** `recall` what the brain already knows and search the vault. State the baseline before gathering more — never re-collect what is already saved.
2. **Gather by section** from authorized sources into a structured draft:
   - **Identity** — name, role, location (city is fine; street address only if the operator explicitly asks and accepts plaintext storage), languages, working setup.
   - **Voice & tone** — from real writing samples: sentence length, formality, signature phrases, what they cut (filler/hedging), punctuation and casing habits, how they open and close. Capture 3–5 falsifiable voice rules plus 2 short before/after rewrites.
   - **Relationships** — people and orgs they work with, and the relation (no contact secrets).
   - **Preferences & standards** — tools, stack, conventions, pet peeves, how they like work reported.
   - **Work / shipping style** — how they decide, scope discipline, what "done" means to them, approval thresholds.
   - **Purchasing criteria** — budget bands, must-haves and deal-breakers, brands trusted or avoided, when to ask vs proceed.
   - **Document / site review checklist** — what they check for, what makes them reject, their quality bar.
3. **Self-score sufficiency (the gate).** Score the draft 0–10 against EACH of the three goals: draft-in-voice, review-to-standard, recommend-purchases. If any score is below 9: name the specific gap, gather more from authorized sources, or ask the operator one targeted question. Loop until each goal is ≥ 9, or the operator says save it anyway.
4. **Save organized to the brain.** `brain remember` each section as its own user_model entry (one cohesive fact per entry, tagged) so it integrates with the brain's recall and scoring, and link related entries. Do NOT dump one giant blob, and do NOT silently overwrite — refresh existing entries.
5. **Report** what was saved, the per-goal scores, the gaps left, and what you deliberately refused to store.

## Constraints (hard)

- **The brain is plaintext and git-versioned, NOT encrypted.** Never store: government IDs, passport or license numbers, payment cards, bank/account numbers, passwords, API keys, auth tokens, or signature images. If the operator insists "it's encrypted, save it," refuse and state the storage reality — name is fine; address/phone only on explicit request with the plaintext caveat stated out loud.
- **Authorized sources only**, one private source at a time. Never scrape wholesale.
- **Never fabricate a preference.** If you did not observe it, mark it a gap and ask — do not infer a buying rule or a voice trait from nothing.
- **No autonomous external action.** This skill GATHERS and SAVES only; it never sends, buys, signs, or posts. Those stay approval-gated.
- **The three goals do not need sensitive data.** Drafting, reviewing, and recommending run on voice + preferences + criteria, not on IDs or contact details — so default to not collecting them.

## Report format

```
Profile saved → brain user_model: <n entries across N sections>
Scores vs goals: draft-in-voice X/10 · review-to-standard X/10 · recommend-purchases X/10
Gaps left: <what is still thin + the one question that closes each>
Refused to store: <any secret/ID the operator asked for + why>
```
