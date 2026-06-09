---
name: internationalization-and-localization
description: Reference-grade guide to building locale-ready UIs — i18n vs l10n vs translation, text expansion, RTL/bidi with CSS logical properties and :dir(), locale formatting via Intl, ICU MessageFormat pluralization, script typography, cultural imagery, and a real translation workflow with pseudolocalization.
tags: [design-systems, i18n, l10n, rtl, localization]
---
# Internationalization & Localization

Designing for one language and bolting on translation later is the most expensive shortcut in product. Layouts crack under German, hardcoded `MM/DD/YYYY` lies to half the planet, `"You have " + count + " items"` can't pluralize in any language but English, and a left-pinned sidebar lands on the wrong edge in Arabic. Build for many locales from the first commit.

## Three distinct disciplines

| Term | What it is | Who owns it | When |
|------|-----------|-------------|------|
| **Internationalization (i18n)** | Engineering the product so it *can* support any locale: externalized strings, locale-aware formatting, logical layout, RTL support, font fallback | Engineers + designers | Build time, once |
| **Localization (l10n)** | Adapting the product *to a specific locale*: translated copy, local formats, culturally-fit imagery, legal compliance | Localizers + translators + designers | Per target locale |
| **Translation** | Converting text from one language to another | Translators | A subtask of l10n |

> i18n = "18 letters between i and n". l10n = "10 between l and n". i18n is the foundation that makes l10n cheap. Translation alone is *not* localization — translated text in an LTR-only layout with US date formats is still broken.

A **locale** is more than a language. It's `language-REGION` (BCP 47): `en-US` ≠ `en-GB` (color/colour, MM/DD vs DD/MM), `pt-BR` ≠ `pt-PT`, `zh-Hans` (Simplified) ≠ `zh-Hant` (Traditional). Region drives formatting; language drives translation. Always carry the full tag.

## Text expansion — design for the longest string, not the English one

Translated text changes length. UI built tight around English overflows, truncates, or wraps badly.

| Source EN length | Typical expansion | Example |
|------------------|-------------------|---------|
| 1–10 chars | up to **200–300%** | "View" → "Anzeigen", "Show" → "Visualizza" |
| 11–20 chars | up to **180%** | German compounds run long |
| 21–30 chars | up to **160%** | |
| 50+ chars | up to **130%** | German averages **+35%**; Finnish, Russian similar |

CJK and some scripts *shrink* (fewer characters) but need taller line boxes. Plan for both directions.

Rules:
- **No fixed-width buttons or labels.** Let containers grow; use `min-width` not `width`. Allow wrapping or set sensible `max-width`.
- **Give layouts vertical and horizontal slack.** Two lines of label today = three lines tomorrow.
- **Never bake text into images/sprites.** It can't be translated, scales badly, and breaks for screen readers. Use live text over the image, or SVG `<text>` you can swap per locale.
- **Avoid truncation of meaningful content;** if you must, truncate by grapheme cluster, not byte, and show full text on hover/focus.
- **Don't rely on text fitting in a column** — test with pseudolocalization (below) early.

```css
/* DON'T — English-tuned, clips other locales */
.btn { width: 96px; height: 32px; white-space: nowrap; overflow: hidden; }

/* DO — content-sized, room to grow */
.btn {
  min-width: 6ch;
  padding-block: 0.5rem;
  padding-inline: 1rem;
  white-space: normal;       /* allow wrap if needed */
  overflow-wrap: break-word;
}
```

## RTL & bidirectional layout

Arabic, Hebrew, Persian (Farsi), Urdu, and others read **right to left**. The whole layout mirrors — not just text alignment. Numbers inside RTL text still run left-to-right (bidi).

### Use logical properties, never physical left/right

This is the single highest-leverage RTL technique. Logical properties resolve direction at runtime; physical ones don't.

