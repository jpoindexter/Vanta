---
name: inclusive-design
description: The inclusive-design philosophy and practice — Microsoft's 3 principles + Persona Spectrum, the social model of disability as mismatch, and deep cognitive, neurodivergent, sensory, cultural, economic, and age inclusion patterns that go beyond WCAG conformance.
tags: [design-systems, inclusive-design, neurodiversity, cognitive, equity]
---

# Inclusive Design

Accessibility is the floor (a conformance outcome — see the `accessibility-and-inclusive-design` skill for WCAG 2.2 mechanics: contrast ratios, ARIA, keyboard, screen readers). **Inclusive design is the method** that gets you there and further: a way of working that recognizes who has been left out, designs deliberately for human diversity, and treats exclusion as a property of the *design*, not the person. This skill is the philosophy and the cognitive/neuro/cultural/economic practice. It does not repeat WCAG numbers — it tells you who you are excluding, why, and what to build instead.

## 1. Three definitions (don't conflate them)

| Term | Origin | What it is | Shape of the solution |
|---|---|---|---|
| **Accessible design** | WCAG / EN 301 549 / standards bodies | An *outcome*: the product meets defined criteria so disabled people can use it. Measurable, often legally required. | One product, audited against a checklist. |
| **Universal design** | Ronald Mace, NC State, 1985; 7 Principles | One solution that works for the widest range of people *without adaptation*. An ideal end-state. | One design, no variants. |
| **Inclusive design** | Microsoft Inclusive Design Toolkit; Kat Holmes, *Mismatch* (2018) | A *process*: design with human diversity as the input, often shipping **plural** paths so each person can self-select. | Many adaptable paths; the design flexes. |

The practical distinction: **universal design seeks the single ramp everyone uses; inclusive design accepts you may need a ramp *and* stairs *and* an elevator, and lets the person choose.** Accessibility is what you can be sued for; inclusion is what makes the product good. Aim for accessible as the non-negotiable baseline, design inclusively to exceed it.

Mace's **7 Principles of Universal Design** (NC State Center for Universal Design) are still a useful audit lens, even where you ship plural paths rather than one solution: (1) **equitable use** — same means for all where possible, equivalent where not; (2) **flexibility in use** — accommodate preferences and abilities; (3) **simple and intuitive** — independent of experience, language, or concentration level; (4) **perceptible information** — convey it redundantly (visual + verbal + tactile), not in one channel; (5) **tolerance for error** — minimize hazards of accidental action; (6) **low physical effort**; (7) **size and space for approach and use**. Read these as questions to ask of any screen.

## 2. The social model — disability as mismatch

The **medical model** locates disability in the body: the person is broken, fix the person. The **social model** (term coined by disability scholar Mike Oliver, 1983; rooted in the disability-rights movement) locates it in the **mismatch between a person and their environment**: a person using a wheelchair is not disabled by their legs but by the staircase. Change the environment and the disability disappears.

For designers this reframes everything: **you are the source of exclusion, and therefore you can remove it.** A signup form that rejects a hyphenated surname disables that user — the user is fine, the regex is wrong. Microsoft's phrasing: design creates **"mismatched interactions"** between a person's abilities and the product's demands. Your job is to find and close those mismatches.

## 3. Microsoft's three principles

From the **Microsoft Inclusive Design Toolkit**. Memorize and apply them in order.

| Principle | Meaning | In practice |
|---|---|---|
| **1. Recognize exclusion** | Every design choice includes some and excludes others. Bias toward your own abilities is invisible to you. Name who your default excludes. | "This drag-to-reorder excludes anyone who can't drag." "This idiom excludes literal and non-native readers." |
| **2. Solve for one, extend to many** | Design for a person with a permanent constraint, and the solution scales to everyone who shares that constraint *situationally or temporarily*. | Captions built for Deaf users serve everyone in a loud bar or silent train. One-handed flows built for an amputee serve a parent holding a baby. |
| **3. Learn from diversity** | People who experience exclusion are the experts on it. Bring them in as co-designers, not test subjects at the end. | Recruit disabled, neurodivergent, multilingual, low-bandwidth users into research *before* the design is locked. |

**"Solve for one, extend to many" worked end-to-end:** start with a **blind user** who can't see a "drag the photo here" uploader. Solve it — add a keyboard-operable file picker with a clear text label and status announcements. That same fix now serves a **motor-impaired** user who can't drag precisely (permanent), a user with a **trackpad failing** (temporary), and a user **on a phone with one thumb** (situational). One accessibility fix, four populations served. This is the inverse of the usual cost framing: inclusive solutions *compound* in reach.

