---
name: laws-of-ux-and-psychology
description: Reference-grade catalogue of the attributed cognitive laws behind interface design (Fitts, Hick-Hyman, Miller, Jakob, Tesler, Postel, Doherty, Peak-End, and the behavioral-econ cluster) — each with origin, a concrete UI application, the design rule, and the pitfall.
tags: [ux, psychology, cognition, laws-of-ux, principles]
---
# Laws of UX & Cognitive Principles

These are not style opinions. Each "law" is a named finding from perceptual psychology, cognitive science, or behavioral economics that constrains how *every* human uses *every* screen — desktop, mobile, watch, voice, kiosk. Jon Yablonski's *Laws of UX* (lawsofux.com, 2020) collected the design-facing subset; the originals trace to the researchers credited below. Cite the source when you invoke a law in a design review — "this fails Fitts" lands harder than "the button feels small."

Read each law as a fixed five-part block: **Origin** (who/when), **Principle** (the mechanism, with the math where it exists), **In the UI** (one concrete control or screen), **Implication** (the general rule you derive), **Pitfall** (the failure mode). Keep "In the UI" and "Implication" distinct: the first is an example, the second is the rule.

The laws also *combine* — most good interactions satisfy several at once and most bad ones violate a cluster. A fast, optimistic submit serves Doherty *and* Flow; a forgiving, system-parsed input field serves Postel *and* Tesler *and* Recognition-over-recall. When two laws appear to conflict (Hick says fewer choices, but Jakob says match the conventional five-tab bar users expect), Jakob usually wins for plumbing and Hick for content — convention is a learned default that costs nothing, novelty is the expensive part.

---

## 1. Targeting & decision laws (the geometric ones)

### Fitts's Law
- **Origin:** Paul Fitts, 1954. Formalized in *The information capacity of the human motor system*.
- **Principle:** Time to acquire a target = `T ≈ a + b·log₂(2D/W)`, where `D` = distance to target, `W` = target width along the motion axis. Acquisition time grows *logarithmically* with distance and *shrinks* as the target gets bigger. Doubling size helps far more than the formula's modest log on distance suggests in dense UIs.
- **In the UI:** A primary CTA rendered 48px tall and placed near the user's current focus is hit fast; the same action as a 16px text link in a far corner is slow and error-prone. Screen *edges and corners* have effectively infinite width (the pointer stops dead) — macOS menu bar, Windows Start corner, the right-click context menu spawned *at* the cursor (`D≈0`).
- **Implication:** Make important, frequent targets big and near. Anchor destructive or rare targets far and small. Exploit edges, corners, and the pointer's own position for the loudest actions.
- **Pitfall:** Tiny icon-only buttons crammed together (toolbar of 24px glyphs at 4px gaps) — every click is a coin-flip. Also: a big *visual* button with a small *hit area* (padding outside the clickable region) silently breaks the law.

### Hick's Law (Hick-Hyman Law)
- **Origin:** William Edmund Hick **and** Ray Hyman, 1952 — independent papers, jointly named. Don't drop Hyman.
- **Principle:** Decision time rises logarithmically with the number of equally-probable choices: `RT = b·log₂(n + 1)`. Each doubling of options adds a roughly constant slice of deliberation, not a linear pile.
- **In the UI:** A checkout with one obvious "Pay" button decides instantly; a settings page dumping 40 toggles at once stalls the user. Chunking the 40 into 6 labeled groups, or revealing advanced options behind a disclosure, restores speed.
- **Implication:** Reduce or *categorize* choices. Use progressive disclosure, smart defaults (a pre-selected sensible option removes the decision entirely), and grouping. Highlight a recommended path so the user can skip the comparison.
- **Pitfall:** Over-applying it into death-by-wizard — splitting one coherent choice across ten one-question screens adds navigation cost and hides context. Hick's targets *count and grouping*, not "fewer screens always."

---

## 2. Memory & cognition laws

