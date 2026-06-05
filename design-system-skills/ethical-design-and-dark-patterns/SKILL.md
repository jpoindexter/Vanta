---
name: ethical-design-and-dark-patterns
description: Reference-grade guide to ethical interface design and the recognized deceptive-pattern taxonomy (Brignull / deceptive.design × Mathur et al.) — every dark pattern with a concrete example and ethical fix, consent and privacy UX, attention ethics, honest-default frameworks, and the FTC/GDPR/DSA legal exposure that turns each pattern into liability.
tags: [design-systems, ethics, dark-patterns, privacy, consent]
---
# Ethical Design & Avoiding Dark Patterns

A "dark pattern" (Harry Brignull's 2010 coinage; the field now prefers **deceptive pattern**, and Brignull's reference library lives at **deceptive.design**) is an interface deliberately crafted to trick users into doing things they would not have chosen freely — spending more, sharing more, staying subscribed. They are not bad UX by accident. They are good UX turned against the user: the same craft that makes a flow feel effortless is pointed at extraction instead of service. Use this skill to recognize all of them, to refuse to build them, and to ship the honest alternative without losing the business goal.

How to use: when designing a flow, run each consequential moment (defaults, declines, costs, exits, consent, permissions) against §6's asymmetry rule. When auditing, name the pattern with its canonical term from §2, rate severity (§7), and cite the legal exposure (§8) — that converts "this feels manipulative" into a prioritized, defensible finding a PM and a lawyer both act on.

## 1. Why ethics is a design-system concern

Ethics lands in design systems because **systems codify defaults, and defaults shape behavior at scale.** A design system is the set of pre-made decisions a thousand screens inherit. Decide once that the "subscribe to marketing" checkbox component ships pre-checked, or that the destructive-confirm dialog styles "Cancel" as the loud primary button, and you have manufactured a dark pattern in every product that consumes the library — automatically, invisibly, forever.

- **Defaults are decisions made for the user.** ~95% of users never change a default (the "default effect" / status-quo bias). A pre-ticked box is a choice you made and attributed to them.
- **Components encode ethics.** Button hierarchy, toggle default states, banner layouts, and copy templates are where deception lives or dies. Govern them at the component level, not per-screen, or every team re-litigates it.
- **It is cheaper upstream.** One ethical `<ConsentBanner>` with symmetric Accept/Reject is cheaper than 200 teams each shipping a "Reject all" buried two clicks deep — and than the regulator who finds it.
- **Trust compounds; so does its loss.** A single discovered dark pattern ("I got auto-charged," "I can't cancel") is a churn-and-review-bomb event. The design system is the cheapest place to make the honest path the default path.
- **The designer is on the hook too.** "The PM asked for it" is not a defense the FTC, the public, or your own conscience accepts. Brignull built deceptive.design partly as a *hall of shame* so the people who ship these are named. As the person who controls the component defaults, you are the last line — log the objection, propose the honest variant, and escalate rather than ship silently.

> The test that drives this whole skill: **would I be comfortable explaining this design, out loud, to the user it affects?** If the honest explanation embarrasses you, it is a dark pattern.

### The cognitive levers dark patterns pull

Every deceptive pattern exploits a known, hard-wired bias. Naming the lever tells you both why it works and why it's unfair — it bypasses deliberate reasoning rather than informing it.

| Bias | What it is | Pattern that abuses it |
|---|---|---|
| Default effect / status-quo bias | ~95% keep whatever is pre-set | Pre-checked boxes, bad defaults, forced continuity |
| Loss aversion | Losses hurt ~2× more than equivalent gains please | Confirmshaming, streak anxiety, "you'll miss out" |
| Anchoring | First number seen frames all later judgment | Pressured selling, fake "was $99, now $49" |
| Scarcity heuristic | Scarce = valuable; act now | Fake low-stock, false countdowns |
| Social proof | We copy what others appear to do | Fake activity feeds, fabricated reviews |
| Cognitive load / decision fatigue | Tired users take the path of least resistance | Cookie-banner mazes, hidden costs at step 4 |

