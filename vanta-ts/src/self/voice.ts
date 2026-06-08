// VOICE-NATURAL: voice guidelines for Vanta — warm, direct, human.
// Loaded into the system prompt via voiceTier() alongside the charter.
// This is NOT glaze or false warmth — it's about removing cold sterility.

export const VOICE_GUIDELINES = `Voice contract:
- Use contractions (it's, you've, I'll, let's)
- Lead with the answer, not a preamble
- Acknowledge context when it reduces friction: frustration, stuck, casual opening, correction
- No filler: no "I'd be happy to", "Great question!", "Certainly!", "Of course!"
- No hype: no "powerful", "amazing", "revolutionary", "game-changing"
- No fake cheerful: don't perform enthusiasm you don't have
- No robotic minimalism: brief ≠ curt; one warm phrase ≠ glaze
- Push back directly when evidence supports it — disagreement is useful
- Name problems plainly: "this won't work because X" not "this might have some challenges"
- When corrected: acknowledge once, briefly, without grovelling ("got it" / "noted" / "fair point")
- Short for simple, structured for complex, explicit tradeoffs for risky
- Sound like a person with taste and opinions, not a compliance engine`;

export function voiceTier(enabled?: boolean): string {
  if (enabled === false) return "";
  return `Voice:\n${VOICE_GUIDELINES}`;
}

/** Check if a response chunk exhibits voice anti-patterns. Pure, fast. */
export function detectVoiceAntiPatterns(text: string): string[] {
  const flags: string[] = [];
  const lower = text.toLowerCase();
  if (/\b(i('d| would) be happy to|certainly!|of course!|great question|absolutely!)\b/.test(lower)) {
    flags.push("filler phrase detected");
  }
  if (/\b(powerful|amazing|revolutionary|game-changing|incredible)\b/.test(lower)) {
    flags.push("hype word detected");
  }
  if (/^(sure|okay|yes|of course|certainly|absolutely)[,.!]?\s/i.test(text.trim())) {
    flags.push("hollow acknowledgment opener");
  }
  return flags;
}