## 4. The Persona Spectrum

The Toolkit's central tool: every "disability" exists as **permanent, temporary, and situational** variants. Designing for the permanent case automatically covers a vastly larger population in the temporary and situational columns. Microsoft's canonical example is the **one-arm** spectrum (amputee / arm injury / new parent holding a baby).

| Ability affected | Permanent | Temporary | Situational |
|---|---|---|---|
| **Touch / dexterity** | Limb difference, amputation | Broken arm, post-surgery | Holding a baby; carrying luggage; gloves in winter |
| **Sight** | Blind, low vision | Cataract, eye dilation, infection | Bright sun on a phone; driving; distracted by a child |
| **Hearing** | Deaf | Ear infection, temporary loss | Loud bar; quiet library; open-plan office without headphones |
| **Speech** | Non-verbal | Laryngitis, sore throat | Heavy accent on voice input; can't speak in a meeting |
| **Cognition / attention** | ADHD, autism, learning disability | Concussion, migraine, medication | Sleep-deprived; stressed; juggling tabs; intoxicated |

> Microsoft's own data: ~26,000 US adults have one arm permanently; ~13M experience a temporary version yearly; ~21M live the situational version (new parents). **Design for 26K, serve ~34M.** This is the business case for inclusion, not charity.

## 5. Cognitive accessibility (the most-neglected, highest-leverage area)

Cognition is the dimension WCAG addresses least and shipped products fail most. These accommodations help people with learning disabilities, brain injury, dementia, and — situationally — *every* stressed, tired, or distracted user. Map each cognitive function to a concrete UI move.

| Cognitive function | Who it affects | Build this | Avoid this |
|---|---|---|---|
| **Memory** (working + long-term) | TBI, dementia, ADHD, anyone under load | Persistent context; show entered data; don't re-ask (autofill); breadcrumbs; "you are here" | Multi-step flows that hide prior answers; codes to memorize between screens; cognitive-test logins |
| **Attention** | ADHD, autism, anxiety | One primary action per screen; remove auto-play, carousels, notification spam; clear focus on the task | Competing animations; interruptive modals; 6 equally-weighted CTAs |
| **Executive function** (initiation, sequencing, planning) | ADHD, autism, depression | Explicit next step ("Step 2 of 4: add address"); smallest first action; templates/defaults; visible progress | Blank-page starts; "configure your workspace" with no path; open-ended setup |
| **Processing speed** | Slow processing, fatigue, age | No/extendable time limits; let users go at their pace; chunk; allow review before commit | Countdown timers; auto-advancing content; "session expires" mid-task |
| **Language / literacy** | Dyslexia, low literacy, non-native | Plain language ~grade 8; short sentences; common words; front-load the action; define jargon on first use | Idioms, legalese, double negatives, walls of text |
| **Numeracy** (dyscalculia) | ~5% of people | Spell out numbers in words alongside digits; never make users do mental math; show running totals; format phone/card/dates *for* them | "Enter amount in cents"; unexplained units; user-computed totals; ambiguous date formats (`03/04`) |

**Concrete literacy & numeracy moves:** instead of *"Your subscription renews at the prevailing rate within the applicable billing cycle,"* write *"You'll pay $9 on the 1st of each month. Cancel anytime."* Instead of *"Enter quantity in units of 12,"* offer a stepper and show *"3 boxes = 36 items, $108 total"* computed for the user. For dyscalculia, never ask someone to subtract, convert units, or compare unlabeled numbers in their head — surface the result. Format account numbers, phone numbers, card numbers, and dates as the user types (`03 April 2026`, not `03/04`).

**Cross-cutting cognitive defaults:** progressive disclosure (reveal complexity only on demand); consistent placement and naming across pages (predictability is an accessibility feature); error *prevention* over error messages; forgiving undo; concrete language over metaphor. These reduce load for everyone — the curb-cut effect (§10) applies hard here.

## 6. Neurodiversity-first design

Neurodivergent users are not edge cases to tolerate — designing for them produces calmer, clearer products for all. Treat patterns and examples literally (the audience thinks that way), not as metaphor.

### ADHD — initiation, focus, time-blindness
- **Do:** show the single smallest next action; make starting frictionless (one click, pre-filled defaults); externalize state and progress (the UI is the working memory); give immediate feedback on every action; make time visible (elapsed/remaining, not implied).
- **Don't:** present a blank page with no entry point; bury the primary action among equals; rely on the user to remember where they were; use indefinite spinners with no sense of time; punish task-switching by losing draft state.

