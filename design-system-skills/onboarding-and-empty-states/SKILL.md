---
name: onboarding-and-empty-states
description: Reference-grade guide to designing every state a view can be in — ideal, empty (first-use vs cleared vs no-results), loading, partial, error, offline, success, blocked, and zero-results — plus first-run onboarding that drives activation to the aha moment through show-don't-tell, just-in-time guidance, seed data, progress checklists, and contextual permission priming.
tags: [design-systems, onboarding, empty-states, activation, states]
---
# Onboarding, Empty States & the Full State Set

Most teams design exactly one state: the screen full of beautiful data. Then it ships and the first real user sees a blank rectangle, a spinner that never resolves, an error with no recovery, and a permission prompt on launch they instantly deny. The discipline that separates senior work is simple and unglamorous: **design every state a view can be in, not just the happy one.** A screen is not a picture; it is a state machine. This skill is the checklist of states you owe every view, and the craft of turning the emptiest, earliest, most fragile moments — first run and the blank slate — into the highest-leverage moments you have.

## 1. The full state set — the discipline

Before a view is "done," walk it through every state below. Each is a real screen a real user will hit. Skipping one doesn't delete the state; it ships it undesigned.

| State | When it shows | The one job |
|---|---|---|
| **Ideal / populated** | Real data, happy path | Show the content; this is the reward |
| **Empty — first use** | New user, nothing created yet | Explain value + one next action |
| **Empty — user-cleared** | User deleted/completed everything | Celebrate or reassure, offer re-entry |
| **Empty — no results** | Filter/search returned nothing | Explain why + broaden/clear path |
| **Loading** | Data in flight | Hold layout, show progress, no jank |
| **Partial** | Some data loaded, some pending/failed | Show what you have, flag what's missing |
| **Error** | Request/action failed | What broke, why, how to recover, retry |
| **Offline** | No connectivity | Name it, show cached data, queue actions |
| **Success / confirmation** | Action completed | Confirm, show result, offer next step |
| **Permission / blocked** | Capability denied or gated | Explain need, route to unblock |
| **Zero-results search** | Query matched nothing | Suggest, broaden, never dead-end |

**The three "empty" states are different states.** Conflating them is the single most common mistake in this whole area. "You have no projects yet" (first-use → onboard) is not "You finished all your tasks" (cleared → celebrate) is not "No results for 'xqz'" (no-results → broaden the query). Same blank canvas, three opposite messages and three different next actions.

## 2. Empty states — first-use (the blank slate)

The first-use empty state is the most valuable screen in your product and the one most often left as a sad gray "No data." It is the moment a user decides whether this thing is worth their time. Treat it as **onboarding, not absence.**

A strong first-use empty state has four parts:

1. **Value in one line.** What this view is *for*, in the user's words. "Track every invoice and get paid faster" — not "No invoices."
2. **The one next action.** A single, prominent primary button. One. Not three equal CTAs. "Create your first invoice."
3. **A glimpse of the payoff.** Show what a populated state looks like — a faded illustration, a sample row, a short example — so the user can picture the reward.
4. **An escape hatch / secondary path.** "Import from CSV" or "See an example" as a quiet secondary, for users who don't want to start from scratch.

```html
<!-- First-use empty state: value + single action + glimpse -->
<section class="empty" role="status">
  <img src="illustration.svg" alt="" aria-hidden="true" />
  <h2>Your invoices live here</h2>
  <p>Create an invoice, send it in a click, and track it until it's paid.</p>
  <button class="primary">Create your first invoice</button>
  <button class="link">Import from CSV</button>
</section>
```

| Do | Don't |
|---|---|
| Explain the value of the feature | Show "No data" / "Nothing here" |
| One primary action, prominent | Five buttons of equal weight |
| Seed with sample/example data when safe | Leave a literally blank rectangle |
| Match the illustration to the product's tone | Generic clip-art that says nothing |
| Use it to teach the feature's mental model | Assume the user knows what this view does |

**Seed / sample data** is the strongest empty-state pattern that exists. A new Trello board with example cards, a notes app with a "Welcome" note you can edit, a dashboard pre-populated with demo metrics — these let the user *see the populated state immediately* and learn by editing rather than by reading. Make sample data obviously sample (a banner, a "This is an example — delete it anytime"), make it trivially removable, and never let it pollute real analytics or sync.

## 3. Empty states — user-cleared and no-results

**User-cleared** (inbox zero, all todos done, notifications all read) is a *success*, not a void. Acknowledge it: "You're all caught up." A small celebration, an illustration, maybe a stat ("You closed 12 tasks this week"). Then offer a sensible next move — never leave them staring at nothing wondering if the app broke.