The same biases power *ethical* persuasion too — anchoring on a genuinely good deal, real social proof. The lever isn't the problem; **using it on a false premise, or to override the user's actual interest, is.**

### Encode the ethics into the system, not the screen

Because the design system is the leverage point, the controls below belong in the library and its governance — not in a per-team checklist nobody reads:

- **Ship honest component defaults.** Toggles and consent checkboxes default **off**. Confirm dialogs default focus to the *safe* action and never style the destructive/business-favorable option as the primary CTA. Banners ship with symmetric Accept/Reject.
- **Provide the ethical primitive so the dark one is the harder path.** A vetted `<ConsentBanner>`, `<CancelFlow>`, and `<PriceSummary>` mean the easy, paved road is also the honest one. Don't ship a component whose default configuration is a dark pattern.
- **Add a deception gate to design review.** Before a flow ships, run §7's checklist; a finding blocks the same way a contrast failure does. Keep an `ETHICS.md` log of patterns the team has rejected and why, so they aren't re-litigated.
- **Make refusal auditable.** When a stakeholder requests a dark pattern, the system-owner records the objection and the honest alternative offered. That paper trail protects users *and* the designer.

## 2. The deceptive-pattern taxonomy

Organized under the seven high-level categories from **Mathur et al. (2019, "Dark Patterns at Scale," Princeton — 11k shopping sites)**, with the leaf patterns named per **Brignull's deceptive.design** type library. This is the recognized canon; learn the names so you can flag a pattern precisely instead of saying "this feels gross."

| Category | Pattern (Brignull) | What it does | Concrete example | Ethical fix | Legal flag |
|---|---|---|---|---|---|
| **Sneaking** | Sneak into basket | Adds an item the user never chose | Travel site auto-adds insurance/seat-selection; user must un-add | Add nothing the user didn't pick; cross-sell is opt-in, unchecked | FTC §5; EU UCPD |
| Sneaking | Hidden costs / drip pricing | Fees revealed only at the last checkout step | $40 cart becomes $61 with "service fee" + "processing" at step 4 | Show the all-in price up front; itemize before payment | FTC junk-fee rule; CMA (UK) |
| Sneaking | Hidden subscription / forced continuity | A "free trial" silently rolls to paid; recurring charge undisclosed | "Free for 7 days" with no visible "then $29/mo," no reminder before charge | Disclose price + cadence pre-purchase; email before each renewal | ROSCA; FTC negative-option |
| **Urgency** | False countdown | A timer that resets or means nothing | "Offer ends in 09:58" that restarts on refresh | Use real deadlines only, or none | FTC (deceptive); EU UCPD |
| Urgency | Fake urgency / low-stock | Invented "selling fast" pressure | "Only 2 left!" on unlimited digital stock | Show real inventory or omit it | FTC; DSA Art 25 |
| **Misdirection** | Confirmshaming | Guilts the user out of declining | Decline link reads "No thanks, I don't want to save money" | Neutral decline: "No thanks" / "Maybe later" | EDPB 03/2022; FTC |
| Misdirection | Visual interference | Styling hides or de-emphasizes the honest choice | "Accept" is a bright button; "Decline" is grey low-contrast text | Equal visual weight for symmetric choices | DSA Art 25; EDPB |
| Misdirection | Pressured selling | Pre-selects the expensive option / nags toward upsell | Most-expensive plan pre-highlighted as "recommended" with no basis | Default to neutral; "recommended" must be honest and explained | FTC; UCPD |
| Misdirection | Trick wording / double negatives | Confusing phrasing flips the user's intent | "Uncheck if you do not want to not receive emails" | One clear affirmative statement per control | UCPD; FTC |
| **Social proof** | Fake activity / testimonials | Fabricated signals manufacture trust | "Sarah from Ohio just bought this" (random generator); paid 5-star reviews as organic | Use only real, verifiable activity and disclosed/earned reviews | FTC endorsement guides; review rules |
| **Scarcity** | Fake scarcity | Manufactured limited availability | "High demand — book now!" with no real constraint | Reflect true availability or remove the claim | FTC; UCPD |
| **Obstruction** | Roach motel / Hard to cancel | Easy to get in, deliberately hard to get out | One-click signup; cancel requires a phone call in business hours | Cancel as easy as subscribe; same channel, same clicks | FTC Click-to-Cancel; ROSCA |
| Obstruction | Price-comparison prevention | Blocks the user from comparing options | Bundles priced so per-unit cost can't be compared; no unit price | Show unit/comparable pricing; allow side-by-side | UCPD; CMA |
| **Forced action** | Forced registration | Demands an account to do a one-off task | Must create an account to check out or read an article | Offer guest checkout / progressive account creation | UCPD; usability law |
| Forced action | Gamification / grinding | Forces tedious or addictive labor to unlock value | Must invite 5 friends or log in 7 days to access a feature you paid for | Deliver paid value immediately; rewards optional, not gated | FTC (esp. minors) |
| **Nagging** | Nagging | Repeated interruption to push an unwanted action | "Enable notifications?" re-asked every session after "No" | Honor "No"; ask once, respect the answer | iOS/Android policy; UCPD |
| Sneaking | Bad defaults / preselection | Pre-checks the choice that benefits the business | "Subscribe to newsletter" / "Share my data with partners" pre-ticked | Ship every consequential box **unchecked**; user opts in | GDPR Art 4(11); *Planet49* |
| Misdirection | Bait-and-switch | Promises one outcome, delivers another | "Free upgrade!" click installs unwanted software | The action does exactly what its label promises | FTC §5; UCPD |
| Misdirection | Disguised ads | Ads styled as content or native controls | A fake "Download" button that is actually an ad | Label ads ("Sponsored"); never mimic UI controls | FTC native-ad guides |
| **Sneaking (privacy)** | Privacy Zuckering | Tricks users into oversharing personal data | Defaults set to "public"; "improve our service" buries data-broker sharing | Privacy by default; plain-language sharing, opt-in | GDPR Arts 5/25; CPRA |

