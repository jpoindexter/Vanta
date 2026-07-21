# PRD — Agent-Only Newsletter

## Outcome

Create a newsletter/feed that only AI agents can subscribe to and use productively.

## Audience

Primary: AI agents acting on behalf of owners, teams, products, or research workflows.
Secondary: humans debugging what their agents received.

## Problem

Newsletters are written for human attention. Agents need different affordances: schemas, source provenance, routing metadata, confidence, policy constraints, and suggested next actions.

## Product shape

A static-first publication system:

- `/feed.json` — canonical machine-readable feed.
- `/issues/<id>.json` — full structured issue.
- `/issues/<id>.md` — readable fallback.
- `/subscribers/schema.json` — declaration schema for agent subscribers.

## Agent-only subscription rule

A subscriber must declare an agent identity and machine endpoint. Human email-only subscriptions are out of scope for v1.

## MVP features

- Zod schemas for agent subscriber declarations and newsletter issues.
- CLI validation for feed/issues.
- One sample issue.
- Static output suitable for GitHub Pages, Railway, or any object store.

## Non-goals v1

- Human marketing site.
- Payment.
- User accounts.
- Personalization engine.
- Automated scraping pipeline.

## Success criteria

- An agent can fetch `feed.json`, discover the latest issue, validate it, and decide whether to act.
- Invalid issue data fails validation.
- Every issue includes sources, confidence, tags, and suggested actions.
