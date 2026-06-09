---
name: forms-and-data-entry
description: Reference-grade guide to forms and data entry — single-column layout, persistent labels, the right input type + mobile keyboard + autocomplete token per field, blur-timed inline validation with :user-invalid and actionable errors, smart defaults, multi-step wizards, and data tables/grids at scale, all keyboard- and screen-reader-accessible across web and mobile.
tags: [design-systems, forms, inputs, validation, data]
---
# Forms & Data Entry

A form is a conversation, not an interrogation. Every field is a cost the user pays; every field you remove is a conversion you keep. The job: ask for the least, in the clearest order, with the right control and keyboard, validate kindly, and tell people exactly how to fix mistakes. Get layout, labels, input type, and validation right and the rest is polish.

## 1. Form layout

**Single column wins.** A single top-to-bottom column has one unambiguous reading path; multi-column forms force the eye to zig-zag, double completion time, and routinely get fields skipped or mis-paired. The only sanctioned exceptions sit *inside* one logical field and read left-to-right anyway: `City / State / ZIP`, `Expiry / CVC`, `First / Last`. Never split unrelated fields across columns.

| Do | Don't |
|---|---|
| One vertical column, full-width fields | Two columns of unrelated inputs side by side |
| Group `Expiry`+`CVC`, `City`+`State`+`ZIP` on one row | Put `Name` and `Phone` side by side |
| Order fields the way the user thinks (name → email → address → payment) | Random or DB-schema order |
| One thing per screen on mobile for long flows | Cram a 15-field form onto one mobile view |

- **Minimize length.** Cut every field that isn't required *now*. Each removed field measurably lifts completion. Derive what you can (country from IP, city/state from ZIP lookup) instead of asking.
- **Group with `<fieldset>` + `<legend>`** for related sets (an address block, a radio group). Section long forms with headings ("Contact", "Shipping", "Payment") and visual breaks so it reads as chunks, not a wall.
- **Logical order:** identity → contact → details → payment → review. Match the user's mental model and any physical artifact (the card layout, the paper form).
- **One-thing-per-screen on mobile:** for onboarding/checkout, a sequence of focused single-question screens beats one giant scroll. Higher completion, trivial keyboard handling, natural progress.

## 2. Labels

The label is the contract. It must be **visible, persistent, programmatically associated, and clickable.**

```html
<!-- Always: real <label for> tied to input id. Clicking the label focuses the field. -->
<label for="email">Email address</label>
<input id="email" name="email" type="email" autocomplete="email" />
```

| Placement | Pros | Cons | Use when |
|---|---|---|---|
| **Top (default)** | Fastest scan, single eye-path, wraps on mobile, most room | Slightly taller form | Almost always — the safe default |
| **Left / inline** | Compact vertical height | Slow eye-path, fragile RTL/i18n, weak on mobile | Dense desktop settings, short label set |
| **Floating** | Compact at rest, label persists once filled | Tiny when floated, animation distracts, empty-state reads like placeholder | Space-constrained, when done carefully |