### The four that cost the most — in prose

**Confirmshaming.**
*Pattern.* Guilt and manufactured loss-aversion are used to flip a "no" into a reluctant "yes."
*Violation.* A newsletter modal whose dismiss link reads "No thanks, I hate saving money," an unsubscribe asking "Are you sure? You'll miss out on exclusive deals 😢," or a delete-account flow captioned "We'll be heartbroken to see you go."
*Fix.* The decline must be as neutral, visible, and one-click as the accept — "No thanks" or "Not now," same prominence, no emotional loading, no sad mascot.
*Law.* The EDPB (Guidelines 03/2022) explicitly names emotional steering as deceptive design; the FTC treats it as §5 deception when it materially affects the choice.

**Hard to cancel (roach motel).**
*Pattern.* Easy to get in, deliberately hard to get out — effort asymmetry between joining and leaving.
*Violation.* Sign up in one click online, but to cancel you must call a number staffed 9–5, navigate a multi-screen "are you sure" retention gauntlet with discount bribes, and confirm by email. Amazon's "Iliad" Prime-cancel flow and Adobe's hidden early-termination fees are the canonical FTC targets.
*Fix.* Cancellation must use the **same medium and no more clicks than signup**. One-tap in-app signup means one-tap in-app cancel; one skippable retention offer maximum, never a wall.
*Law.* The FTC's **Click-to-Cancel rule** and EU consumer law require symmetric exit. "We made it annoying" is itself the violation.

**Forced continuity / hidden subscription.**
*Pattern.* A trial silently converts to a paid recurring charge the user didn't knowingly agree to.
*Violation.* A "free 7-day trial" that takes a card up front, rolls to $29/mo, sends no pre-charge reminder, and discloses the price only in grey 11px text below the fold.
*Fix.* State price **and** cadence before commitment ("Free for 7 days, then $29/month — cancel anytime"), email a reminder before each renewal, and let the user cancel the trial without re-entering a maze.
*Law.* ROSCA and the FTC negative-option rule require clear up-front disclosure and informed consent to the recurring charge.

