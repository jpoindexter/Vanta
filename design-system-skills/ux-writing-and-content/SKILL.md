---
name: ux-writing-and-content
description: Reference-grade guide to UX writing and content design — voice and tone systems, every UI string type with before/after examples, terminology consistency, inclusive language, and localization readiness for any screen.
tags: [design-systems, ux-writing, content, microcopy, voice]
---

# UX Writing & Content Design

Content is not decoration applied after the design. In most interfaces the words *are* the interface — a button is its label, an error is its sentence, an empty state is its paragraph. You can ship a beautiful screen with no working logic, but you cannot ship a screen with no words. Content design is the discipline of making those words clear, useful, and consistent so the product is understandable, trustworthy, and usable.

This skill is for senior designers and engineers writing any string a user reads. Treat it as the content bible: rules, patterns, and concrete examples you can apply on any screen today.

## Why content is design

- **Words are the interface.** Users don't see your component tree; they read labels and act on them. Ambiguity in a label is a usability bug, not a copy preference.
- **Content-first / content-out design.** Design from the message outward. Draft the real strings before the layout — they tell you how much space you need, where the hierarchy is, and whether the flow makes sense. Lorem ipsum hides problems; real content surfaces them.
- **Microcopy has outsized impact.** The smallest strings — button labels, error lines, field hints — sit at the highest-stakes moments (paying, deleting, signing up). A clearer button can lift conversion; a blaming error can lose a user. Effort per word is inverted: spend the most on the shortest, most-seen strings.
- **Content carries trust.** Vague, jargon-filled, or evasive copy reads as a product that's hiding something. Plain, specific, honest copy reads as competence.

## Voice vs tone

**Voice is constant — it's the brand's personality.** It does not change between screens. **Tone varies by context** — the same voice sounds different in an error than in a celebration.

| | Voice | Tone |
|---|---|---|
| Changes? | No — one per product | Yes — shifts by moment |
| Source | Brand personality | User's emotional state |
| Example | "Plain-spoken, warm, never condescending" | Calm + brief in an error; light + encouraging in onboarding |

**Build a voice chart** so a team writes consistently. For each trait, state what you *are* and what you are *not*, with a concrete example:

| We are | We are not | Sounds like |
|---|---|---|
| Clear | Clever | "Your card was declined." not "Hmm, that didn't go through!" |
| Confident | Arrogant | "We saved your draft." not "We went ahead and saved that for you." |
| Warm | Cute | "Welcome back." not "Heyyy you 👋👀" |
| Concise | Curt | "Enter a valid email." not "Wrong." |

**Tone in moments of stress.** When something breaks, a payment fails, or data is at risk, drop personality and get plain. Humor and brand voice belong in low-stakes moments (empty states, success). The rule: *the higher the stakes or stress, the plainer the tone.* Never joke in an error a user can't fix.

**Register** is formality level. Match it to context and audience — a developer tool can say "deploy" and "env var"; a consumer banking app should not. Keep register consistent within a surface.

## Principles

1. **Clear over clever.** If a user has to pause to decode a pun, it failed. Clarity is the non-negotiable; wit is optional and only in safe moments.
2. **Concise — cut filler.** Remove "please," "simply," "just," "in order to," "you can now," and hedges. Every word earns its place.
3. **Useful.** Tell the user what to do next, not just what happened.
4. **Human.** Write like a competent person talking, not a system emitting status.
5. **Consistent.** Same concept → same word, every time (see terminology).
6. **Plain language.** Short words, short sentences, one idea per sentence. Target a grade 7–9 reading level for general audiences; lower for high-stress moments.
7. **Front-load key info.** Put the most important word first — users scan, they don't read. "Delete project?" beats "Are you sure you want to delete this project?"
8. **Active voice, second person.** "You deleted the file" / "We couldn't save your changes," not "The file was deleted" / "Changes could not be saved."
9. **Scannability.** Use sentence fragments for labels, lead with verbs for actions, break walls of text into bullets.

## UI string types

### Buttons & CTAs
Verb-led and specific. The label should describe the action's *outcome*, so it reads correctly out of context (screen readers announce it alone).

| Don't | Do | Why |
|---|---|---|
| Submit | Create account | Names the result |
| OK | Got it / Delete | "OK" is ambiguous in confirmations |
| Yes / No | Discard / Keep editing | Self-describing, no question dependency |
| Click here | View invoice | Action + object |

