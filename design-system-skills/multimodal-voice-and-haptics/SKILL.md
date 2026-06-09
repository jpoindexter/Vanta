---
name: multimodal-voice-and-haptics
description: Reference-grade guide to designing beyond the screen — combining touch/visual/voice/audio/haptic modalities, conversational and LLM-agent UX, voice UI principles and error recovery, sound design, iOS/Android haptics, and TV/automotive/wearable/AR contexts.
tags: [design-systems, voice, haptics, multimodal, conversational]
---
# Multimodal: Voice, Sound & Haptics

Screens are one channel. Real products speak, vibrate, chime, and listen — in cars, on wrists, across rooms, hands-free. This skill covers designing for **every output and input channel a human has**, and how to combine them without overwhelming the user. The governing principle: **pick the modality that matches the user's context and the task's nature, then layer modalities so each does what it's best at.**

## Modality strengths — pick the right channel

Every modality has a job it does well and jobs it does badly. Design by matching, not defaulting.

| Modality | Best for | Bad at | Context fit |
|---|---|---|---|
| **Visual** | Browsing, comparison, precision, dense info, scanning, persistent reference | Hands-busy, eyes-busy, no-screen | Desk, phone-in-hand, TV |
| **Voice input** | Fast input, hands-busy, eyes-busy, long dictation, search by name, "fire-and-forget" commands | Privacy, noisy rooms, precise editing, browsing options | Car, kitchen, accessibility, walking |
| **Voice/audio output** | Eyes-free confirmation, short answers, ambient notification, alerts | Long lists, comparison, precise data, privacy | Car, smart speaker, screen reader |
| **Haptic** | Confirmation, alert, texture/boundary feedback, silent notification | Conveying content, complex info | Wearable, phone-in-pocket, controller |
| **Touch/gesture** | Direct manipulation, precision, spatial control | Eyes-free, hands-busy, distance | Phone, tablet, touchscreen kiosk |

**Rule:** combine modalities so each does its strength. A smart-display timer shows remaining minutes (visual: precise), confirms "Timer set" (voice: eyes-free), and chimes when done (audio: ambient). Don't make one channel do everything.

**Eyes-free vs hands-free** are different constraints. Driving is *eyes-busy* (can glance briefly, can't read). Cooking is *hands-busy* (can look, can't touch). Walking-with-coffee is both. Identify which the user has before choosing.

---

## Voice UI / conversational design (VUI)

Voice has no buttons, no menus, no visual affordances. The user cannot see what they can say. This makes **discoverability the central VUI problem** — and it shapes every other decision.

### Grice's cooperative principles (the spine of conversation)
Good dialogue obeys four maxims. Violate one and the system feels robotic or rude.

| Maxim | Means | VUI application |
|---|---|---|
| **Quantity** | Say as much as needed, no more | Don't read 10 results; offer the top one + "want more?" |
| **Quality** | Be truthful; don't claim what you can't verify | "I'm not sure" beats a confident wrong answer |
| **Relevance** | Stay on the user's goal | Answer the question asked, not an adjacent one |
| **Manner** | Be brief, orderly, unambiguous | Short sentences, one idea each, no jargon |

### Turn-taking & barge-in
Conversation alternates. The system speaks, then **yields the floor** clearly (a tone, a falling intonation, silence). **Barge-in** = let the user interrupt and speak over the prompt; experienced users know what to say and shouldn't be forced to wait. Always allow it. Detect end-of-speech with an endpointer; don't cut users off mid-sentence (tune the silence timeout — too short clips slow speakers, too long feels laggy).

### Prompt design — open vs directed
- **Open prompt** ("What would you like to do?") — flexible, but the user doesn't know the vocabulary. Use only when the domain is obvious or for expert flows.
- **Directed prompt** ("You can check a balance or transfer money. Which one?") — teaches options, constrains recognition. Default for new users.
- **Tapered prompts** — full guidance first time, terse on repeat: "Which account?" not the full menu again.
- **Implicit menus** — bury the options in natural phrasing rather than reading a numbered list. Never "For X say one, for Y say two" unless legally required.