| Physical (avoid) | Logical (use) | Mirrors in RTL? |
|------------------|---------------|-----------------|
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` | yes |
| `padding-left` | `padding-inline-start` | yes |
| `left` / `right` (insets) | `inset-inline-start` / `inset-inline-end` | yes |
| `text-align: left` | `text-align: start` | yes |
| `border-left` | `border-inline-start` | yes |
| `width` / `height` | `inline-size` / `block-size` | direction-aware |
| `float: left` | `float: inline-start` | yes |

```css
/* DON'T — hardcoded, breaks in RTL */
.card { margin-left: 16px; padding-right: 12px; text-align: left; border-left: 2px solid; }

/* DO — flips automatically with dir="rtl" */
.card {
  margin-inline-start: 16px;
  padding-inline-end: 12px;
  text-align: start;
  border-inline-start: 2px solid;
}
```

Flexbox and Grid already follow `direction` — `flex-direction: row` reverses, `justify-content: flex-start` becomes the start edge. Prefer them over absolute positioning.

### Set direction at the root, target it with `:dir()`

```html
<html lang="ar" dir="rtl">      <!-- or dir="auto" to infer from first strong char -->
```

```css
/* Modern: style by resolved direction without an attribute selector */
.icon-chevron { transform: scaleX(1); }
:dir(rtl) .icon-chevron { transform: scaleX(-1); }   /* flip the arrow */

/* Fallback for older engines */
[dir="rtl"] .icon-chevron { transform: scaleX(-1); }
```

`:dir()` reflects the *resolved* direction (including `dir="auto"`), which `[dir="rtl"]` cannot. Provide the attribute-selector fallback until Safari support is universal in your matrix.

### What mirrors vs what does not

| Mirrors (flip in RTL) | Stays the same |
|-----------------------|----------------|
| Page layout, columns, nav order | Brand **logos** and logotypes |
| Back/forward, next/prev arrows | **Numbers** and number-shaped data |
| Progress bars, sliders, carousels direction | **Clocks** / analog time |
| Breadcrumb chevrons, dropdown carets | **Media controls** (play ▶ always points to playhead direction = right) |
| List bullets, checkmark alignment | Phone keypads, calculators |
| Icons implying direction (reply, undo, send) | Icons with no direction (search, settings, heart) |
| Text and form field alignment | Photographs of real scenes, maps |

When unsure, ask: *does this icon imply forward motion or sequence?* If yes, mirror it. A "play" triangle does **not** mirror because it points toward the timeline's advancing edge (which is also why media scrubbers don't flip).

### Bidi isolation — stop strings from corrupting each other

When you interpolate user data (a name, a URL) into directional text, the bidirectional algorithm can reorder neighboring characters. Isolate untrusted runs.

```html
<!-- A Hebrew filename inside an English sentence can scramble punctuation -->
<p>Downloaded <bdi>קובץ.pdf</bdi> successfully.</p>
```

```css
.user-content { unicode-bidi: isolate; }   /* CSS equivalent of <bdi> */
```

In JS, wrap with Unicode isolates `⁨ … ⁩` (FSI/PDI) or use `Intl` which handles it. Never concatenate directional fragments without isolation.

## Locale-aware formatting with the `Intl` API

**Never hardcode formats.** `Intl` reads Unicode **CLDR** data — the authoritative locale database — so the browser/runtime does the locale-correct thing. It covers dates, numbers, currency, units, lists, relative time, plurals, and collation.

### Dates & times

Order, separators, month names, era, and **calendar system** vary. `01/02/2026` is Jan 2 in the US and Feb 1 in the UK.

```js
new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(d); // Jun 5, 2026
new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d); // 5 Jun 2026
new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(d); // 2026/06/05
new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(d);   // ٥ يونيو ٢٠٢٦

// Non-Gregorian calendars (Islamic, Buddhist, Hebrew, Japanese eras)
new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { dateStyle: 'long' }).format(d);
new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { dateStyle: 'long' }).format(d); // 2569