### Labels
Sentence case, noun-led, no colon needed in most UI. Describe the field's content, not instructions ("Email address," not "Enter your email here"). Keep labels persistent — never use a placeholder as the only label.

### Headings
Front-load the topic. State, don't tease. "Billing history" not "Here's where you can see your billing." Match heading to the task on the screen.

### Helper text
Short guidance under a field for format or constraints. "We'll never share this." / "8+ characters, 1 number." Always visible, not just on error.

### Placeholders
Hints, not labels — they vanish on input and fail accessibility as the sole label. Use for format examples only.

| Don't | Do |
|---|---|
| Placeholder "Email" as the only label | Label "Email", placeholder "name@company.com" |
| Placeholder "Search" with no label | Visible/assistive label "Search", placeholder "Search invoices" |

### Tooltips
For secondary, non-essential clarification. Never hide critical info in a tooltip (not keyboard/touch reliable). Keep to one short phrase.

### Empty states
Explain why it's empty and give the next action. Make them onboarding moments, not dead ends.

> Don't: "No items."
> Do: "No invoices yet. Invoices appear here after your first payment. [Create invoice]"

### Error messages
The highest-impact strings. Always answer three things: **what happened, why, and how to fix it.** No blame, no jargon, no raw codes (move codes to a secondary line for support).

| Don't | Do |
|---|---|
| Oops! Something went wrong. | We couldn't save your changes. Check your connection and try again. |
| Invalid input. | Enter a valid email, like name@company.com. |
| Error 0x80004005 | We couldn't connect. Try again, or contact support with code 0x80004005. |
| You entered the wrong password. | That password doesn't match. Reset it if you've forgotten it. |

Never blame the user ("you failed to…"). Make the system own the problem and point to the fix.

### Success & confirmation
Confirm the specific thing, briefly. "Changes saved." "Invoice sent to maria@acme.com." Avoid generic "Success!" with no object. Don't over-celebrate routine actions.

### Loading
Set expectation and, if possible, progress. "Loading your dashboard…" beats a bare spinner with no label. For long waits, say what's happening and roughly how long.

### Notifications & toasts
One line, action-first, dismissible. Include an action if one is sensible ("Draft saved. Undo"). Don't toast routine, expected outcomes — reserve for things the user should notice.

### Onboarding
Lead with the user's benefit, not feature tours. One idea per step. Encouraging tone, no pressure. Let users skip.

### Permissions & dialogs
Say *why* you need it, right before you need it. "Allow camera access to scan receipts." Not "App wants to use your camera." Request in context, not all at once on launch.

### Dangerous-action confirmations
Name the consequence and make it irreversible-aware. The destructive button states the action; the safe option is the default focus.

> Don't: "Are you sure? [OK] [Cancel]"
> Do: "Delete 'Q3 report'? This permanently deletes the file and its 12 comments. You can't undo this. [Delete report] [Keep]"

Avoid OK/Cancel — users misread which is destructive. Label both buttons with their actual outcomes.

### 404 / offline / system errors
Plain, calm, with a way out. "This page doesn't exist. [Back to dashboard]" / "You're offline. We'll retry when you reconnect." No cute mascots in place of an exit.

## Terminology consistency

One concept, one word — forever. "Folder" in one screen and "directory" in another is a bug. Maintain a **content glossary / term bank**: approved term, definition, banned synonyms, and capitalization.

- **Naming features:** name for what the user does, not internal codenames. Test the name in a sentence: "Open [name]."
- **Sentence case vs Title Case:** the modern default is **sentence case** for UI (headings, buttons, labels, menus). It's easier to read, more humane, scales across languages (Title Case rules don't translate), and avoids "Which Words Do I Capitalize" inconsistency. Reserve Title Case for proper nouns and brand/product names.
- **Numbers:** numerals in UI ("3 items," not "three items") for scannability; spell out only at the start of a sentence in prose.
- **Dates & times:** be unambiguous — avoid "03/04" (region-dependent). Prefer "4 Mar 2026" or relative time ("2 hours ago"). Respect the user's locale and time zone.
- **Units:** space between value and unit where the locale expects it; localize units (km/mi, °C/°F).
- **Truncation & i18n length:** design for strings that wrap or truncate gracefully; never assume English length.

