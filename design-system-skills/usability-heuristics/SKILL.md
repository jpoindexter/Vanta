---
name: usability-heuristics
description: Reference-grade guide to the canonical usability principles — Nielsen's 10 heuristics, Norman's design fundamentals, Shneiderman's 8 golden rules, Rams' 10 principles — plus how to run a heuristic evaluation across any web, mobile, desktop, TV, or voice screen.
tags: [ux, usability, heuristics, nielsen, evaluation]
---
# Usability Heuristics & Evaluation

The durable, attributed laws of usable interfaces. These are not opinions — they are field-tested principles from Jakob Nielsen, Don Norman, Ben Shneiderman, and Dieter Rams. Use this skill to design screens that don't need explaining, and to evaluate any UI (web, mobile, desktop, TV, voice) against a shared, defensible standard.

How to use: design against the heuristics; evaluate with the method in §5. When you flag a problem, name the heuristic it violates and rate its severity — that turns a subjective "I don't like this" into a prioritized, fixable finding.

---

## 1. Jakob Nielsen's 10 Usability Heuristics

Published by Jakob Nielsen in 1994 (refined from a 1990 factor analysis with Rolf Molich), now maintained by Nielsen Norman Group (NN/g). They are "heuristics" — broad rules of thumb, not narrow guidelines — because they apply across every interface ever built. Memorize them.

### H1 — Visibility of system status
**Principle.** The system should always keep users informed about what is going on, through appropriate feedback within reasonable time.
**Why it matters.** Reduces uncertainty. Users build trust when the system communicates; they abandon and double-click when it goes silent.
**Follows it.** A file-upload bar showing "3 of 8 files · 1.2 MB/s · ~12s left." A "Saved" indicator the instant autosave fires. A map app pulsing while it acquires GPS. A button that swaps to a spinner + "Submitting…" on tap.
**Violation.** Tap "Pay" → the screen freezes with no spinner, no disabled state. The user taps again and gets charged twice.
**Fix.** Disable the button on first tap, swap the label to a loading state, and confirm completion ("Payment received") or failure explicitly.

### H2 — Match between the system and the real world
**Principle.** Speak the users' language — words, phrases, and concepts familiar to them — and follow real-world conventions, making information appear in a natural, logical order.
**Why it matters.** Jargon forces translation; users misread, mistrust, or quit.
**Follows it.** A trash/recycle bin for deletion. "Cart" and "Checkout" in commerce. A thermostat that shows degrees, not sensor codes. A calendar reading "Tomorrow, 2 PM" not "2026-06-06T14:00Z."
**Violation.** An error reads `EACCES: permission denied, open '/var/db'`. A medical app labels a field "Episode of care encounter ID."
**Fix.** Translate to the user's domain: "We couldn't save your file — you don't have permission to write here." Use the words your actual users use (test with five of them).

### H3 — User control and freedom
**Principle.** Users often choose functions by mistake and need a clearly marked "emergency exit" to leave the unwanted state — support undo and redo.
**Why it matters.** Freedom to reverse encourages exploration; its absence breeds fear.
**Follows it.** Gmail's "Undo Send." Photoshop's history/undo stack. A "Cancel" on every modal. A discardable draft. The browser back button always restoring state.
**Violation.** A multi-step wizard with no Back button. "Are you sure?" with only an OK. A bulk "Archive all" with no undo.
**Fix.** Add Cancel/Back/Close to every flow. Prefer undo (reversible after the fact) over nagging confirmations; offer a 5–10s "Undo" toast for bulk and destructive actions.

### H4 — Consistency and standards
**Principle.** Users shouldn't wonder whether different words, situations, or actions mean the same thing. Follow platform and industry conventions. (Per Nielsen's "Jakob's Law": users spend most of their time on *other* sites, so they expect yours to behave like those.)
**Why it matters.** Consistency lets learning transfer; inconsistency forces relearning.
**Follows it.** Primary action always the same color/position. iOS apps using the native share sheet. One icon meaning one thing everywhere. Hamburger menu top-left, account top-right.
**Violation.** "Submit" on one screen, "Send" on the next, "Go" on a third — all the same action. A custom dropdown that ignores keyboard arrow-key conventions.
**Fix.** Build and enforce a design system / component library. Adopt platform HIG (Apple), Material (Android), or your in-house standard. Audit terminology for one word per concept.