### Miller's Law
- **Origin:** George A. Miller, 1956, *The Magical Number Seven, Plus or Minus Two*.
- **Principle:** Working memory holds ~7±2 **chunks**, not items. The number is about *units of meaning*, and a chunk can be large (a familiar acronym, a grouped phone segment). **Nuance/myth:** "7" is widely misquoted as a hard cap on menu items or nav links — it is not. Cowan's later work (2001) refines the real span to ~4 chunks. The usable lesson is *chunk and group*, not "never exceed seven."
- **In the UI:** A phone number shown as `+1 (415) 555-0132` is four chunks and trivially held; `+14155550132` is twelve digits and slips. Card numbers grouped in 4s, OTP fields in segments, nav grouped into labeled sections.
- **Implication:** Format and group information into meaningful chunks so the user holds a structure, not a stream. Don't make the user keep facts in their head across steps — show them on screen (recognition over recall, §5).
- **Pitfall:** Citing "7±2" to justify capping a menu at seven links, or worse, padding to seven. Navigation breadth is governed by scanability and labeling, not this number.

### Jakob's Law
- **Origin:** Jakob Nielsen, 2000.
- **Principle:** Users spend most of their time on *other* sites and apps. They form mental models from the aggregate, and they expect *yours* to work the same way. Familiarity is transferred expectation.
- **In the UI:** A logo top-left links home; a magnifying glass means search; a cart icon top-right holds purchases; underlined blue-ish text is a link. Users "know" your product before they see it because they've used a thousand like it.
- **Implication:** Honor conventions for anything the user didn't come to admire — navigation, controls, icons, gestures. Innovate on your *core value*, not on where the back button lives. When you must break a convention, make the new pattern obvious and cheap to learn.
- **Pitfall:** "Reimagining" the scrollbar, hijacking the back gesture, or inventing a novel hamburger-replacement to look fresh. Novelty in plumbing is a tax the user pays on every visit.

### Von Restorff Effect (Isolation Effect)
- **Origin:** Hedwig von Restorff, 1933.
- **Principle:** When multiple similar objects are present, the one that *differs* is the most likely to be noticed and remembered.
- **In the UI:** On a row of grey secondary buttons, one filled accent "Continue" owns attention. A pricing table's "Most popular" tier lifted, bordered, and badged is the one people recall and pick.
- **Implication:** Make the single most important element visually distinct — and *only* it. Distinctiveness is a scarce resource spent on one focal point.
- **Pitfall:** Emphasizing everything (three "primary" buttons, five highlighted plans) — when all stand out, none does. Beware relying on color alone for the distinction (fails for colorblind users; pair with shape/weight/label).

### Serial Position Effect
- **Origin:** Hermann Ebbinghaus (memory curve work, 1880s–1900s); primacy/recency formalized in the serial-position literature thereafter.
- **Principle:** Items at the **start** (primacy) and **end** (recency) of a series are recalled best; the middle sags.
- **In the UI:** Put the most important nav items first and last in a top bar; the throwaway middle holds lower-stakes links. The last step of a flow and the first impression carry disproportionate memory weight.
- **Implication:** Anchor high-value items to the ends of any sequence — nav, lists, onboarding steps, menus. Don't bury the key action in the middle of a long list.
- **Pitfall:** Alphabetical or arbitrary ordering of a critical menu, dropping your most-used action into position 6 of 11 where it's least remembered and least scanned.

---

## 3. Complexity & robustness laws (system-side)

### Tesler's Law (Conservation of Complexity)
- **Origin:** Larry Tesler, Xerox PARC, early 1980s.
- **Principle:** Every application has an irreducible amount of inherent complexity. The only question is **who absorbs it** — the system/engineer, or the user. It cannot be deleted, only relocated.
- **In the UI:** An email "To:" field that accepts a raw address, a pasted name, *or* a contact pick — the app does the parsing so the user doesn't format anything. Date pickers that read "next friday." Shipping forms that derive city/state from a ZIP.
- **Implication:** Push complexity *into the system*. Do the parsing, the inference, the defaulting, the validation server-side so the user's surface stays simple. Engineering effort is the right place for the cost to land.
- **Pitfall:** "Just make the user enter it in the exact format" — exporting your parsing complexity onto every user, every time. Equally wrong: hiding *necessary* complexity so far that power users can't reach it.