**No-results** (a list filtered down to nothing) must explain *which* constraint emptied it and offer to relax it: "No tasks match 'High priority' + 'Done'. Clear filters?" The recovery action is the point. A no-results state without a way back to results is a dead-end.

## 4. Loading states — never ship layout shift

A view with no loading state flashes blank, then snaps content in, shoving the layout around (CLS). That jank reads as "broken." Always design the in-between.

| Pattern | Use when | Notes |
|---|---|---|
| **Skeleton screens** | Layout is known ahead of data | Gray placeholder shapes matching final layout. Feels fastest — perceived progress. Default for content views. |
| **Spinner** | Short, indeterminate, small area | Fine for <1s actions or buttons. Overused as a lazy default; on a full page it implies "stuck." |
| **Progress bar** | Determinate, multi-step, long | Show % when you know it. Upload, install, import. |
| **Progressive / streamed** | Data arrives in chunks | Render each piece as it lands (above-the-fold first). Best perceived performance. |
| **Optimistic UI** | Action will almost certainly succeed | Apply the change instantly, reconcile/rollback on failure. |

- **Skeletons must match the real layout** — same number of rows, same column widths — so nothing jumps when data replaces them. A skeleton that resizes is worse than a spinner.
- **Hold the space.** Reserve final dimensions (`min-height`, `aspect-ratio`, fixed image boxes) so content swap doesn't reflow neighbors.
- **Delay tiny spinners ~150–300ms** so fast responses never flash a spinner (which itself reads as slowness).
- **Announce to AT:** wrap loading regions in `aria-busy="true"` and use `role="status"` / `aria-live="polite"` for "Loading…" so screen-reader users aren't left in silence.

## 5. Partial states

Real systems are rarely all-or-nothing. A dashboard with six widgets where two endpoints failed should render four widgets and show two scoped error tiles — **not** blow away the whole page. Design the partial state explicitly: show what loaded, flag what didn't with a localized retry, and make the boundary clear (per-card error, not a global toast). Partial beats both "spinner forever" and "one failure nukes everything."

- **Render the known immediately, stream the rest.** Show the page shell, the user's name, the nav — anything you already have — then fill data regions as they resolve. The user sees structure in <100ms instead of a blank wait.
- **Scope failures to the smallest unit.** One failed chart = one error card with its own retry. Use error boundaries (React `<ErrorBoundary>`, route-level error UI) so a single component's crash can't take down siblings.
- **Flag the gap honestly.** "Couldn't load recent activity" inside the activity panel — don't silently show an empty panel that reads as "no activity."
- **Pagination/infinite scroll are partial by design:** show what's loaded, indicate more is coming (a spinner row at the bottom), and never block scrolling the existing items.

## 6. Error states — what, why, recover

An error state has a job beyond "something went wrong." It must answer three questions and give one action:

1. **What** happened, in plain language ("We couldn't save your changes").
2. **Why** / what it means ("Your connection dropped" — not a stack trace, not "Error 0x8004").
3. **How to recover** — a concrete next step, almost always a **Retry** button, plus what's safe ("Your draft is saved").

| Do | Don't |
|---|---|
| "Couldn't load comments. **Try again**" | "An error occurred" with no action |
| Preserve the user's input on failure | Wipe the form and make them re-type |
| Scope the error to the failed region | Replace the whole screen on one failed call |
| Offer retry + alternative (support, status page) | Dead-end with an OK button that does nothing |
| Log details for you, show plain text to them | Surface raw exceptions / codes as the message |

- **Inline > modal** for recoverable errors — keep context, show the error where it happened.
- **Retry must actually retry** (re-fire the request), and where possible **auto-retry with backoff** before bothering the user.
- Distinguish **user errors** (validation — fixable input) from **system errors** (server/network — retry) from **empty** (not an error at all). They look and read differently.

## 7. Offline & blocked states

**Offline:** detect it (`navigator.onLine` + `online`/`offline` events, or failed-request heuristics), name it ("You're offline — showing your last synced data"), keep cached content visible and read-only where sensible, and **queue** actions to replay on reconnect rather than silently dropping them. A persistent banner that auto-dismisses on reconnect beats a blocking modal. Mark stale data honestly ("Last updated 9:42am") so the user knows what they're looking at isn't live.

| Do | Don't |
|---|---|
| Show cached content + an offline banner | Replace the whole app with "No connection" |
| Queue writes, replay on reconnect | Silently drop the user's action |
| Label stale data with last-sync time | Show old data as if it were live |
| Disable only the controls that need the network | Disable the entire UI |

