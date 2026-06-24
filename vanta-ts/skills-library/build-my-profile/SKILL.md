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
- **The operator's OWN files** — when they grant disk/folder access ("scrape my hd", "use my Desktop", "u decide", or a named path), read THEIR OWN writing samples, bios, notes, and repo docs in scope. This is authorized own-data, not private-account scraping — it's the richest tone source, so USE it rather than retreating to public-only; just skip any secrets/keys/ID/payment files.
- **Public web** — `web_search` / `web_fetch` the operator's PUBLIC footprint (sites, repos, profiles) for durable facts. Public only.
- **The live conversation** — the operator's own messages are the best available tone sample.

**Try each source ONCE; skip failures, never re-fetch.** A source that 404s, times out, is empty, or is blocked (Cloudflare / bot-protection is common on the operator's own marketing site) is *unavailable* — note it once and MOVE ON to the next source. Re-hitting the same failed URL is the spinning failure mode this skill exists to avoid.

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
3. **Self-score, then CONVERGE — do not loop.** Make exactly ONE gathering pass over the authorized sources (skipping any that failed). Then score 0–10 against EACH goal: draft-in-voice, review-to-standard, recommend-purchases. The score is a READOUT, not a loop condition. If a goal is still below 9 after that pass, the gap needs the operator's own input (private writing samples, budget rules, the doc types they actually want reviewed) or an unavailable source — you cannot raise it by re-scraping, so DON'T. Name each remaining gap and ask for it once. A 6/10 with a clear, specific intake ask is a finished turn — not a reason to keep gathering or re-fetch a blocked URL.
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