### Postel's Law (Robustness Principle)
- **Origin:** Jon Postel, 1980, RFC 760/761 (and 793): "be conservative in what you send, liberal in what you accept."
- **Principle:** Be liberal in what you *accept* as input, conservative in what you *emit*. Tolerate variation at the boundary; produce clean, predictable output.
- **In the UI:** A phone field that accepts `415-555-0132`, `(415) 555 0132`, or `4155550132` and normalizes on submit. Search that forgives typos. Forms that trim whitespace and case-fold emails silently.
- **Implication:** Forgive the user's input format; never reject for cosmetics you could clean yourself. Reserve hard validation for genuine ambiguity, and explain it precisely when you must.
- **Pitfall:** Over-liberalism that swallows real errors (accepting a malformed email so the user never gets the receipt). Robustness means *forgive formatting*, not *accept garbage*.

---

## 4. Time, motivation & memory-of-experience laws

### Doherty Threshold
- **Origin:** Walter J. Doherty **and** Arvind J. Thadani, IBM, 1982.
- **Principle:** When system response drops below **400ms**, the human and machine enter a tight feedback loop and *productivity jumps* — users stay in flow and even do more than asked. Above ~400ms, attention drifts and the experience feels like waiting.
- **In the UI:** Keep interactions under 400ms. Where the real work is slower, fake the speed: **optimistic UI** (show the liked state instantly, reconcile later), **skeleton screens** instead of spinners, instant input echo, prefetch on hover/intent.
- **Implication:** Treat perceived performance as a first-class feature. Respond to *every* input within 100ms even if only to acknowledge; complete or progress-indicate within 400ms wherever possible.
- **Pitfall:** Blocking the UI on a network round-trip with a bare spinner, or animating a transition so long (600ms+) it re-introduces the wait you optimized away. Eye-candy that costs latency is a regression.

### Goal-Gradient Effect
- **Origin:** Clark Hull, 1932 (animal-learning studies). Applied to consumers as **endowed progress** by Kivetz, Urminsky & Zheng, 2006.
- **Principle:** Motivation to reach a goal *increases* the closer one is to it. The "endowed progress" refinement: artificial early progress (a punch card pre-stamped twice) accelerates completion versus an empty start.
- **In the UI:** Progress bars and steppers that fill as the user advances. A profile-completion meter at "60%" pulls people to 100%. Onboarding that pre-checks the steps they've already done so they start "ahead."
- **Implication:** Show progress, and front-load a sense of advancement. Break long flows into a visible track so each step feels like nearing the finish.
- **Pitfall:** A progress bar that lies or resets (jumping back, an extra surprise step after "100%") destroys trust — the gradient pulls them in, the lie throws them out.

### Zeigarnik Effect
- **Origin:** Bluma Zeigarnik, 1927.
- **Principle:** People remember *incomplete* or interrupted tasks better than completed ones — open loops nag at working memory.
- **In the UI:** A "3 of 5 steps complete" onboarding checklist, a half-filled profile prompt, an empty cart badge — each open loop draws the user back. Inbox unread counts exploit it (sometimes abusively).
- **Implication:** Use visible incompleteness to motivate return and continuation — checklists, setup progress, saved drafts. Make the open loop closable in one obvious action.
- **Pitfall:** Manufacturing endless open loops (permanent badges, never-finishable checklists) breeds anxiety and notification fatigue. The effect is a nudge, not a leash.

### Peak–End Rule
- **Origin:** Daniel Kahneman and colleagues, ~1993 (Redelmeier & Kahneman colonoscopy study; Fredrickson & Kahneman).
- **Principle:** People judge an experience largely by its most intense moment (the **peak**, good or bad) and its **end** — not by the sum or average of every moment.
- **In the UI:** Invest in the high points (a delightful first success, a celebratory "shipped!" moment) and the endings (the post-purchase confirmation, the empty state after completing a task). A graceful, well-recovered error can become a positive peak.
- **Implication:** Map the journey's peaks and its ending, and design those deliberately. A smooth average with a frustrating finish is remembered as frustrating.
- **Pitfall:** Polishing the mid-funnel while the *end* is an abrupt blank page or a dead-end error. Optimizing the average and neglecting the two moments that actually get encoded.