### Error recovery (the make-or-break of VUI)
Most voice failures aren't recognition — they're **bad recovery**. Three error types, each needs a distinct response:

| Error | Cause | Recovery |
|---|---|---|
| **No-input** (timeout) | User silent/unsure | Reprompt with more help: "Sorry, I didn't catch that. You can say…" |
| **No-match** (not understood) | OOV, noise, accent | Rephrase the prompt differently; offer examples; don't repeat verbatim |
| **Recognition error** (wrong) | Misheard | Confirm before acting; let user correct |

- **Escalating prompts:** each retry gives *more* help, not the same words louder. Reprompt 1 = light nudge, reprompt 2 = examples, reprompt 3 = graceful fallback.
- **Graceful fallback:** after 2–3 failures, hand off — to a human, to a screen, to a simpler yes/no, or "Let me text you a link." Never loop forever. **Three-strikes rule.**
- **Rapid reprompt:** if no-input, a quick "Still there?" beats a full menu re-read.

### Confirmation strategy
| Type | When | Example |
|---|---|---|
| **Explicit** | High-stakes, irreversible (payments, deletes, sends) | "Send $50 to Alex — yes or no?" |
| **Implicit** | Low-stakes, reversible; keeps flow fast | "Okay, $50 to Alex." (echoes back, no yes/no) |
| **None** | Trivial, easily undone | Just do it; allow "undo" |

Match confirmation cost to action cost. Explicit-confirming a volume change is annoying; implicit-confirming a wire transfer is dangerous.