**Cookie-banner trickery.**
*Pattern.* The consent UI is weighted so accepting tracking is trivial and refusing it is laborious or impossible.
*Violation.* A bright one-tap "Accept all" beside a buried, grey, or absent "Reject all" — forcing "Manage preferences → 47 vendor toggles → Confirm" to decline. Pre-checked "legitimate interest" toggles. Re-asking on every page after a refusal.
*Fix.* **"Reject all" must be as easy as "Accept all"** — same screen, same visual weight, one click. No pre-ticked non-essential boxes; essential cookies need no toggle. Remember the refusal.
*Law.* CNIL has fined exactly this asymmetry repeatedly (Google, Facebook, Amazon); *Planet49* (CJEU, 2019) killed pre-ticked consent outright.

### The next tier — recognize on sight

**Sneak into basket.**
*Violation.* A flight booking auto-adds travel insurance and priority boarding; the user must hunt for the "remove" link before paying.
*Fix.* Add nothing the user didn't choose. Cross-sells are presented as **unchecked** opt-ins next to the cart, never pre-added.

**Hidden costs / drip pricing.**
*Violation.* A $40 cart becomes $61 at step 4 of 5 with a "service fee," "processing fee," and "convenience charge" appearing only there.
*Fix.* Show the all-in price up front; itemize every fee before the user reaches payment, with no surprise additions after.

**Fake urgency & fake scarcity.**
*Violation.* A countdown timer that resets on refresh; "Only 2 left!" on unlimited digital stock; "12 people are looking at this right now" from a random generator.
*Fix.* Show real deadlines and real inventory, or show neither. A claim about urgency or availability must be true at the moment it's displayed.

**Bad defaults / preselection.**
*Violation.* "Subscribe to our newsletter" and "Share my data with partners" ship pre-ticked, riding the ~95% who never change a default.
*Fix.* Every consequential box ships **unchecked**; the user performs a clear affirmative act to opt in. (For consent this isn't optional — it's GDPR Art 4(11).)

**Trick wording / double negatives.**
*Violation.* "Uncheck this box if you do not want to not receive marketing emails." Confusing phrasing inverts the user's intent.
*Fix.* One clear affirmative statement per control, in the user's language: "Email me product updates." Never make the user parse a negation to protect themselves.

**Privacy zuckering.**
*Violation.* New posts default to "Public"; an "improve our services" toggle quietly authorizes selling data to brokers; the real sharing scope is three settings screens deep.
*Fix.* Privacy by default — most-protective setting shipped. Name third-party sharing in plain language and make it opt-in: "Sell my data to advertisers" is honest; "personalize my experience" is not.

**Disguised ads & bait-and-switch.**
*Violation.* A fake "Download" button that is actually an ad; a "Free upgrade!" that installs unwanted software; sponsored content styled identically to editorial.
*Fix.* The action does exactly what its label says. Ads are labeled "Sponsored" and never mimic native UI controls (FTC native-advertising guidance).

## 3. Consent & privacy UX

**Meaningful consent (GDPR Art 4(11) + Art 7).** Consent is valid only if it is **freely given, specific, informed, and unambiguous**, by a clear affirmative act.

| Requirement | Means | Dark-pattern violation |
|---|---|---|
| Freely given | No detriment for refusing; not bundled | "Accept cookies to read this" wall |
| Specific | Per-purpose, granular | One toggle for analytics + ads + brokers |
| Informed | Plain language, before the act | Consent buried in a 40-page ToS |
| Unambiguous | Active opt-in, no pre-ticks | Pre-checked boxes (illegal — *Planet49*) |
| Withdrawable | As easy to revoke as to give | "Email us to opt out" |