### H5 — Error prevention
**Principle.** Even better than good error messages is a design that prevents problems in the first place. Eliminate error-prone conditions, or check for them and present a confirmation before users commit.
**Why it matters.** The best error message is the one never shown.
**Follows it.** A date picker (can't type an invalid date). Disabling "Send" until required fields are valid. Greying out conflicting options. A "type DELETE to confirm" gate. Inline validation as you type.
**Violation.** A free-text date field accepting "Febuary 30." Letting users submit a malformed email and only failing server-side.
**Fix.** Constrain inputs (pickers, dropdowns, masks). Use smart defaults. Validate at the boundary and surface issues inline before submission, not after.

### H6 — Recognition rather than recall
**Principle.** Minimize memory load by making objects, actions, and options visible. Users shouldn't have to remember information from one part of the interface to another.
**Why it matters.** Recognition is easy; recall is expensive working-memory effort.
**Follows it.** Autocomplete and recently-used lists. Visible menu items vs. memorized commands. Showing the entered shipping address on the payment step. Search suggestions. A visible formatting toolbar instead of memorized markdown.
**Violation.** "Enter the code from the previous screen" with no way to go back and look. A CLI-only interface where you must memorize flags. Re-entering data already provided.
**Fix.** Surface context where it's needed; carry data forward; show options instead of demanding memorized input. Provide examples and placeholders.

### H7 — Flexibility and efficiency of use
**Principle.** Accelerators — unseen by the novice — may speed up the expert. Let users tailor frequent actions. Serve both inexperienced and experienced users.
**Why it matters.** One UI must serve first-timers and power users; accelerators bridge them.
**Follows it.** Keyboard shortcuts (⌘K command palette, ⌘C/V). Saved filters and templates. Swipe-to-archive on mobile. "Reorder" your usual coffee. Customizable toolbars.
**Violation.** A daily-use app with no shortcuts, forcing five clicks for the most common task. No bulk actions on a list power users manage hourly.
**Fix.** Add shortcuts, command palettes, bulk operations, saved views, and personalization — without cluttering the default path for novices (progressive disclosure).

### H8 — Aesthetic and minimalist design
**Principle.** Interfaces should not contain information that is irrelevant or rarely needed. Every extra unit of information competes with the relevant units and diminishes their relative visibility. (Restraint, not decoration.)
**Why it matters.** Noise lowers signal; clutter raises cognitive load and hides the primary task.
**Follows it.** Google's homepage — one search box. A checkout that hides cross-sell until after purchase. Generous whitespace. One clear primary action per screen.
**Violation.** A dashboard with 40 KPIs, 6 banners, and 3 modals on load. A form asking for data you'll never use.
**Fix.** Cut ruthlessly. Apply progressive disclosure (advanced options on demand). Establish clear hierarchy: one primary action, secondary actions de-emphasized.

### H9 — Help users recognize, diagnose, and recover from errors
**Principle.** Error messages should be in plain language (no codes), precisely indicate the problem, and constructively suggest a solution.
**Why it matters.** Errors are inevitable; recovery is the test of a humane system.
**Follows it.** "That email is already registered. Sign in instead, or reset your password." A 404 page with a search box and links home. Inline field errors pointing at the exact field with how to fix it.
**Violation.** "Error 0x80004005." "Something went wrong." A red border with no message. A form that clears all fields on a single validation failure.
**Fix.** Three parts to every error: what happened (plain language), why (precise), how to recover (actionable). Preserve user input. Place the message at the point of error.

### H10 — Help and documentation
**Principle.** It's best if the system needs no documentation, but help may be necessary. Such information should be easy to search, focused on the user's task, list concrete steps, and not be too large.
**Why it matters.** Even good UIs hit edge cases; findable, task-focused help unblocks users.
**Follows it.** Contextual tooltips and "?" affordances. A searchable help center with task-based articles. Inline empty-state guidance ("Add your first project →"). Onboarding coachmarks shown once.
**Violation.** A 200-page PDF manual for a consumer app. Help text explaining the menu structure instead of how to accomplish a goal. No help at all on a complex feature.
**Fix.** Embed help in context, make it searchable, structure it around user tasks ("How do I…"), keep articles short with concrete steps and screenshots.

---

## 2. Don Norman's Principles — *The Design of Everyday Things*

Don Norman (cognitive scientist, coined "user experience") gave us the vocabulary for *why* things are usable or not. His framework is about the relationship between a person's mental model and the system's behavior.

**Affordances.** The relationship between an object's properties and an agent's capabilities — what actions are *possible*. A flat plate affords pushing; a vertical bar affords pulling. Digitally: a raised button affords clicking; a text field affords typing.

**Signifiers.** Perceivable cues that *communicate* where an action should take place — they make affordances discoverable. "PUSH" on the plate is a signifier. Digitally: underlined blue text, a cursor change to a hand, a "drag here" outline, a shadow that says "clickable." *Affordance = what's possible; signifier = how you know.* Bad UIs have affordances with no signifiers (a clickable div that looks like plain text) — a "mystery-meat" interface.

**Feedback.** Communicating the result of an action, immediately and informatively. Press a key → the character appears. Click "Like" → the heart fills and the count ticks up. Poor or absent feedback creates "is it broken or just slow?" anxiety (see H1).

**Mapping (natural mapping).** The relationship between controls and their effects. *Natural mapping* exploits spatial/physical analogy: stove knobs arranged like the burners; a volume slider that goes up for louder; seat-adjustment controls shaped like the seat. Poor mapping: four burners in a row, four knobs in a row, no clue which controls which.

**Constraints.** Restrictions that limit possible actions and prevent error. Four kinds:
- *Physical* — a peg won't enter the wrong-shaped hole; a connector only seats one way.
- *Logical* — three of four pieces placed implies where the fourth goes.
- *Cultural* — red means stop/danger; a checkmark means done (learned conventions, vary by culture).
- *Semantic* — the meaning of the situation constrains action (a motorcyclist faces forward, so the windscreen goes in front).

Digitally: disabling invalid options, input masks, and date pickers are constraints (and error prevention, H5).

**Conceptual models.** The simplified mental explanation of how something works. Good design conveys a clear model so users can predict behavior. A thermostat is *not* a throttle — turning it to 90° doesn't heat faster — yet poor design invites that wrong model. Make the system's model legible.

**Discoverability.** Can the user figure out what actions are possible and how to perform them? It emerges from affordances, signifiers, constraints, mappings, and feedback working together.

**Gulf of Execution.** The gap between the user's *intention* and the actions the system allows — "How do I do this?" Bridged by good affordances, signifiers, and constraints.

**Gulf of Evaluation.** The gap between the system's *state* and the user's ability to interpret it — "Did it work? What state am I in now?" Bridged by good feedback and visible status. Good design narrows both gulfs.

**Seven stages of action.** Norman's model of how people act:
1. **Goal** — form the goal.
2. **Plan** — plan the action.
3. **Specify** — specify an action sequence.
4. **Perform** — perform the action sequence.
5. **Perceive** — perceive the state of the world.
6. **Interpret** — interpret the perception.
7. **Compare** — compare the outcome with the goal.

Stages 2–4 cross the Gulf of Execution; 5–7 cross the Gulf of Evaluation. Most failures cluster at "specify" (can't find the control) and "interpret" (can't tell what happened).

**Human error: slips vs. mistakes.** Errors are usually *design* failures, not user stupidity.
- *Slips* — right intention, wrong action (you meant "Reply" but hit "Reply All"; capture slips, description slips, mode errors). Prevent with constraints, confirmations, and undo.
- *Mistakes* — a flawed intention from a wrong mental model (you reply-all on purpose, having misread the thread). Prevent with better conceptual models, clearer information, and feedback.

**Forcing functions.** A strong constraint that *prevents* proceeding until a problem is corrected. Three types:
- *Interlocks* — a microwave won't run with the door open; "type DELETE to confirm."
- *Lock-ins* — keep an action going: "you have unsaved changes, leave anyway?"
- *Lock-outs* — prevent entering a dangerous state: a barrier at the bottom of a stairwell.

Use sparingly; they're deliberate friction.

---

## 3. Ben Shneiderman's 8 Golden Rules of Interface Design

From *Designing the User Interface* (Ben Shneiderman, University of Maryland; later editions with Catherine Plaisant). Complementary to Nielsen, with a stronger interaction-design emphasis.

1. **Strive for consistency.** Identical action sequences in similar situations; consistent terminology, color, layout, fonts. (Cf. H4.)
2. **Enable frequent users to use shortcuts.** As usage grows, users want fewer interactions — abbreviations, function keys, hidden commands, macros. (Cf. H7.)
3. **Offer informative feedback.** Feedback for every action — modest for frequent/minor actions, substantial for infrequent/major ones. (Cf. H1.)
4. **Design dialogs to yield closure.** Action sequences need a beginning, middle, and end; an informative completion message gives satisfaction and a signal to move on (e.g., an order confirmation page).
5. **Prevent errors.** Design so users can't make serious errors; if they do, offer simple, constructive, specific recovery. (Cf. H5/H9.)
6. **Permit easy reversal of actions.** Reversibility relieves anxiety and encourages exploring unfamiliar options. (Cf. H3.)
7. **Keep users in control (internal locus of control).** Experienced users want to feel they initiate and control actions; avoid surprising or unrequested behavior.
8. **Reduce short-term memory load.** Keep displays simple, consolidate multi-page sequences, allow training time for codes/mnemonics. (Cf. H6; "seven plus or minus two.")

---

## 4. Dieter Rams' 10 Principles of Good Design

Dieter Rams (Braun's chief designer; a profound influence on Jony Ive / Apple). Originally for industrial products, but each maps cleanly to digital. Good design is:

1. **Innovative** — pairs with technological progress; never an end in itself. *Digital:* novel interactions earn their keep only if they serve the user.
2. **Useful** — emphasizes usefulness; disregards anything that detracts. *Digital:* features serve the job-to-be-done, not roadmap vanity.
3. **Aesthetic** — well-executed beauty affects well-being; only well-made objects can be beautiful. *Digital:* visual craft, rhythm, restraint.
4. **Understandable** — clarifies the product's structure; at best, self-explanatory. *Digital:* the UI teaches its own use (discoverability).
5. **Unobtrusive** — products are tools, not decoration; restrained, leaving room for the user. *Digital:* the interface gets out of the way of the task.
6. **Honest** — doesn't manipulate with promises it can't keep; no dark patterns. *Digital:* no fake urgency, no pre-checked upsells, no roach-motel cancellation.
7. **Long-lasting** — avoids fashion, never appears antiquated. *Digital:* durable IA and patterns over trend-chasing.
8. **Thorough down to the last detail** — nothing arbitrary; care shows respect. *Digital:* empty states, error states, focus rings, microcopy.
9. **Environmentally friendly** — conserves resources, minimizes pollution. *Digital:* performance, energy, data frugality, lightweight pages.
10. **As little design as possible** — "Less, but better" (*Weniger, aber besser*) — concentrate on essentials. *Digital:* the north star for minimalist UI (cf. H8).

---

## 5. The Heuristic Evaluation Method (NN/g process)

Heuristic evaluation, formalized by **Nielsen and Molich (1990)**, is a discount usability inspection method: a small set of evaluators judges an interface against recognized heuristics. Cheap, fast, and catches the majority of issues before you spend on user testing.

**The 3–5 evaluators rule.** Nielsen's data shows a single evaluator finds only ~35% of usability problems; aggregating **3–5 evaluators** finds roughly **75%** — the cost-benefit sweet spot. One evaluator misses too much; beyond five, returns diminish sharply. Crucially, **evaluators work independently first** (so they don't bias each other), then pool findings.

**Process.**
1. Brief evaluators on the persona, scenarios/tasks, and the heuristic set (Nielsen's 10).
2. Each evaluator independently walks the interface **at least twice** — once for flow, once to inspect each element against every heuristic.
3. Each logs problems: location, heuristic(s) violated, and *why* it's a problem.
4. Aggregate and dedupe all findings, then have evaluators rate **severity independently**.
5. Deliver a prioritized report.

**Severity rating scale (Nielsen, 0–4)** — a combination of *frequency*, *impact*, and *persistence*:
| Rating | Meaning | Action |
|---|---|---|
| 0 | Not a usability problem at all | Ignore |
| 1 | **Cosmetic** — fix only if extra time | Backlog |
| 2 | **Minor** — low priority to fix | Schedule |
| 3 | **Major** — important, high priority | Fix before release |
| 4 | **Catastrophe** — imperative to fix before release | Block release |

**Deliverable format.** A table, one row per finding: *# · Screen/location · Heuristic violated · Description · Severity (0–4) · Recommended fix · (optional) screenshot.* Sort by severity descending so the team fixes catastrophes first.

**Heuristic evaluation vs. usability testing** — complementary, not interchangeable:
| | Heuristic evaluation | Usability testing |
|---|---|---|
| Who | 3–5 expert evaluators | 5+ real/representative users |
| Finds | Violations of known principles | Real behavior, surprises, misunderstandings |
| Cost/speed | Cheap, hours–days | Costlier, days–weeks |
| Best for | Early/cheap pass, no users available | Validating real-world success, novel flows |
| Blind spots | Misses domain-specific & motivational issues | Small-n; may miss expert-obvious flaws |
Run heuristic evaluation early and often; validate the important flows with real users.

---

## 6. Cross-Platform Notes

The heuristics are universal; their *expression* changes by platform.

**Mobile / touch.** Targets ≥ 44×44 pt (Apple HIG) / 48×48 dp (Material) — fat-finger error prevention (H5). No hover; signifiers must be visible without it (Norman). Feedback via haptics + visual (H1). Gestures are accelerators (H7) but need discoverable fallbacks (swipe-to-delete also needs a visible button). Small screen demands minimalism (H8) and progressive disclosure. Respect the system back gesture (H3, H4). Account for one-handed reach and interruptions.

**Desktop.** Rich keyboard shortcuts and right-click menus (H7). Multiple windows and dense information are acceptable. Hover states are valid signifiers. Larger pointer precision allows smaller targets, but still honor platform conventions (menu bar, ⌘/Ctrl) for consistency (H4).

**TV / 10-foot UI.** Navigation is directional (D-pad/remote), not pointer — a strong, always-visible **focus state** is critical (recognition, H6; signifiers, Norman). Large type, high contrast, minimal text entry (painful on a remote — prefer recognition over recall, H6). Few choices per screen (H8). Predictable spatial mapping of focus movement (Norman mapping).

**Voice / conversational.** No screen — system status must be *spoken or audible* (earcons, "Working on it…") to satisfy H1. Real-world language is paramount (H2) — accept natural phrasings. No visible affordances, so the system must *tell* users what it can do (help, H10; recognition over recall, H6 — don't make users memorize exact commands). Confirm before destructive actions (H3/H5); support "cancel" and "go back" (H3). Keep prompts short (H8); recover from errors by re-prompting (H9).

---

## 7. Practical Heuristic-Evaluation Checklist

Run this against any single screen. Mark Pass / Fail / N-A and note severity (0–4) on each Fail.

| # | Heuristic | Check this on the screen |
|---|---|---|
| 1 | Visibility of status | Is every loading/saving/processing state shown? Is current location/step indicated? |
| 1 | Visibility of status | Does every action give immediate feedback (≤ ~100ms perceived)? |
| 2 | Real-world match | Is all copy in the user's language — no codes, no internal jargon? |
| 2 | Real-world match | Do icons, metaphors, and information order match real-world conventions? |
| 3 | Control & freedom | Is there a clear Cancel/Back/Close exit from every state? |
| 3 | Control & freedom | Can the user undo? Are bulk/destructive actions reversible (undo toast)? |
| 4 | Consistency | Same word, color, and position for the same action as elsewhere? |
| 4 | Consistency | Does it follow platform conventions (HIG/Material/in-house system)? |
| 5 | Error prevention | Are inputs constrained (pickers, masks, disabled invalid options)? |
| 5 | Error prevention | Are destructive actions gated by confirmation or a forcing function? |
| 6 | Recognition over recall | Are options/actions visible, not memorized? Is prior data carried forward? |
| 6 | Recognition over recall | Are there examples, placeholders, defaults, recent/suggested items? |
| 7 | Flexibility & efficiency | Are there accelerators (shortcuts, bulk actions, saved views) for experts? |
| 7 | Flexibility & efficiency | Do they coexist without cluttering the novice path? |
| 8 | Minimalist design | Is everything on screen relevant? One clear primary action? |
| 8 | Minimalist design | Is hierarchy clear; is advanced detail progressively disclosed? |
| 9 | Error recovery | Are errors plain-language, precise, and do they suggest a fix? |
| 9 | Error recovery | Is user input preserved on error; is the message at the point of error? |
| 10 | Help & documentation | Is contextual help available, searchable, and task-focused? |
| 10 | Help & documentation | Do empty states guide the first action? |
| — | Norman | Are affordances paired with visible signifiers (no mystery-meat)? |
| — | Accessibility | Visible focus, keyboard operable, target size, AA contrast (overlaps H1/H4/H5)? |

---

## 8. Common Violations Gallery (pattern → fix)

| Anti-pattern | Heuristic violated | Fix |
|---|---|---|
| No spinner/skeleton on slow loads; UI looks frozen | H1 Visibility | Loading states, skeletons, progress, optimistic UI; disable re-submittable buttons |
| Errors show codes/jargon (`HTTP 500`, `EACCES`) | H2, H9 | Plain-language message: what happened + why + how to fix |
| Wizard/flow with no Back; no undo on delete | H3 User control | Add Back/Cancel everywhere; prefer undo-toast over confirm-nag |
| "Submit"/"Send"/"Go" for the same action; mismatched components | H4 Consistency | One term per concept; adopt a component library/design system |
| Free-text fields where a constraint fits; only server-side validation | H5 Prevention | Pickers/masks/disabled options; validate inline before submit |
| "Enter the code from the last screen"; CLI-only flag memorization | H6 Recognition | Carry data forward; show options, autocomplete, recent items |
| Daily-use tool with no shortcuts/bulk actions | H7 Flexibility | Shortcuts, command palette, bulk ops, saved filters |
| Dashboard buried in banners, modals, 40 KPIs | H8 Minimalist | Cut; progressive disclosure; one primary action; whitespace |
| Red border with no text; "Something went wrong"; form clears on error | H9 Recovery | Specific inline message + recovery step; preserve input |
| Complex feature, zero in-context help; 200-page PDF | H10 Help | Contextual tooltips, searchable task-based help, guided empty states |
| Destructive action ("Delete account") with no confirm/undo | H3, H5, forcing fn | Forcing function (type-to-confirm) + reversibility window |
| Clickable element that looks like plain text (mystery-meat) | Norman signifiers | Visible signifier: button styling, underline, cursor, hover |
| Double-charge from re-tapping a silent "Pay" button | H1, Norman feedback | Disable on tap, show progress, confirm result explicitly |
| Dark patterns: pre-checked upsell, hidden cancel, fake urgency | Rams honesty | Honest defaults; symmetric ease of opt-out; truthful messaging |

---

## Quick reference — who said what

- **Jakob Nielsen** (with Rolf Molich) — the **10 Usability Heuristics**; the heuristic-evaluation method; the **0–4 severity scale**; the **3–5 evaluators** finding (NN/g).
- **Don Norman** — *The Design of Everyday Things*: affordances, signifiers, mapping, constraints, conceptual models, feedback, the two **Gulfs**, the **7 stages of action**, slips vs. mistakes, forcing functions; coined "user experience."
- **Ben Shneiderman** — the **8 Golden Rules of Interface Design** (*Designing the User Interface*).
- **Dieter Rams** — the **10 Principles of Good Design**; "Less, but better."

When you evaluate, always name the heuristic and rate severity. A finding without a principle is an opinion; a finding without severity can't be prioritized. Heuristics make critique objective.