### Aesthetic–Usability Effect
- **Origin:** Masaaki Kurosu and Kaori Kashimura, Hitachi, 1995 (ATM-layout study).
- **Principle:** Users *perceive* more aesthetically pleasing designs as more usable — and are more tolerant of minor usability problems in them.
- **In the UI:** A clean, well-typeset, harmonious interface earns trust and patience; users forgive small frictions and rate it easier even when task-time is identical to an ugly one.
- **Implication:** Visual quality is functional — it buys credibility, trust, and forgiveness. Don't dismiss polish as "just cosmetics"; it changes measured perception.
- **Pitfall (the risk):** Beauty *masks* real usability problems — in testing, a pretty prototype hides flaws users would report in a plain one. Test with realistic visuals *and* probe for issues the gloss is hiding; never let aesthetics substitute for actual task success.

---

## 5. Cognitive load, attention & focus

### Cognitive Load Theory
- **Origin:** John Sweller, 1988.
- **Principle:** Working memory has limited capacity, split three ways: **intrinsic** (inherent difficulty of the task), **extraneous** (load added by *how* it's presented — clutter, jargon, bad layout), and **germane** (effort that builds useful understanding). You can't lower intrinsic load, but you must minimize extraneous to leave room for the task.
- **In the UI:** Strip extraneous load: remove decorative noise, reduce field count, use plain labels, chunk content, defer non-essential controls. Reserve the user's capacity for the actual decision.
- **Implication:** Audit every screen for extraneous load and cut it. Match information density to the task's intrinsic difficulty; add scaffolding (germane) only where it genuinely aids learning.
- **Pitfall:** Confusing "minimal" with "low-load" — hiding essential controls *raises* load (now the user hunts). Load is about clarity and chunking, not pixel-emptiness.

### Selective Attention / Inattentional Blindness (Banner Blindness)
- **Origin:** Inattentional blindness — Simons & Chabris, 1999 ("invisible gorilla"). **Banner blindness** — Benway & Lane, 1998.
- **Principle:** Attention is selective; users focused on a goal literally do not see elements they've learned to ignore — especially ad-shaped, banner-shaped, or peripheral content.
- **In the UI:** A genuine call-to-action styled like an ad banner (top, full-width, colorful, off to the side) gets skipped. Important messages dressed as marketing are invisible to task-focused users.
- **Implication:** Place critical information *in the path of the task*, in the content column, not in banner/sidebar real estate. Don't make essential UI look like advertising.
- **Pitfall:** Sticking a key notice in a top banner or right rail and assuming it was seen. If it looks like an ad, it's gone.

### Flow
- **Origin:** Mihály Csíkszentmihályi, 1975.
- **Principle:** A state of full, energized focus reached when challenge and skill are balanced, goals are clear, and feedback is immediate. Interruptions and latency break it.
- **In the UI:** Keep responses fast (ties to Doherty), feedback immediate, the next step clear, and modal interruptions rare. Power-user shortcuts let skill rise with challenge.
- **Implication:** Protect flow — minimize disruptive dialogs, defer non-urgent notifications, keep the path forward obvious, and give instant feedback on every action.
- **Pitfall:** Interrupting deep work with cookie banners, upsell modals, or "rate us" prompts mid-task — each one ejects the user from flow and resets their context.

### Recognition over Recall
- **Origin:** Long-standing memory psychology; codified for UI in Nielsen's heuristic "Recognition rather than recall" (1994). See the `usability-heuristics` skill for the full heuristic set.
- **Principle:** Recognizing something shown is far cheaper than recalling it unaided. Visible options beat memorized commands.
- **In the UI:** Dropdowns and pickers over "type the exact code"; recently-used and autocomplete over blank fields; visible breadcrumbs over remembering where you are.
- **Implication:** Show options and context; don't force the user to hold information across screens or remember syntax. Make actions and state *visible*.
- **Pitfall:** Command-line-style UIs for novice tasks, or forms that reference a value the user saw two screens ago and must now retype from memory.

---

## 6. Productivity, scope & behavioral-economics cluster

These shape product and UX decisions; cited compactly because each is a single sharp idea.

| Law / Principle | Origin | The idea | Use it for | Pitfall |
|---|---|---|---|---|
| **Parkinson's Law** | C. Northcote Parkinson, 1955 | Work expands to fill the time allotted. | Imposed deadlines/timers focus effort (booking holds, "offer ends in 10:00"). | Manufactured fake urgency erodes trust; real scarcity only. |
| **Pareto (80/20)** | Vilfredo Pareto; named by Joseph Juran | ~80% of effects come from ~20% of causes. | Prioritize the 20% of features that drive 80% of use; optimize hot paths first. | Treating it as exact law; neglecting the long-tail 20% that retains power users. |
| **Occam's Razor** | William of Ockham (14th c.) | Among competing solutions, prefer the one with fewest assumptions. | Cut redundant steps, fields, options; simplest flow that works. | Over-simplifying past the task's irreducible complexity (see Tesler). |
| **Loss Aversion** | Kahneman & Tversky, prospect theory, 1979 | Losses loom ~2× larger than equivalent gains. | "Don't lose your progress," abandoned-cart, free-trial framing. | Dark-pattern coercion ("you'll lose everything!") to trap users. |
| **Anchoring** | Tversky & Kahneman, 1974 | First number/option seen biases all later judgments. | Show a higher "was" price, place the target plan beside a premium one. | Deceptive anchors (fake original prices) are manipulative and often illegal. |
| **Choice Overload** | Iyengar & Lepper, 2000 (jam study) | Too many options reduces likelihood of *any* choice and satisfaction with it. | Curate, recommend a default, limit visible plans/SKUs. | Confusing with Hick's (that's *speed*; this is *paralysis & regret*). |