### Persona, voice & tone
A voice *has* a personality whether you design one or not. Define it: warm vs efficient, formal vs casual, concise vs chatty. Keep it **consistent** across every prompt. Choose a TTS voice that fits brand and is intelligible at speed/over noise. Tone should **adapt to context** — terser when the user is in a hurry or has erred repeatedly, never cute during an error. Avoid over-anthropomorphizing (don't claim feelings or imply human understanding the system lacks).

### Brevity & lists
**Never read a long list aloud.** Working memory holds ~3–4 spoken items, not 7. Patterns:
- Offer the **top result** + "Want more options?" rather than all results.
- Read **3 at most**, then "…or hear more?"
- On a **multimodal** device, push the list to the screen and speak only the headline.

### Context & memory
Track conversational state: anaphora ("book *it*", "the *second* one"), carry-over slots ("…and make it *recurring*"), and prior turns. A system that forgets what was just said feels broken. Persist user preferences across sessions where privacy allows.

### Multimodal voice + screen (smart displays)
On Alexa Show / Google Nest Hub / CarPlay, voice and visual **co-present**. Rules:
- Voice carries the **headline**; screen carries the **detail/list**.
- Don't read what's clearly on screen verbatim — summarize, point ("Here are your options").
- Support both **touch and voice** for every action; users switch mid-task.
- Keep visuals **glanceable** — these are seen from across a room, not held.

### Wake words & always-listening
- Wake word ("Hey X") gates the always-on mic; only audio after the wake word is processed/sent. Make the **listening indicator unmistakable** (light ring, tone) so users know when it's hot.
- **Privacy is a first-class design concern:** disclose what's recorded, offer mic-off (hardware switch ideally), let users review and delete history, and never surprise-record. In shared/public space, assume bystanders haven't consented.

### Accessibility — voice two ways
- **Voice as access:** voice control is a primary input for users who can't use touch/keyboard (motor disability). Support full task completion by voice, not just shortcuts.
- **Access of voice:** voice-only interfaces **exclude** Deaf/HoH and speech-disabled users. Always provide a **non-voice path** (screen, text, touch). Voice should be an *option*, never the *only* door.

---

## Conversational / chat & LLM-agent UX

Text chat and LLM agents are voice's sibling — turn-based, but visible. The screen affords things voice can't (scrollback, citations, edit), and latency/uncertainty become visible problems.

**Do**
- **Stream tokens** as they generate — perceived latency drops sharply vs waiting for the full reply. Streaming is the single biggest chat-UX win.
- Show a **typing/thinking indicator** the instant the request fires (latency masking — fill the gap so it doesn't feel frozen).
- Offer a **Stop / cancel** button during generation, and **Regenerate** after.
- Provide **suggested replies / starter prompts** — they solve chat's blank-page version of the discoverability problem (what can I ask?).
- Show **citations / sources** inline for factual claims; make them clickable to the origin.
- Signal **uncertainty** honestly ("I'm not certain, but…") and surface errors as recoverable, not dead ends.
- Make agent **actions transparent** — show what tool ran, what it's about to do, and require confirmation before irreversible steps.
- Let users **edit and resend** a prior message; keep history scrollable and copyable.

**Don't**
- Don't block the UI on a long call with no feedback — always stream or indicate progress.
- Don't hide that an answer came from a model — label AI content.
- Don't auto-execute destructive agent actions without a confirm.
- Don't lose the user's typed message if generation fails — preserve and offer retry.

---

## Sound design

Sound is powerful and **easily abused**. The default should be **quiet**, with sound used deliberately and always under user control.

### Vocabulary
- **Earcon** — *abstract* musical motif mapped to an event (the Slack "knock", a startup chime). Learned, brand-able, composable into families.
- **Auditory icon** — *representational* sound that resembles its referent (trash-crumple for delete, camera-shutter for capture). Intuitive, no learning curve.
- **Notification sound** — short, distinct, recognizable across the room; differentiate priority by sound, not just volume.
- **Feedback sound** — confirms an action (send "whoosh", tap click).

### Principles
| Do | Don't |
|---|---|
| Default to silence/subtle; let sound be opt-in or contextual | Ship loud sounds on by default |
| Give a clear **mute/volume** control per sound category | Make sound un-disableable |
| Keep a **consistent sonic family** (same instrument/timbre across earcons) | Random unrelated sounds |
| Respect **silent mode / Do Not Disturb / focus** | Override the OS silent switch |
| Use **spatial audio** for directionality in AR/VR/gaming (where is the alert?) | Spatialize where it adds nothing |
| Use **sonification** to convey continuous data eyes-free (rising pitch = closer, Geiger counter, parking sensor) | Encode critical info in sound *alone* |

### Accessibility
- **Never rely on sound alone** — every audio cue needs a visual and/or haptic equivalent (Deaf/HoH users, muted phones, noisy rooms all miss it).
- **Caption** all spoken/meaningful audio in media.
- Don't use sound as the *only* signal for an error, success, or alert.

---

## Haptics

Haptic feedback is the most under-used and most over-used channel — a quiet "yes, that registered" or, done wrong, a buzzing nuisance. Restraint is everything.

### iOS — `UIFeedbackGenerator` family
| Generator | Use for |
|---|---|
| `UIImpactFeedbackGenerator` (`.light` / `.medium` / `.heavy`, plus `.soft`/`.rigid`) | A UI element collides/snaps — toggle flip, picker detent, drag-drop landing |
| `UINotificationFeedbackGenerator` (`.success` / `.warning` / `.error`) | Outcome of an operation — payment done, form invalid, action failed |
| `UISelectionFeedbackGenerator` | Discrete value change during a continuous pick — scrolling a wheel/slider through steps |
- **`prepare()`** the generator just before use to remove latency, then fire on the exact event.
- For rich custom textures, use **Core Haptics** (`CHHapticEngine`) — transient/continuous events with intensity & sharpness curves.

### Android
- **`View.performHapticFeedback(HapticFeedbackConstants…)`** — semantic constants (`CONFIRM`, `REJECT`, `LONG_PRESS`, `CLOCK_TICK`, `KEYBOARD_TAP`, `GESTURE_START/END`). Prefer these — they respect device tuning and user settings.
- **`VibratorManager` / `VibrationEffect`** (`createOneShot`, `createWaveform`, predefined `EFFECT_CLICK` / `EFFECT_TICK` / `EFFECT_HEAVY_CLICK`) for custom patterns. Newer APIs support richer actuators; older devices fall back to plain vibrate.
- Always require the `VIBRATE` permission and honor the system haptic setting.

### When to use haptics
| Pattern | Example | Strength |
|---|---|---|
| **Confirm** | Button/toggle activated, item added | Light impact / selection |
| **Alert** | Error, warning, validation fail | Notification warning/error |
| **Boundary / detent** | Slider step, scroll snap, pull-to-refresh threshold, end of list | Selection / light impact |
| **Texture / event** | Game collision, lock/unlock, success celebration | Custom Core Haptics / waveform |

### Do / Don't
| Do | Don't |
|---|---|
| Pair haptic with a visual change (haptic *reinforces*, rarely stands alone) | Buzz on every tap/scroll/keystroke — it desensitizes and drains battery |
| Map **intensity to importance** — heavy for errors, light for routine confirms | Use the same buzz for success and failure |
| Respect the **system haptics toggle** and provide an in-app off switch | Override the user's "reduce haptics" / silent preference |
| Keep patterns **short and distinct** | Long, ambiguous vibrations the user must decode |

### Accessibility
Haptics are a genuine **non-visual feedback channel** — valuable for low-vision users and eyes-free use. But some users disable them (sensory sensitivity) or can't perceive them — so **never make haptic the sole carrier** of information. Reinforce, don't replace.

---

## Beyond the phone — other modalities

### TV (10-foot UI)
- Designed to be read across a room; **large type, high contrast, generous spacing**, few items per screen.
- Input is a **D-pad / remote** (directional focus, not a pointer) or **voice remote**. Every element needs an obvious, high-contrast **focus state**; navigation must be predictable up/down/left/right.
- Minimize text entry — it's painful on a remote; prefer voice search and saved profiles.

### Automotive
- **Driver distraction is the constraint that overrides all else.** Glanceable visuals (≤2-second glances, NHTSA guidance), large touch targets, minimal depth.
- **Voice-first** for anything beyond a single tap — destination entry, messaging, calls. Keep menus shallow.
- Respect the **driving vs parked** state (lock complex tasks while moving). Follow CarPlay/Android Auto templates rather than free-form UI; they encode the safety rules.
- Combine: voice command + audio confirmation + a brief glanceable visual + a haptic on the wheel/seat for alerts.

### Wearables (watch)
- **Glance + haptic** is the core loop: a tap on the wrist (haptic) draws attention, a glanceable card delivers a few words, voice/dictation or a couple of taps respond.
- Sessions are **seconds**. One primary action per screen. Push detail to the phone.
- Haptics replace sound here (silent, on-body) — design a clear haptic vocabulary for notification types.

### AR / VR / spatial
- Input is **gaze + gesture + voice** ("look-and-pinch", point-and-speak); no mouse precision, so targets are large and dwell/confirm is forgiving.
- **Comfort is a hard requirement:** avoid forced rapid motion, keep UI within a comfortable field of view, respect the body's frame, and provide motion-sickness mitigations (vignetting, snap-turn).
- **Spatial audio** does real work — it directs attention to off-screen events. Haptics (controller/glove) confirm grabs and collisions.

---

## Common mistakes (cross-modal)

- **Voice menus that read every option** — violates the working-memory limit; offer top result + "more?".
- **No error recovery** — repeating the same prompt after a failure instead of escalating help, and never falling back to a human/screen.
- **Sound with no off switch** — or sounds that override the OS silent mode.
- **Haptic overuse** — buzzing on every interaction until users disable haptics entirely (and then miss the important ones).
- **No captions / sound-only signals** — excluding Deaf/HoH users and anyone on mute.
- **Voice-only with no alternative path** — locking out users who can't or won't speak.
- **Ignoring eyes-free / hands-free context** — a flow that demands precise touch while the user is driving or cooking.
- **Chat with no streaming or stop** — a frozen-looking UI during long generation, and no way to halt a runaway response.
- **One channel doing everything** — reading a list aloud that belongs on the screen, or showing a confirmation that should have been a haptic tap. Let each modality play its strength.