## Inclusive & accessible language

- **Avoid idioms and culturally specific metaphors** — "ballpark," "piece of cake," "home run" don't translate and confuse non-native readers.
- **Bias-free language.** Replace loaded technical terms with neutral ones (allowlist/blocklist, primary/replica, placeholder). Avoid assumptions about gender, ability, family, or background.
- **Gender-neutral.** Use "they," or rewrite to second person ("you"). Avoid "he/she."
- **Person-first vs identity-first:** default to person-first ("person with a disability") but respect community preference where it's identity-first (e.g., "autistic person," "Deaf person"). When unsure, follow the community's stated preference.
- **Reading level.** Lower it in high-stress flows (errors, medical, financial). Short words reduce cognitive load for everyone, including non-native speakers and people with dyslexia.
- **Alt text.** Describe the image's *function or meaning* in context, not "image of." Decorative images get empty alt (`alt=""`). Be concise; don't restate adjacent visible text.
- **Screen-reader-friendly labels.** Buttons and links must make sense read alone — "Read more about pricing," not "Read more." Icon-only controls need accessible names ("Close," "Search").

## Localization readiness

Write so the product can ship in other languages without rework.

- **No string concatenation.** "You have " + n + " items" breaks grammar in most languages. Use full, parameterized templates: `{count} items selected`.
- **Allow text expansion.** Translated strings run **30–40% longer** than English (German, Finnish more). Don't pin layouts to English length; let buttons and labels grow.
- **No text baked into images.** It can't be translated and fails screen readers. Keep text in the DOM/layer.
- **ICU message format for plurals/gender.** Don't hand-roll "1 item / 2 items" — many languages have several plural forms. Use ICU: `{count, plural, one {# item} other {# items}}`.
- **RTL support.** Arabic/Hebrew mirror the layout; don't hardcode left/right — use logical start/end and test mirroring.
- **Avoid locale-bound formats in strings.** Format dates, numbers, and currency through the locale layer, not in copy.

## Process

- **Content patterns in the design system.** Document standard strings (empty states, errors, confirmations) as patterns next to components, so the right copy ships by default — not reinvented per screen.
- **A UX-writing style guide.** Single source for voice chart, term glossary, casing rules, do/don't examples. Keep it living and enforced in review.
- **Content review.** Review strings like code — in the design and in the build. Catch jargon, blame, inconsistency, and missing states (loading/empty/error) before ship.
- **Work with research.** Test copy with real users — comprehension and findability beat opinion. The word users actually say for a thing should be the word in the UI.
- **Collaborate early.** Content design belongs in the wireframe stage, not as a final polish pass. Drafting real strings reshapes the design.

## Common mistakes

- **OK/Cancel ambiguity** in confirmations — users can't tell which is destructive. Label buttons with their real actions.
- **"Oops, something went wrong."** Says nothing, fixes nothing, and erodes trust. Always give what/why/how.
- **Jargon and system-speak** ("authentication token expired") instead of user language ("Your session ended — sign in again").
- **Placeholder as the only label** — disappears on input, fails accessibility, increases errors.
- **Clever over clear** — puns and wordplay in functional or high-stress copy.
- **Inconsistent terms** — "folder"/"directory," "remove"/"delete"/"discard" used interchangeably.
- **Blaming the user** — "You entered an invalid…" Make the system own it.
- **Walls of text** — dense paragraphs where bullets or a single sentence would do. Cut, chunk, scan.
- **Title Case Everywhere** — harder to read, inconsistent, untranslatable. Default to sentence case.
- **Missing states** — designing only the happy path and forgetting empty, loading, error, and offline copy.

## Quick checklist

- [ ] Real strings drafted before layout (no lorem ipsum)
- [ ] Buttons are verb-led and specific; no bare OK/Submit
- [ ] Errors say what happened, why, and how to fix — no blame, no raw codes
- [ ] Empty, loading, success, and offline states all have copy
- [ ] One term per concept, checked against the glossary
- [ ] Sentence case for UI; numerals for counts; unambiguous dates
- [ ] No idioms; gender-neutral; person/identity-first per community
- [ ] Labels persistent (not placeholder-only); icon controls have accessible names
- [ ] No concatenation; templates parameterized; layout tolerates +40% length
- [ ] Plurals via ICU; no text in images; RTL-safe