The distinction between **Hick's Law** and **Choice Overload** is worth holding precisely, because they look identical on a cluttered screen but prescribe differently. Hick is about *deliberation time* — it scales with how many options you make a person *evaluate*, and the fix is reducing or grouping so the relevant set is small. Choice overload is about *paralysis and post-decision regret* — beyond a threshold of roughly a dozen comparable options, people defer choosing entirely or feel worse about whatever they picked, and the fix is curation plus a recommended default that lets them opt out of comparing. A plan-picker with 4 tiers is a Hick problem (speed it up); a marketplace with 200 near-identical SKUs is a choice-overload problem (curate and recommend).

> **Loss aversion / anchoring / choice overload are powerful and dual-use.** They describe real biases — use them to *help* users decide (clear defaults, honest comparison), never to coerce. Manufactured scarcity, fake anchors, and confirmshaming are dark patterns; they win the click and lose the trust.

---

## 7. Gestalt grouping (brief — see `layout-and-composition`)

The Gestalt principles (Wertheimer, Koffka, Köhler, 1920s; **Common Region** and **Uniform Connectedness** added later by Palmer & Rock) describe how the eye groups before it reads:

- **Proximity** — elements placed close together are perceived as one group. Spacing *is* grouping.
- **Common Region** — elements inside a shared boundary (a card, a panel) read as a set, even if far apart.
- **Uniform Connectedness** — elements joined by a line or shared background read as connected — the strongest grouping cue.

In practice: control grouping with *whitespace and containers*, not dividers. A form field and its label belong to the same region; a save button belongs near what it saves. The full Gestalt treatment — similarity, closure, continuity, figure/ground — lives in the **`layout-and-composition`** skill; don't re-derive it here.

---

## 8. Do / Don't

| Do | Don't |
|---|---|
| Make frequent, important targets big and near; use edges/corners (Fitts). | Cram tiny icon buttons at small gaps, or give a big button a small hit area. |
| Reduce and group choices; offer a sensible default (Hick). | Dump 40 ungrouped options, or fragment one choice into 10 screens. |
| Chunk data into meaningful units (Miller). | Cite "7±2" to cap menu items. |
| Honor platform conventions for plumbing (Jakob). | Reinvent the scrollbar, back gesture, or nav to "look fresh." |
| Push complexity into the system (Tesler); forgive input formats (Postel). | Demand exact formats; or accept genuinely broken input. |
| Respond <400ms; use optimistic UI + skeletons (Doherty). | Block on a spinner, or add a 600ms transition that re-adds the wait. |
| Design the peaks and the *ending* deliberately (Peak-End). | Polish the average and leave an abrupt blank/error finish. |
| Use polish to earn trust (Aesthetic-Usability)… | …but let beauty mask flaws or skip usability testing. |
| Emphasize one focal point (Von Restorff). | Make three things "primary" — emphasis on all = emphasis on none. |
| Show progress; front-load it (Goal-Gradient, Zeigarnik). | Reset a progress bar or invent endless open loops. |
| Put critical info in the task path (Selective Attention). | Style essential UI like an ad banner. |
| Use biases to help users decide (anchoring, defaults). | Weaponize them — fake scarcity, fake anchors, confirmshaming. |