- **Reject-all parity.** If "Accept all" is one click, "Reject all" must be one click on the same surface, in equal visual weight. Asymmetry is the single most-fined consent dark pattern in the EU — CNIL has stated that making refusal harder than acceptance is itself the breach.
- **No bundling / no consent walls for the core service.** You cannot make access to the product conditional on consent the service doesn't actually need (GDPR Art 7(4)). "Agree to ad-tracking or you can't read this" is not freely given consent.
- **Data minimization (GDPR Art 5(1)(c)).** Collect only what the stated purpose needs. A flashlight app requesting contacts is a violation by design; the question is never "could this data be useful later" but "does *this* purpose require it now."
- **Just-in-time permissions + rationale.** Request a capability **at the moment of use, with a one-line why** ("To find restaurants near you, allow location"), not in a cold front-load at first launch. Higher grant rates *and* more honest — and if the user declines, the feature degrades gracefully rather than nagging.
- **Privacy by default (GDPR Art 25 — data protection by design and by default).** The most protective setting is the shipped setting. Sharing, public visibility, and personalization-tracking start **off**; the user opts *up* to more exposure, never has to claw *down* from a permissive default they never chose.
- **Transparency.** A readable, layered privacy summary (short version on top, full detail behind it), a working data-export and delete path, and no surprise third-party sharing. If a data broker is in the pipe, name it in plain language — "we sell this to X" is honest; "we may share with partners to improve your experience" is privacy zuckering.

**An honest cookie banner — concrete spec.** This is the component to bake into the design system so no team re-derives it:

- Two buttons, equal size and visual weight, side by side: **"Accept all"** and **"Reject all."** Both end the banner in one click.
- A third, lower-emphasis link: **"Customize"** → granular per-purpose toggles, all non-essential ones **off** by default.
- Essential/strictly-necessary cookies: stated as in use, **no toggle**, no consent sought (none is needed).
- Copy states *what* is collected and *why*, in one short paragraph, with a link to the full policy.
- The choice is **remembered** across pages and persisted; no re-prompting a user who already answered.
- No "legitimate interest" pre-ticks, no nag, no wall blocking the content behind consent the service doesn't need.

## 4. Attention ethics — persuasion vs. manipulation

Infinite scroll, autoplay, variable-ratio rewards, and streaks are **persuasive-technology** mechanics, several borrowed from slot machines (B.J. Fogg's Persuasive Tech Lab; Nir Eyal's "Hook" model). They are not automatically unethical — the same loop can serve the user or strip-mine them. The line is **whose goal the mechanic serves, and whether it survives daylight.**

| | Persuasion (ethical) | Manipulation (dark) |
|---|---|---|
| Serves | The user's own stated goal | The engagement metric, against the user's interest |
| Transparency | User would still agree if shown the mechanism | Depends on the user not noticing it |
| Exit | Easy to stop; provides natural stopping points | Engineered to remove every stopping cue |
| Reversibility | User can disable it and it stays off | Re-enables itself; resets on the user |