### Autism — predictability, literal language, sensory regulation
- **Do:** keep navigation, naming, and layout *identical* across the product; say exactly what a control does ("Delete this file permanently" not "Clean up"); state outcomes before they happen; offer control over sensory intensity (motion, sound, density, theme); make implicit social/UI conventions explicit.
- **Don't:** use idiom, sarcasm, or ambiguous microcopy ("Oops!", "Looks like…"); change UI between visits; auto-play sound/video; rely on unwritten conventions; force a single sensory experience.

### Dyslexia — reading and typographic load
- **Do:** generous line-height (~1.5) and paragraph spacing; left-align, ragged-right (never justified — rivers of whitespace disrupt tracking); short line length (~60–70 chars); high-legibility sans or a dyslexia-friendly face *as an option*; let users adjust text spacing; pair text with icons.
- **Don't:** justify text; use ALL CAPS for body; cram dense unbroken paragraphs; rely on text alone where an icon would help; use low-contrast grey body text (defer ratios to the a11y skill).

### Aphantasia — no mental imagery
- **Do:** show, don't ask users to imagine — render the actual preview (the email, the layout, the color swatch, the final state); use concrete examples and live previews over "picture how this will look"; provide before/after comparisons.
- **Don't:** describe a result and expect the user to visualize it; use "imagine…" framing as the only explanation; hide the outcome behind a mental-simulation step.

## 7. Sensory inclusion

Sensory load is a spectrum, not a binary. Some users seek minimal stimulation (autism, migraine, anxiety, sensory processing differences); the same patterns reduce fatigue for everyone.

- **Visual overload:** offer low-density / focus modes; reduce simultaneous motion, badges, and color noise; let users dim or theme the interface; avoid large saturated areas and strobing.
- **Motion:** honor the reduced-motion preference and give a pause control — *mechanics live in the a11y skill*. The inclusion point: motion can cause nausea, disorientation, and migraine, so motion must always be *opt-out-able* and never load-bearing for meaning.
- **Sound:** never auto-play audio; caption all speech; never make sound the *only* signal for an event (pair with visual + optional haptic); let users mute per-category.

## 8. Cultural, linguistic, economic, and age inclusion

### Cultural & linguistic
| Assumption (trap) | Reality | Build this |
|---|---|---|
| Names = first + last, Latin chars | Mononyms, multiple surnames, no family name, non-Latin scripts, hyphens, apostrophes | One "Full name" field, generous length, full Unicode; don't validate name "format" |
| Two binary genders | Non-binary, prefer-not-to-say, context-dependent | Make gender optional; provide an open or inclusive field; only ask if you truly need it |
| US address shape (state, ZIP) | No states; alphanumeric/no postal codes; varied order | Flexible address fields per country; never require "State" globally |
| Everyone reads left-to-right | Arabic, Hebrew, Farsi, Urdu read RTL | Use CSS logical properties; mirror layout, icons, and progress direction for RTL |
| Color means one thing | Red = danger (West) / luck (China) / mourning (parts of Africa); white = purity / mourning (East Asia) | Don't hard-code cultural meaning into color; pair with text/icon; localize semantics |
| Imagery is neutral | Photos signal who "belongs"; gestures, body parts, and symbols carry local meaning | Show diverse, representative people; vet icons/gestures per market |
| Formats are universal | Dates (`MM/DD` vs `DD/MM`), number separators, currency, units differ | Localize and label formats; show, don't make users guess |

### Economic & device inclusion
The "average" device is a mid/low-end Android on an intermittent network with a metered data plan — not a flagship on Wi-Fi.
- Budget for **low-end CPUs** (avoid heavy JS, long main-thread tasks); test on a throttled device, not just your laptop.
- Respect **slow/expensive networks**: small initial payloads, progressive loading, offline tolerance, no autoplay video, lazy media. Every megabyte is real money for someone on a per-MB plan.
- Don't gate core function behind the latest browser, big downloads, or constant connectivity. Degrade gracefully.

### Age inclusion (both ends)
- **Older users:** larger default targets and text; high legibility; plain labels over trendy icons; forgiving timing; conventional patterns over novel gestures; don't equate age with incapacity — design for declining vision/dexterity/working-memory without condescension.
- **Younger / lower-literacy users:** concrete language, visual reinforcement, simple flows, strong error prevention.

### Temporary & situational (everyone, sometimes)
Bright sun (needs contrast + large text), one hand busy (reachable one-handed flows), noisy or silent room (captions + visual signals), stress and divided attention (fewer steps, clear recovery). These are the situational columns of §4 — designing for them is designing for your whole user base on a bad day.