---

## 9. Summary table (law → use it for → pitfall)

| Law | Attribution | Use it for | Pitfall |
|---|---|---|---|
| Fitts's | Fitts, 1954 | Size/place targets; exploit edges & corners | Tiny clustered buttons; visual ≠ hit area |
| Hick-Hyman | Hick & Hyman, 1952 | Cut/group choices; defaults | Death-by-wizard; over-fragmenting |
| Miller's | Miller, 1956 | Chunk & format data | "7±2" as a hard menu cap |
| Jakob's | Nielsen, 2000 | Honor conventions | Reinventing plumbing |
| Tesler's | Tesler, ~1980s | Shift complexity to system | Exporting parsing to the user |
| Postel's | Postel, 1980 | Forgive input, clean output | Swallowing real errors |
| Doherty | Doherty & Thadani, 1982 | <400ms; optimistic UI, skeletons | Blocking spinners; slow transitions |
| Peak-End | Kahneman et al., 1993 | Design peaks + endings | Neglecting the finish |
| Aesthetic-Usability | Kurosu & Kashimura, 1995 | Polish earns trust/forgiveness | Masking real usability flaws |
| Von Restorff | von Restorff, 1933 | One distinct focal point | Emphasizing everything |
| Serial Position | Ebbinghaus | Important items at start/end | Burying key action in the middle |
| Goal-Gradient | Hull, 1932; Kivetz 2006 | Progress bars; endowed progress | Resetting/lying progress |
| Zeigarnik | Zeigarnik, 1927 | Checklists; open loops | Endless un-closable loops |
| Cognitive Load | Sweller, 1988 | Cut extraneous load | Hiding essentials (raises load) |
| Selective Attention | Simons & Chabris 1999; Benway & Lane 1998 | Put key info in task path | Banner-styled essential UI |
| Flow | Csíkszentmihályi, 1975 | Fast, clear, uninterrupted | Mid-task modals/upsells |
| Recognition>Recall | Nielsen heuristic, 1994 | Pickers, autocomplete, visible state | CLI-style novice tasks |
| Parkinson's | Parkinson, 1955 | Honest deadlines/timers | Fake urgency |
| Pareto | Pareto / Juran | Prioritize the vital 20% | Ignoring the long tail |
| Occam's | Ockham | Simplest flow that works | Over-simplifying past Tesler floor |
| Loss aversion / Anchoring | Kahneman & Tversky, 1979/1974 | Framing, comparison, defaults | Coercive dark patterns |
| Choice overload | Iyengar & Lepper, 2000 | Curate; recommend a default | Confusing with Hick (speed vs paralysis) |
| Gestalt grouping | Wertheimer et al.; Palmer & Rock | Group via space & regions | Dividers instead of whitespace |

---

## 10. Cross-device application

The laws are universal; their *thresholds* shift by input method and context.

| Law | Mobile / touch | Desktop / pointer | Watch / TV / voice |
|---|---|---|---|
| **Fitts's** | Touch targets **≥44×44pt (iOS) / 48×48dp (Android)**, ≥8px apart — the finger is a fat, imprecise pointer with no hover. Thumb-reach zones matter: primary actions in the bottom third. | Precise cursor allows smaller targets, but still respect ≥24px clickable and use screen edges/corners (infinite targets) the mouse can slam into. | Watch: huge targets, few per screen. TV: D-pad focus order *is* the target model — distance = button presses. Voice: no spatial targets; "distance" is dialog depth. |
| **Hick's** | Small screen forces fewer visible choices — lean on progressive disclosure, sheets, and defaults harder than on desktop. | Room for more options, but still group; menus and command palettes scale choice without scaling decision time. | Severe choice limits — 2–4 options per screen on watch/TV; voice must offer ≤3 spoken options or it overflows memory. |
| **Doherty** | Perceived performance is *more* critical — flaky networks. Lean on optimistic UI, skeletons, prefetch, and offline-first; never block the thumb on a round-trip. | Faster networks raise the bar — under 400ms is the floor, 100ms feels instant. | Voice has its own latency budget: a reply must begin <1s or the interaction feels broken; fill with a brief acknowledgment. |
| **Miller / Cognitive Load** | Tiny viewport = brutal extraneous-load budget; chunk aggressively, one primary task per screen. | More room to show context — but don't mistake space for license to clutter. | Watch/voice: hold almost nothing — strip to a single decision; never recite a long list aloud. |
| **Jakob's** | Honor *platform* conventions (iOS vs Android navigation, share sheets, back behavior) — see `platform-conventions`. | Honor web/desktop conventions (menu bar, right-click, keyboard shortcuts). | Honor the platform's own paradigm (watch crowns, TV remotes, voice turn-taking). |