**Permission / blocked:** when a capability is denied (camera, location, notifications) or gated (paywall, role, plan), don't show a broken feature. Show a state that explains *what's needed and why*, with a button that routes to the fix:

- **Denied at OS level** → explain + deep-link to settings ("Enable camera in Settings to scan").
- **Gated by plan** → show the locked feature's value + an upgrade CTA, never a silent no-op.
- **Gated by role** → "You need admin access. Request it from [owner]." — give a path, not a wall.

Never leave a dead control that silently does nothing — that reads as a bug, not a boundary.

## 8. Success & confirmation states

Don't skip the payoff. After a meaningful action — payment, submission, first item created — confirm clearly: **what happened**, the **result/receipt**, and **the next logical step**. A success state that just says "Done" wastes the highest-intent moment in the flow.

| Action | Weak | Strong (confirms + routes forward) |
|---|---|---|
| Sent invoice | "Success" toast, gone in 3s | "Invoice #1042 sent to Acme. **Track it** / Send another" |
| Created account | Redirect to empty dashboard | "Welcome! **Invite your team** or create your first project" |
| Submitted form | Page reloads blank | "Got it — we'll reply within 24h. Reference #8831." |
| Async refund | "Processing…" then nothing | "Refund started — you'll get an email when it lands" |

- **Match feedback weight to action weight.** A toast for a like; a full confirmation screen for a payment. Don't celebrate trivial actions or under-acknowledge important ones.
- **Persist proof** for things people return to: order numbers, receipts, confirmation emails. A toast that vanishes is not a receipt.
- For **async** work, the success state means "we accepted it," not "it's done" — say which, and tell them how they'll learn it finished.

## 9. First-run onboarding — activation, not a tour

Onboarding's only real metric is **activation**: the user reaching the moment they first feel the product's value — the **aha moment** — and the **time-to-value (TTV)** it took to get there. Everything else is decoration. The entire job is to compress the path from sign-up to aha and remove every gram of friction in between.

**Core principles:**

- **Show, don't tell. Do it, don't explain it.** The best onboarding has the user *perform the core action* on real (or sample) data, not read about it. Slack has you send a message; Figma has you move a shape; Duolingo has you do a lesson before you even sign up. Doing creates a memory; a tour creates a dismissed overlay.
- **Just-in-time over upfront.** Teach each feature *the moment it's first relevant*, in context, one tip at a time — not a 7-slide carousel before the user has done anything. Upfront tours are skipped, forgotten, and block the user from the thing they came to do.
- **The empty state IS the onboarding.** For most products you don't need a separate tour — a well-designed first-use empty state (§2) that shows value and the one next action carries the whole load.
- **Reduce TTV ruthlessly.** Remove setup steps, pre-fill with smart defaults, defer everything non-essential. Ask for the credit card / team invite / profile photo *after* the aha, not before it. Every screen between sign-up and value is a leak.

### The cost of forced tours and coachmarks

Forced product tours, coachmark overlays ("Click here! Now here!"), and modal walkthroughs are **the most common onboarding anti-pattern.** Users dismiss them reflexively, retain almost nothing, and resent the wall between them and the app. If you must offer a tour, make it **skippable, short, and optional** — and assume most users skip it. Interactive ("now you try") beats passive ("here's what this does") every time. A coachmark is acceptable for *one* genuinely non-obvious control, shown once, dismissible forever.

### Progressive onboarding mechanics that work

| Pattern | Why it works | Watch out for |
|---|---|---|
| **Setup checklist** | Zeigarnik effect (open loops nag) + goal-gradient (motivation rises near the end) | Keep it short (3–5 items); don't fake-pad it |
| **Endowed progress** | Pre-complete a step ("1 of 4 done" at start) — people finish things already begun | Must be honest (e.g. "account created ✓") |
| **Sample / seed data** | Instant populated state, learn by editing | Mark as example; don't pollute real data |
| **Contextual tooltips (JIT)** | Teach at the point of need, one at a time | Never chain them into a forced tour |
| **Personalization / segmentation** | Ask role/goal up front, tailor the next steps to it | Only if it materially changes the path; keep it 1–2 questions |
| **Progress bar / % complete** | Goal-gradient; visible momentum | Tie to real value, not vanity steps |

A **setup checklist** ("Complete your profile, Connect a repo, Invite a teammate, Create your first project") is the workhorse of B2B onboarding precisely because of the **Zeigarnik effect** — incomplete tasks create mental tension that pulls users back — and the **goal-gradient effect** — effort accelerates as a goal nears. **Endowed progress** supercharges it: start the bar partway ("✓ Account created — 1 of 4") and completion rates jump because people are loath to abandon something already in motion.