- **Never use placeholder text as the label.** It vanishes the moment a user types, destroys recall and error-recovery, fails low-vision contrast, and breaks autofill. Placeholders are *optional hints* (a format example), nothing load-bearing.
- **Mark the minority.** If most fields are required, mark **optional** ("Phone (optional)"). If most are optional, mark required. Don't make people decode a sea of `*`. If you use `*`, define it and add `aria-label="required"` / `required`.
- **Helper text** goes below the label, persistent: "We'll only use this to send your receipt." Associate it via `aria-describedby` so AT reads it.
- **Character counts** for limited fields: live, polite (`aria-live="polite"`), shown as remaining ("28 left"), and never the sole signal — pair with `maxlength` only when a hard cap is real (don't cap names/addresses).

## 3. Input types + mobile keyboards

The single highest-leverage detail: pick the `type` + `inputmode` + `autocomplete` that summons the right keyboard, enables autofill, and gives free validation. **Critical rule: numeric *strings* are `type="text" inputmode="numeric"` + `pattern`, NOT `type="number"`.** `type="number"` is only for true quantities you'd do math on (with a stepper) — its spinner, scroll-to-mutate, and leading-zero stripping corrupt OTPs, card numbers, ZIPs, and PINs.

| Data | `type` | `inputmode` | `autocomplete` | Notes |
|---|---|---|---|---|
| Free text | `text` | — | `name`/`off` | default |
| Full name | `text` | — | `name` | also `given-name` / `family-name` |
| Email | `email` | `email` | `email` | `@`-key keyboard, format validation |
| Phone | `tel` | `tel` | `tel` | telephone keypad |
| URL | `url` | `url` | `url` | `/` `.com` keys |
| Numeric quantity | `number` | `numeric` | — | true number, with stepper |
| OTP / ZIP / PIN / card | `text` | `numeric` | `one-time-code` / `postal-code` / `cc-number` | **never `type=number`**; add `pattern="[0-9]*"` |
| Decimal (price) | `text` | `decimal` | — | decimal-point keypad |
| Search | `search` | `search` | — | "Search" return key, clear affordance |
| Date | `date` | — | `bday` | native picker; or 3 selects if range is wide |
| Password | `password` | — | `current-password` / `new-password` | reveal toggle; `new-password` triggers manager generation |
| Username | `text` | — | `username` | passkey-aware (§5) |

```html
<!-- One-time code: text + numeric keypad + SMS autofill, no number spinner -->
<label for="otp">Verification code</label>
<input id="otp" name="otp" type="text" inputmode="numeric"
       autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" />
```

**Autocomplete tokens are a fixed vocabulary — don't invent values.** Common ones: `name` `given-name` `family-name` `email` `tel` `username` `current-password` `new-password` `one-time-code` `street-address` `address-line1` `postal-code` `country` `cc-name` `cc-number` `cc-exp` `cc-csc` `bday`. Correct tokens unlock browser/OS autofill — a massive speed and accuracy win, especially on mobile.

**Right control for the data — match cardinality:**

| Choices | Control |
|---|---|
| 2 mutually exclusive (on/off, immediate effect) | **Toggle/switch** |
| 2–5, pick one, all visible | **Radio group** |
| Many (>5), pick one | **Select / combobox** (combobox once ~8+, to allow typeahead) |
| Multi-select, few | **Checkbox group** |
| Bounded number, fine adjust | **Stepper** (small range) or **Slider** (imprecise/visual) |
| Single binary opt-in (terms) | **Single checkbox** |

Toggle = instant state change (saves on flip). Checkbox = a value submitted with the form. Don't use a toggle where the user must still press Save.

## 4. Validation + errors

This is where forms are won or lost. **Validate to help, not to punish.** Two anti-patterns dominate: punishing-while-typing (red errors on the first keystroke) and preventing-then-yelling (a disabled submit that won't say why).

**Timing:**
- **On blur (default for most fields):** validate when the user *leaves* a field, so you never flag an email as invalid mid-type.
- **Real-time, positive only, while typing:** for format/strength meters where live feedback helps (password rules going green, username availability) — confirm progress, don't scold.
- **On submit:** always re-validate everything server-side; on the client, surface anything missed and move focus to the first error + summary.
- **Reward early, punish late:** once a field has errored, you *may* re-validate on input to clear the error as soon as it's fixed (turn it green/neutral immediately). Error late, forgive early.

**Use `:user-invalid` / `:user-valid`, not `:invalid`.** `:invalid` matches on page load — an empty required field is "invalid" before the user has touched anything, lighting your whole form red. `:user-invalid` fires **only after the user has interacted and blurred**, which is exactly blur-timed validation for free, no JS.

```css
input:user-invalid {
  border-color: var(--red-8);
  box-shadow: 0 0 0 1px var(--red-8);
}
input:user-valid { border-color: var(--green-8); }
```

**Error message rules:**
- **Specific + actionable.** Bad: "Invalid input." Good: "Enter a date in the past, e.g. 1990-04-23." Name the field, the rule, and the fix.
- **At the field AND in a summary** for multi-error submits. The inline message sits next to the field; the summary at the top lists every error as in-page anchor links.
- **Don't rely on color** — pair red with an icon and text (color-blind users, AT).
- **Move focus to the summary (or first error) on failed submit**, so keyboard and screen-reader users aren't stranded at the bottom.

```html
<div class="field" data-invalid>
  <label for="pw">Password</label>
  <input id="pw" type="password" autocomplete="new-password"
         aria-invalid="true" aria-describedby="pw-help pw-err" required />
  <p id="pw-help" class="help">At least 12 characters.</p>
  <p id="pw-err" class="error" role="alert">Password must be at least 12 characters — you entered 8.</p>
</div>
```

```html
<!-- Error summary: focus this on submit failure -->
<div role="alert" tabindex="-1" id="form-errors">
  <h2>There are 2 problems</h2>
  <ul>
    <li><a href="#email">Enter a valid email address</a></li>
    <li><a href="#pw">Password must be at least 12 characters</a></li>
  </ul>
</div>
```

- **Success states:** a subtle check/green border on async-verified fields (username available, valid coupon) reassures — don't overdo it on every trivial field.
- **Never disable the submit button to "enforce" validity.** A disabled button gives no reason, can't be focused to read a tooltip, and leaves users stuck guessing. Keep submit enabled; on click, validate and surface errors. (Exception: a brief disable *during* in-flight submission to prevent double-send.)

## 5. Smart defaults, autofill, progressive disclosure, multi-step, passkeys

- **Smart defaults:** pre-fill what you safely know (country, currency, today's date, most-common option). A good default is a field the user doesn't have to think about. Never pre-tick consent/marketing.
- **Autofill:** correct `autocomplete` tokens (§3) let browsers/password managers fill name, address, payment, and OTP in one tap. This is the biggest mobile speed win available — never break it with custom widgets that hide the real `<input>`.
- **Passkeys / WebAuthn:** for sign-in, use `autocomplete="username webauthn"` to surface passkeys in the autofill (conditional-UI) menu alongside saved passwords. Offer passkey enrollment on account creation; it eliminates the password field entirely.
- **Progressive disclosure / conditional fields:** show fields only when relevant ("Do you have a discount code?" → reveal the field on yes). Reduces apparent length and cognitive load. Keep DOM order sane so reveal doesn't jump focus unexpectedly; announce newly revealed required fields.
- **Multi-step / wizard:** for long flows, split into steps with a **visible progress indicator** ("Step 2 of 4"), **persisted state** (don't lose answers on back/refresh), and a working **Back** button. Validate each step before advancing, but let users move backward freely. Save partial progress server-side for long/important forms.
- **Inline editing:** for record views, click-to-edit a single value in place (display → input → save/cancel) beats a separate edit form. Show the editable affordance on hover/focus, confirm on Enter/blur, allow Esc to cancel, and give clear saved/failed feedback.

## 6. Data display + entry at scale — tables & grids

A data table is a form for *many* records. The same discipline applies: right control per column, scannable alignment, and clear states.

| Column type | Alignment | Notes |
|---|---|---|
| Numbers / currency / % | **Right** | tabular figures (`font-variant-numeric: tabular-nums`), consistent decimals |
| Text / names | **Left** | truncate with tooltip, don't wrap chaotically |
| Dates | Left (or right if comparing) | one consistent format, relative + absolute on hover |
| Status / tags | Left | icon + text chip, not color alone |
| Actions | Right | icon buttons or a row menu (`⋯`) |

- **Sticky header (and first column)** so column meaning and row identity stay visible while scrolling a long/wide table. `position: sticky; top: 0` on `<thead>`.
- **Sort & filter:** sortable `<th>` is a `<button>` with `aria-sort="ascending|descending|none"`; show the active sort glyph. Provide column filters and/or a global search for large sets; show active-filter chips with clear-all.
- **Row density:** offer comfortable / compact toggles (more rows per screen for power users). Default comfortable; keep touch targets ≥44px on touch.
- **Pagination vs infinite scroll:** *pagination* for tasks where users need stable position, counts, and "page 3" recall (most data tables, admin); *infinite scroll* for exploratory feeds. Never infinite-scroll a table with a footer or where users must reach a known row. Show total count and current range.
- **Bulk select + actions:** a header checkbox (with **indeterminate** state for partial selection), per-row checkboxes, and a contextual action bar that appears with a live selection count ("3 selected: Delete / Export"). Persist selection across pages only if you tell the user.
- **Inline edit:** double-click or a per-cell edit affordance turns a cell into an input; validate on blur, save optimistically with rollback on error, support Tab/Enter to move between cells (editable-grid pattern). Keep keyboard navigation (arrows between cells, Enter to edit).
- **Every table needs four states:** **loading** (skeleton rows matching column layout, not a centered spinner that shifts layout), **empty** (helpful: "No invoices yet" + primary action, distinct from "no results for this filter" + clear-filters), **error**, and **partial** (some rows failed to load).
- **Key-value** for single-record detail (label : value pairs, right-aligned labels optional); **editable grid** (spreadsheet-like) when bulk entry is the job — give it copy/paste, fill-down, and per-cell validation.

## 7. Accessibility

| Requirement | How |
|---|---|
| Programmatic label | `<label for>`/`id`, or `aria-label`/`aria-labelledby` when no visible label |
| Grouped controls | `<fieldset>` + `<legend>` for radio/checkbox groups and field clusters |
| Error association | `aria-invalid="true"` + `aria-describedby` pointing at the error id (and helper id) |
| Error summary | container with `role="alert"` `tabindex="-1"`; **move focus to it** on submit failure; links jump to fields |
| Required | native `required` (+ visible "required"/"optional" text, not `*` alone) |
| Autofill | correct `autocomplete` tokens (also an a11y win — less typing) |
| Target size | ≥44×44px (iOS) / 48×48dp (Android); ≥24px WCAG 2.2 minimum |
| Live feedback | `aria-live="polite"` for char counts/availability; `role="alert"` for errors |

`aria-describedby` can list multiple ids (`aria-describedby="pw-help pw-err"`) — AT reads helper *and* error. Don't remove the label when an error appears; replace/augment the *helper*, keep the label.

## 8. Mobile specifics

- **Summon the right keyboard** with `type` + `inputmode` (§3) — the email keyboard, number pad, URL keys. This alone removes huge friction.
- **Avoid typing:** prefer pickers, steppers, segmented controls, and smart defaults over free text. Native date/time pickers over typed dates. Autofill (§3, §5) over re-keying address/payment.
- **Big targets, spacing:** ≥44/48px, ≥8px gap between adjacent tappables; full-width fields and buttons.
- **Keyboard avoidance:** ensure the focused field and its error scroll into view above the on-screen keyboard; sticky submit bars must not hide behind it.
- **`autofocus` with caution:** auto-focusing the first field on mobile pops the keyboard and can hide context/headings. Fine on a single-purpose screen (search, OTP); avoid on dense forms.
- **One question per screen** for long mobile flows (§1) — fastest path to completion.

## 9. Common mistakes (do / don't)

| Don't | Do |
|---|---|
| Placeholder text as the label | Persistent `<label for>`; placeholder = optional hint only |
| Multi-column layout of unrelated fields | Single column; group only same-row sub-fields |
| `:invalid` styling (red on page load) | `:user-invalid` (only after interaction + blur) |
| Validate aggressively on every keystroke | Validate on blur; forgive on input once fixed |
| Vague errors ("Invalid input") | Specific + actionable, name field + rule + fix, at field + summary |
| Disabled submit button to enforce validity | Keep enabled; validate on click, focus first error |
| `type="number"` for OTP/ZIP/card/PIN | `type="text" inputmode="numeric"` + `pattern` |
| Custom widgets that hide the real `<input>` | Real inputs with `autocomplete` tokens — keep autofill alive |
| Clearing all fields when one errors | Preserve every entered value; only flag the bad one |
| Ask for everything up front | Ask the minimum; derive/disclose progressively |
| No saved state in multi-step wizard | Persist answers; working Back button; save partial progress |
| Reset/Clear button next to Submit | Drop it — accidental data loss, almost never wanted |
| Color-only error/status signal | Icon + text + color |
| Centered spinner that shifts table layout | Skeleton rows matching the column layout |
| Conflating "empty" and "no filter results" | Distinct states: empty (add first) vs no-results (clear filters) |

**Checklist before "form done":** single column · every field has a visible persistent `<label for>` · optional/required marked the right way · correct `type`+`inputmode`+`autocomplete` per field · numeric strings are `text`+`inputmode` not `number` · blur-timed validation via `:user-invalid` · errors specific + at field + summary with focus moved · submit not disabled to enforce validity · values preserved on error · autofill works · multi-step persists state · tables have loading/empty/error/partial + sticky header + right-aligned numbers · targets ≥44/48px · keyboard- and screen-reader-operable.