- **Infinite scroll** removes the natural "page bottom" stopping cue. Fine for a feed the user genuinely wants endless; a trap when it erases their ability to notice they're done. Provide pagination, a "you're all caught up" marker, or a session boundary.
- **Autoplay** the user can permanently disable is a convenience; autoplay with a re-enabling default and a 5-second "up next" countdown that's hard to stop is a trap. Default it off, or honor the off switch forever.
- **Streaks / variable-ratio rewards** are honest when they reward real value and forgive lapses (a missed day doesn't nuke a 200-day streak). They turn manipulative when engineered loss-aversion — "don't break your streak!" — drives anxious, compulsive return that the user resents afterward.
- **Notifications** are honest when they carry information the user asked for; manipulative when manufactured ("someone you may know joined") purely to re-engage. Batch, let users tune, and never invent an event to pull them back.
- **The persuasion/manipulation test:** if you showed the user the mechanic *and your intent behind it*, would they thank you or feel used? Build the time-well-spent dashboard, the "caught up" line, the usage summary — the affordances that hand control back — not the bottomless, ever-resetting pull.

## 5. Accessibility & inclusion as ethics

Excluding people is an ethical failure, not only a compliance gap. A dark pattern often hides **inside** an inaccessibility: a "Reject all" that is keyboard-unreachable, a confirmshame buried in an unlabeled control, a low-contrast decline link, a cancel flow that breaks for screen-reader users. These deny meaningful choice to exactly the users least able to fight back — visual interference *is* the deceptive pattern when the honest option is technically present but practically unreachable.

Inclusive defaults are the same discipline as honest defaults: make the right path work for *everyone*, by default — real `<label>`s, logical focus order, AA-or-better contrast on **both** options (not just the one the business wants chosen), respect for `prefers-reduced-motion`, and copy at a reading level your actual users share. Inclusion also means not exploiting cognitive load: children, the elderly, people in crisis, and the cognitively overloaded are disproportionately harmed by urgency and confusion tactics, which is why regulators weigh impact on vulnerable users heavily. See the `accessibility-and-inclusive-design` skill for the WCAG 2.2 AA floor.

## 6. Honest defaults, asymmetry, opt-in vs opt-out

The core ethical move is **asymmetry of effort: make the choice that benefits the user the easy one, and never make the user fight the interface to protect their own interest.**

- **Opt-in for anything that takes from the user** (data, money, attention, inbox). Opt-out is acceptable only for things that purely serve them and are trivially reversible.
- **Symmetric pairs get symmetric weight.** Accept/Reject, Subscribe/Cancel, Keep/Delete — equal prominence, equal click-cost. Reserve loud primary styling for the action the *user* most likely wants, never the one the business wants.
- **No pre-checked consequential boxes. Ever.** This is both an ethical rule and (for consent) the law.
- **Confirm destructive actions, but prefer undo.** A 5–10s "Undo" toast respects autonomy better than a nagging "Are you sure?" — and never style the safe option to look dangerous.

| | Do | Don't |
|---|---|---|
| Marketing opt-in | Unchecked box, clear label | Pre-checked "Send me offers" |
| Cancel flow | Same clicks as signup | Phone-only, retention maze |
| Cookie banner | Reject = Accept (1 click) | Buried "Manage → Confirm" |
| Decline copy | "No thanks" | "No, I hate saving money" |
| Permissions | Just-in-time + rationale | Front-loaded demand wall |
| Pricing | All-in up front | Fees dripped at step 4 |
| Trial → paid | Reminder email before charge | Silent auto-conversion |
| Urgency / stock | Real or omitted | Resetting timer, fake "2 left" |
| Reviews / activity | Real, verified, disclosed | Generated "Sarah just bought…" |
| Destructive action | Undo toast; safe = default | "Cancel" styled as the primary CTA |

**Ethical persuasion is still allowed — and encouraged.** None of this means a flat, optimization-free product. You may highlight a genuinely better plan, show *real* "23 people bought this today," offer a *real* limited-time deal, and design a delightful, frictionless happy path. The rule is narrow and absolute: the persuasion must rest on a **true premise** and must **serve a choice the user would still make if they fully understood it.** Optimize conversion by removing real friction and communicating real value — never by deceiving, hiding, shaming, or trapping.

## 7. Frameworks & tests

- **The explainability test.** "Would I be comfortable explaining this design, out loud, to the affected user?" If the honest explanation embarrasses you, it's a dark pattern. The fastest field check there is — run it on every default before you ship it.
- **Ethical-design checklist (per flow):** Is every consequential default off / unchecked? Is the decline as easy, visible, and one-click as the accept? Are all costs shown before commitment, not dripped at the end? Can the user exit / undo / cancel as easily as they entered? Is consent specific, informed, unbundled, and withdrawable? Is any urgency or scarcity claim *true*? Is any social-proof signal *real*? Does anything in the flow depend on the user **not noticing**? A "yes" to that last one fails the whole flow.
- **Value-Sensitive Design (Batya Friedman & colleagues).** Surface stakeholder values — autonomy, privacy, trust, dignity — as first-class design inputs alongside usability and conversion, *before* mechanics are chosen, so an ethical constraint isn't a late veto but an upstream requirement.
- **Regret minimization (the Bezos test, turned on the user).** Design so a user looking back is glad they used it — "that was easy and fair" — not "I got tricked into that charge / can't get my data back." Optimize for retained trust and lifetime value, not one-session conversion; the dark pattern usually wins the click and loses the customer.
- **The newspaper / hall-of-shame test.** Would this default survive a screenshot on the front page, or in Brignull's deceptive.design hall of shame? If shipping it depends on staying out of the press, don't ship it.
- **Deceptive-pattern severity (for audits).** Rate each finding on three axes — does it materially distort the choice, how reversible is the resulting harm, and how many users hit it? Fix the high-distortion / low-reversibility / high-reach findings first (e.g., a hidden-subscription default beats a slightly-pushy upsell). This turns an audit into a prioritized backlog, not a wall of complaints.

## 8. Legal exposure

Dark patterns are now actively litigated, not a grey area. The FTC, the EU, and US state regulators have each published that deceptive interface design is unlawful on its own terms — the defense "but everyone does it" fails explicitly, and "the user technically clicked agree" fails when the agreement was manufactured by the design. Enforcement is typically triggered by hidden charges, hard-to-cancel subscriptions, manipulated consent, and material misrepresentation; the remedies range from voided consent and forced refunds to percentage-of-global-revenue fines.

| Regime | Bans / requires | Mechanism & teeth |
|---|---|---|
| **FTC Act §5 (US)** | "Unfair or deceptive" practices | 2022 report *"Bringing Dark Patterns to Light"*; enforcement + consumer redress |
| **FTC Click-to-Cancel / ROSCA** | Cancel must equal signup; clear negative-option disclosure + consent | Targeted Amazon Prime, Adobe; civil penalties |
| **GDPR (EU)** | Valid consent (Art 4(11)/7), data minimization (5), privacy by default (25) | *Planet49* (CJEU 2019) — pre-ticked = invalid; fines up to 4% global turnover; CNIL cookie-banner fines |
| **EDPB Guidelines 03/2022** | Names deceptive design in social-media UIs (confirmshaming, hidden info, etc.) | Interpretive force across EU DPAs |
| **EU Digital Services Act — Art 25** | Online platforms may not deceive/manipulate via interface design | Fines up to 6% global turnover |
| **EU DMA** | Bars gatekeeper self-preferencing & manipulative defaults | Up to 10% global turnover (20% repeat) |
| **CPRA / CCPA (California)** | Consent obtained via a dark pattern is **not** consent | Defines "dark pattern" in statute; AG/CPPA enforcement; Colorado/Connecticut mirror it |

> Treat fine *figures* as illustrative — the load-bearing fact is the **mechanism**: a regulator can void your consent, force a refund, or fine a percentage of global revenue for a pattern your design system shipped as a default.

## 9. Common traps — quick reference

- **Confirmshaming copy** — "No thanks, I don't want to grow my business." → neutral decline, equal weight.
- **Forced registration** — account required for a one-off task. → guest checkout / progressive sign-up.
- **Nagging** — re-asking after a "No." → ask once, honor the answer.
- **Disguised ads** — ad styled as a control or content. → label "Sponsored," never mimic UI.
- **Hard cancellation** — phone-only / retention maze. → same channel & click-count as signup (now law).
- **Pre-checked marketing/consent** — illegal and corrosive. → ship unchecked; explicit opt-in.
- **Fake urgency / low-stock** — resetting timers, invented scarcity. → real deadlines or none.
- **Cookie-banner trickery** — "Accept all" loud, "Reject all" buried. → reject-all parity, no pre-ticks.
- **Dark-pattern defaults in the design system** — pre-checked toggles, "Cancel"-as-primary, drip-pricing layouts baked into shared components. → fix at the component, audit the library, not just the screen.