**The through-line:** smaller and less-precise the input, the *larger* the targets, the *fewer* the choices, the *faster* the response must feel, and the *less* the user can hold in memory. Design for the most constrained context your screen will run in, then expand — not the reverse.

---

## 11. Using the laws — workflow & worked example

The laws map to stages of a design. Reach for them in this order when building or auditing a screen:

| Stage | Question | Laws that answer it |
|---|---|---|
| **Structure** | How many things, grouped how? | Hick (count), Miller (chunking), Gestalt/Common Region (grouping), Pareto (which 20% to surface) |
| **Hierarchy** | What's the one focal point? | Von Restorff (distinct focal point), Serial Position (ends), Selective Attention (in the task path) |
| **Targets** | Can they hit / reach it? | Fitts (size, distance, edges), cross-device touch minimums |
| **Flow & speed** | Does it stay responsive and uninterrupted? | Doherty (<400ms), Flow (no mid-task interruptions) |
| **Memory** | Are we making them remember? | Recognition over recall, Miller, Tesler (system absorbs it) |
| **Input** | Are we forgiving? | Postel (liberal input), Tesler (parse it for them) |
| **Motivation** | Will they finish? | Goal-Gradient (progress), Zeigarnik (open loops), Loss aversion (framing) |
| **Memory of it** | How will they recall the experience? | Peak-End (peaks + ending), Aesthetic-Usability (polish → trust) |

**Worked diagnostic — a sign-up form that converts poorly.** Walk the laws as a checklist:

- *Structure:* 14 fields shown at once → **Hick** + **Cognitive Load** violation. Cut to the 4 the account genuinely needs now; defer the rest (Tesler — derive what you can server-side; Pareto — most fields aren't load-bearing for signup).
- *Targets:* "Create account" is a 14px text link bottom-right → **Fitts** violation on the most important action. Make it a full-width 48px button.
- *Speed:* submit shows a blank spinner for 2s → **Doherty** + **Flow** violation. Optimistic transition to the next step; validate in the background.
- *Input:* email rejected for a trailing space → **Postel** violation. Trim and case-fold silently.
- *Memory:* "enter the code from the previous screen" → **Recognition over recall** violation. Carry it forward or show it.
- *End:* success lands on a blank dashboard → **Peak-End** miss. Add a brief "You're in" moment and a clear first action.

Six named laws, six concrete fixes, each defensible in review by its source. That's the point of the catalogue: it turns "this feels off" into "this fails Fitts, here's the threshold."

**The squint/measure tests:** for **Fitts**, drop the design to mobile size and try to tap each primary action with a thumb — if you miss, it's too small or too cramped. For **Hick/Load**, count the decisions visible above the fold; more than ~5 unrelated ones is a smell. For **Doherty**, profile the p95 of every interaction and flag anything over 400ms for an optimistic-UI treatment. For **Von Restorff**, squint at the screen — exactly one element should still read; if two compete, your focal point is split.

---

> Use a law to *diagnose* (name what's wrong and why) and to *justify* (defend a decision in review with its source). They are constraints on human cognition, not preferences — but every one has a dual-use edge. Apply them to serve the user's goal; the moment a law is used to trick rather than help, it's a dark pattern. When in doubt, the canonical attributed reference for the named "Laws of UX" is Jon Yablonski's lawsofux.com; the underlying findings trace to the researchers credited in each block above.