## 9. Inclusive defaults

The default state is where inclusion is won or lost — most users never open settings. **Ship the inclusive choice as the default, and make the *intense* version opt-in**, not the reverse.

| Default to | Make opt-in |
|---|---|
| Calm motion (respect the OS reduced-motion signal out of the box) | Rich animation |
| Sound off; visual + optional haptic signals | Auto-playing audio/video |
| Plain language and conventional patterns | Jargon, novel gestures |
| Generous targets, spacing, and legible type | Dense, compact layouts (offer as a mode) |
| Fields optional unless truly required; no gender/format gating | Extra demographic questions |
| Light *and* dark theme honoring the system preference | A single forced theme |

Defaults are a values statement: a product that defaults to autoplay, motion, and dense everything has decided whose comfort matters. Inclusive defaults cost nothing extra and protect the users least able to self-rescue.

## 10. The curb-cut effect

Named by **Angela Glover Blackwell** (*Stanford Social Innovation Review*, 2017), after the 1970s Berkeley disability activists who fought for sidewalk curb cuts. The cuts were built for wheelchair users — and now serve strollers, luggage, delivery carts, cyclists, and anyone with tired feet. **Solving for an excluded group disproportionately benefits everyone.**

| Built for (disability) | Everyone gets |
|---|---|
| Captions (Deaf) | Watching muted in public; learning a language; noisy/quiet rooms; searchable transcripts |
| Voice control (motor) | Hands-free use while driving or cooking |
| High contrast / large text (low vision) | Readability in bright sun, on small screens, when tired |
| Plain language (cognitive) | Faster comprehension for everyone under stress or time pressure |
| One-handed flows (limb difference) | Use while holding a coffee, a phone, or a child |

Use this as your pitch internally: inclusion is not a cost center, it is broad usability and market reach.

## 11. Co-design, research, and measurement

- **"Nothing about us without us"** (popularized as a disability-rights principle by **James Charlton**, 1998): don't design *for* excluded groups, design *with* them. Recruit disabled and neurodivergent people as paid co-designers and research participants, early and throughout — not as a final QA pass.
- **Inclusive research:** recruit beyond your default demographic; offer multiple participation modes (async, written, captioned, AT-friendly tooling); make consent and tasks plain-language; compensate fairly; never run a study your own product can't accommodate.
- **Measuring inclusion:** track task success and error/abandon rates *segmented* by assistive-tech use, language, device tier, and network; count accessibility/usability bugs by severity over time; instrument where excluded users drop off. If you can't see exclusion in your funnel, you'll keep shipping it.

## 12. Common exclusion traps

| Trap | Who it excludes | Fix |
|---|---|---|
| Name field assuming Western first/last, Latin-only, length-capped | Most of the world's naming conventions | One full-name field, Unicode, generous length, no format validation |
| Gendered or binary-only language/fields | Non-binary, trans, prefer-not-to-say users | Make optional; inclusive/open field; ask only if essential |
| Motion/animation with no opt-out | Vestibular disorders, migraine, autism | Respect reduced-motion + pause (mechanics → a11y skill); never load-bearing |
| Reading level too high; idioms and jargon | Low literacy, dyslexia, non-native, cognitive, stressed | Plain language ~grade 8; define terms; front-load the point |
| Hover-only reveals (menus, tooltips, actions) | Touch, keyboard, motor, screen-reader users | Make content reachable by tap/focus/click; hover is enhancement only |
| Time limits / countdowns / session timeouts mid-task | Slow processing, motor, cognitive, distracted users | Remove, extend generously, or warn-and-extend |
| Drag-only / gesture-only interactions | Motor, low-dexterity, situational (one hand) | Provide single-pointer button alternatives |
| Cognitive-test logins (memorize, transcribe, puzzle CAPTCHA) | Cognitive, memory, dyslexia | Allow paste/password managers, OTP, passkeys |
| Heavy payloads, autoplay video, latest-browser gating | Low-end devices, slow/metered networks, low income | Lean payloads, progressive/lazy loading, graceful degradation |
| Color/imagery with one hard-coded cultural meaning | Global and cross-cultural users | Pair color with text/icon; localize meaning and imagery |

**Working order for inclusion on any feature:** recognize who the default excludes → place them on the persona spectrum (permanent/temporary/situational) → choose a pattern that closes the mismatch → check cognitive, sensory, cultural, economic, and age dimensions → validate *with* excluded users → measure exclusion in the funnel. Conform to WCAG (a11y skill) as the floor; design inclusively to clear it.