### Permission priming — never ask on launch

Asking for notifications, location, camera, or contacts **on app launch** is the fastest way to a permanent "Deny" — and once denied, you must send the user to OS settings to recover. Instead, **prime in context with rationale:** a soft pre-prompt (your own UI, not the OS dialog) that appears *when the permission is actually relevant* and explains the benefit. Only fire the real OS prompt after the user accepts the soft one.

```
Bad:  App opens → OS dialog: "App wants to send notifications" → Deny (forever)
Good: User finishes setup → your screen: "Want a ping when your build finishes?"
      → [Not now] [Notify me] → only "Notify me" triggers the OS prompt
```

This protects your one shot at the OS dialog: you only spend it on users who've already said yes to the value.

## 10. Re-onboarding & feature discovery

Onboarding isn't a one-time gate — returning users need to learn what's new. Re-onboard for new features with **changelogs / what's-new** modals (short, dismissible, shown once), **spotlight / hotspot** indicators on new controls (a subtle dot, not a forced overlay), and contextual "New" badges. Surface a feature *when the user is in the relevant context*, not as a launch-blocking announcement. Respect the dismissal — never re-show a what's-new the user closed.

## 11. Mobile vs desktop onboarding

- **Mobile:** screen-by-screen sign-up, system permission timing is critical (prime first, §9), thumb-reachable primary actions, one decision per screen, and progress dots. Account for the OS-level permission model — you get one prompt.
- **Desktop / web:** more room for a persistent checklist sidebar, inline empty-state guidance, and richer sample data. Hover-triggered tooltips are available (not on touch). Multi-pane layouts can show "here's the panel, here's what fills it" simultaneously.
- Both: defer account creation as late as the value model allows (try-before-signup lowers the activation barrier dramatically).

## 12. Metrics

You cannot improve onboarding you don't measure. Track:

- **Activation rate** — % of new users who reach the aha moment (define it explicitly per product: "sent first message," "created first board").
- **Time-to-value (TTV)** — median time from sign-up to that moment. Drive it down.
- **Onboarding completion rate** — % who finish the checklist / setup flow; find the step where people drop.
- **Funnel drop-off per step** — which screen leaks; that's where to cut friction.
- **Empty-state CTA click-through** — does the first-use action actually get clicked?
- **Permission opt-in rate** — measure the lift from priming vs. raw prompts.

## 13. State copy & voice — quick reference

The words carry most of the weight in these states. Calibrate tone to the moment: empty/onboarding is encouraging, errors are calm and helpful (never cute, never blaming the user), success is brief.

| State | Voice | Template | Avoid |
|---|---|---|---|
| First-use empty | Inviting | "[Value]. [Single action]" | "No data" |
| Cleared empty | Affirming | "You're all caught up" | A blank screen |
| No results | Helpful | "No matches for X. [Broaden / clear]" | "Nothing found." (dead-end) |
| Loading | Quiet | "Loading…" / skeleton (often silent) | A spinner with no end |
| Error | Calm, plain | "Couldn't [X]. [Why]. **Try again**" | "Error", codes, blame |
| Offline | Matter-of-fact | "You're offline — showing last synced data" | A blocking modal |
| Blocked | Directive | "You need [X] to [Y]. [Get it]" | A silent dead control |
| Success | Brief, forward | "[Done]. [Next step]" | "Done." alone |

Never blame the user ("You entered an invalid…" → "That email doesn't look right — check the format"). Never use jargon or codes as the primary message. Never make empty states sad or error states cute.

## 14. Common mistakes

- **Designing only the happy path** — shipping the populated state and discovering empty/loading/error in production.
- **A literally blank empty screen** — no value, no action, no glimpse; the user assumes it's broken.
- **Conflating the three empty states** — showing "no results" copy to a first-time user, or "get started" to someone who just cleared their inbox.
- **Forced upfront product tours** — multi-slide carousels users skip and forget; explaining instead of letting them *do*.
- **Asking permissions on launch** — burning your one OS prompt before the user understands why, earning a permanent Deny.
- **No error recovery** — "An error occurred" with an OK button and no retry, no cause, no next step.
- **No loading state → layout shift** — blank flash then content snapping in, reading as jank/broken.
- **Onboarding that explains instead of does** — passive tooltips over hands-on first action.
- **No zero-results help** — a dead-end empty search with no suggestion, broaden, or clear-filters path.
- **Wiping user input on error** — making people re-type a whole form because one field or the network failed.
- **Sample data that pollutes** — demo content that syncs, counts in analytics, or can't be removed.
- **A success state that just says "Done"** — wasting the highest-intent moment instead of offering the next step.