// Time zones — store UTC, format per user zone. NEVER assume server zone.
new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(d);
```

- **24h vs 12h** is locale-driven; let `Intl` pick (`hourCycle` to override). Most of the world uses 24h; the US/UK use 12h with AM/PM.
- **First day of week** varies (Sun in US, Mon in EU/ISO, Sat in much of MENA). Get it from CLDR week data, not a constant.
- Use `Intl.RelativeTimeFormat` for "3 days ago" / "in 2 hours" instead of building strings.

### Numbers, currency, units

```js
new Intl.NumberFormat('en-US').format(1234567.89); // 1,234,567.89  (comma group, dot decimal)
new Intl.NumberFormat('de-DE').format(1234567.89); // 1.234.567,89  (dot group, comma decimal)
new Intl.NumberFormat('fr-FR').format(1234567.89); // 1 234 567,89  (thin-space group)
new Intl.NumberFormat('hi-IN').format(1234567.89); // 12,34,567.89  (Indian lakh grouping!)

// Currency — symbol, placement, and spacing all vary
new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(9.9); // $9.90
new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(9.9); // 9,90 €
new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(990); // ￥990 (no minor units)

// Units & lists
new Intl.NumberFormat('en-US', { style: 'unit', unit: 'kilometer-per-hour' }).format(80); // 80 km/h
new Intl.ListFormat('en', { type: 'conjunction' }).format(['A','B','C']); // A, B, and C
```

> Decimal/grouping separators **invert** between en and de. A naive `parseFloat` on de-DE input ("1.234,56") reads 1.234. Parse with locale awareness, or store machine numbers (`.`-decimal, no grouping) and only *format* for display.

## Pluralization, gender & ICU MessageFormat

English has 2 plural forms (1 / other). Arabic has **6** (zero, one, two, few, many, other). Russian, Polish, Welsh have intricate rules. You cannot "add an s."

### CLDR plural categories

`zero · one · two · few · many · other` — not every language uses all six; `other` is always required as the fallback.

```js
new Intl.PluralRules('en').select(1);  // 'one'
new Intl.PluralRules('en').select(2);  // 'other'
new Intl.PluralRules('ar').select(0);  // 'zero'
new Intl.PluralRules('ar').select(11); // 'many'
new Intl.PluralRules('pl').select(3);  // 'few'
```

### ICU MessageFormat — the interchange standard

Don't concatenate sentence fragments — word order and agreement differ per language, and translators can't reorder fragments. Put the whole message in one ICU string with placeholders, and let the formatter pick the branch.

```
You have {count, plural,
  =0 {no new messages}
  one {# new message}
  other {# new messages}
}.
```

```
{gender, select,
  female {She updated her profile}
  male {He updated his profile}
  other {They updated their profile}
}
```

Nested plural + select + interpolation works too. Use a library that speaks ICU: `intl-messageformat`, `@formatjs/intl` (FormatJS), `i18next` (ICU plugin), `Lingui`, or Fluent (Mozilla's superset).

- `#` is the locale-formatted number inside `plural`.
- `=0` exact-matches before category rules, for natural copy ("no items").
- **Interpolate, never concatenate.** `t('greeting', { name })` not `t('hello') + name`.
- Pass numbers/dates to the formatter as values, not pre-formatted strings — the message owns the formatting.

## Names, addresses, and personal data

Hardcoding "First name / Last name" is a Western assumption that fails most of the world.

- **Names:** Don't split into first/last. Many cultures put family name first (Chinese, Japanese, Korean, Hungarian); many people have one name (mononyms), or several given/family names. Use a single **"Full name"** field unless you have a real reason to split. Don't require a middle name. Don't assume a name maps to a gender. Honorifics (San, Sahib, von) and particles vary.
- **Display order:** show names per locale convention; store the components you actually need and a display string.
- **Addresses:** field set, order, and postal-code shape differ wildly (some countries have no postal codes; Japan orders largest-to-smallest unit; US has state, others have none). Prefer a single multi-line address textarea or a locale-driven address-field library (Google's libaddressinput data) over a fixed US schema. Make "State/Province" optional.
- **Phone:** store E.164 (`+<country><number>`), accept varied input, format for display with a locale-aware library (libphonenumber). Don't hardcode a 3-3-4 mask.
- **Gender:** if you collect it at all, make it optional and inclusive (non-binary, prefer-not-to-say) — and remember grammatical gender (above) is separate from a profile field.

## Typography across scripts

Latin defaults break other writing systems. Match font, metrics, and rendering to the script.

| Script | Watch for |
|--------|-----------|
| **CJK** (中文 / 日本語 / 한국어) | Larger effective size; **increase `line-height`** (≈1.7–2.0) — glyphs are dense. **No faux bold/italic** — synthesize nothing; ship real weights or skip emphasis. Allow line breaks between any characters (`line-break`, `word-break: normal`). Support **vertical text** (`writing-mode: vertical-rl`) where the design calls for it. |
| **Arabic** | **Connected (cursive) script** — letters change shape by position; never letter-space or break joins. Render **larger** (Latin 16px ≈ Arabic 18–20px) and looser line-height for legibility. RTL. No faux styling. |
| **Indic** (Devanagari, Tamil, Bengali…) | Complex shaping, stacked conjuncts, above/below-baseline marks; needs a proper OpenType shaper and generous line-height. Don't clip ascenders/descenders. |
| **Thai/Lao/Khmer** | No spaces between words; line-breaking needs dictionary support. Tall stacked marks. |

```css
/* Per-script font fallback stacks, switched by lang */
:root { --font-latin: "Inter", system-ui, sans-serif; }
:lang(ja) { --font: "Noto Sans JP", var(--font-latin); line-height: 1.8; }
:lang(ar) { --font: "Noto Sans Arabic", var(--font-latin); font-size: 1.08em; }
:lang(zh-Hans) { --font: "Noto Sans SC", var(--font-latin); line-height: 1.75; }
body, [lang] { font-family: var(--font, var(--font-latin)); }
```

- **Never synthesize bold/italic** for scripts that lack them — the browser fakes glyphs that don't exist. Ship the real face or use weight/color/size for emphasis.
- **Font fallback stacks** must include a script-covering family (Noto family covers nearly all scripts). A missing glyph renders as tofu (□).
- **Subset and self-host variable fonts per script** — a full CJK font is megabytes. Use `unicode-range` to load only needed ranges and ship one variable font per script rather than many static weights.

```css
@font-face {
  font-family: "Noto Sans SC";
  src: url("/fonts/noto-sc-var.woff2") format("woff2-variations");
  font-weight: 100 900;                          /* variable axis */
  unicode-range: U+4E00-9FFF, U+3000-303F;       /* load CJK ranges only */
  font-display: swap;
}
```

## Imagery, color & iconography are cultural

Visual meaning is not universal — localize it like text.

- **Color symbolism varies:** white = weddings in the West, **mourning** in much of East Asia; red = luck/celebration in China but danger/debt elsewhere; green carries religious weight in parts of the Muslim world. Don't bake a single color's *meaning* into UX (e.g. "red = bad") without checking the market.
- **Gestures & hands:** thumbs-up, OK sign, beckoning, the sole of a foot — offensive in some cultures. Avoid hand iconography that carries social meaning; prefer neutral symbols.
- **People & imagery:** reflect the local audience; avoid culturally-specific scenes (holidays, attire, food) as universal defaults. Review for religious/political/taboo sensitivities per market.
- **Flags are not languages.** A flag represents a *country*, not a language — Spanish isn't "Spain", English isn't "🇺🇸/🇬🇧", and using a flag forces a political choice (which flag for Arabic?). Use the **language name in its own script** ("Español", "日本語", "العربية") in the language switcher.

## Translation workflow

Treat strings as content with a pipeline, not literals in code.

1. **Externalize all strings** into resource files (JSON/PO/XLIFF/ARB), one per locale. Nothing user-facing lives in source.
2. **Key by meaning, not by English text.** Use `checkout.button.submit`, not `"Place order"`. English-as-key breaks when the source copy changes and collides when the same English means two things.
3. **Give translators context.** Add descriptions/notes ("button label, max ~15 chars", "noun not verb") and, ideally, **screenshots** showing where the string appears. Ambiguity ("Open" = adjective or verb?) is the #1 source of bad translations.
4. **Pseudolocalization for testing** — generate a fake locale that simulates real-locale stress *before* any human translation:
   - Accent every char: `Edit` → `[Éḋíţ ⟦padding⟧]`
   - **Expand ~40%** to expose tight layouts.
   - Add brackets `[…]` to reveal clipped/concatenated strings.
   - Add an RTL pseudo-locale to surface mirroring bugs.
   - A clean pseudolocalized build means strings are externalized and layouts breathe. Ship this gate before translation spend.
5. **Machine vs human:** MT (DeepL, Google) for scale/draft/low-visibility; **human review for anything user-trust-critical** (legal, marketing, errors). Post-edited MT is a common middle ground.
6. **QA per locale:** length overflow, truncation, RTL mirroring, format correctness, font/glyph coverage, untranslated leakage. Run in-context (in the real UI), not in a spreadsheet.
7. **Continuous localization:** wire a TMS (Crowdin, Lokalise, Phrase, Transifex, Tolgee) to CI so new strings flow to translators and translations flow back automatically.

## Legal & regional formats

- **Date/time:** 24h vs 12h, week start, calendar system (above).
- **Units:** metric vs imperial (US, Liberia, Myanmar use imperial); temperature °C/°F; paper sizes **A4 (most of world) vs US Letter** for print/PDF.
- **Currency & tax:** display per-locale, but also handle whether prices include tax (EU shows tax-inclusive; US adds at checkout).
- **Legal:** privacy/consent copy (GDPR, etc.), required disclosures, and content rules differ by region — these are localization deliverables, not afterthoughts.

## Common mistakes — do / don't

| Don't | Do |
|-------|-----|
| Concatenate sentence fragments (`t('you_have') + n + t('items')`) | One ICU message with placeholders + plural/select |
| Hardcode date/number/currency formats | `Intl.DateTimeFormat` / `NumberFormat` (CLDR) |
| Bake text into images/sprites | Live text or SVG `<text>` swappable per locale |
| Fixed-width buttons/labels | Content-sized with room for **+35%** expansion |
| `margin-left` / `text-align: left` | `margin-inline-start` / `text-align: start` |
| Assume LTR everywhere | `dir`/`:dir()`, logical props, test an RTL pseudo-locale |
| Use a flag for a language | Language name in its own script |
| First name / Last name required | Single "Full name"; don't assume order or gender |
| "Add an s" pluralization | `Intl.PluralRules` + ICU `plural` (6 categories) |
| Key strings by English text | Semantic keys + translator context + screenshots |
| Faux bold/italic on CJK/Arabic | Real font weights; size/weight/color for emphasis |
| Assume server time zone | Store UTC, format in the user's `timeZone` |

## Definition of done

- All user-facing strings externalized, semantically keyed, with translator context.
- Every date/number/currency/unit/list goes through `Intl`; nothing hardcoded.
- Plurals/gender use `Intl.PluralRules` + ICU MessageFormat, never concatenation.
- Layout uses logical properties; RTL verified via `dir="rtl"` and an RTL pseudo-locale.
- Per-script font stacks with full glyph coverage; no faux styling; subset variable fonts.
- Pseudolocalized build passes (expansion + bracket + accent + RTL) before translation.
- Locale switcher uses language names, not flags; time zones, week start, calendars correct.
