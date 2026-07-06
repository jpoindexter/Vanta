import type { LenUnit } from "./split.js";
import { splitForLimit } from "./split.js";
import type { Dialect } from "./format.js";
import type { PlatformAdapter } from "./base.js";

// MSG-CAPABILITY-DESCRIPTOR — each adapter DECLARES its real limits instead of
// the send/split path hard-guessing 4096/chars. The send path reads charLimit +
// lenUnit off the live adapter (so a new platform's budget is right by
// declaration, not by editing a shared constant), and the delivery plan follows
// supportsEdit: an edit-capable adapter can stream/replace one message, a
// no-edit adapter degrades to one-message-per-segment. Pure; no I/O.

export type AdapterCapabilities = {
  /** Max message size the platform accepts, measured in `lenUnit`. */
  charLimit: number;
  /** The unit the budget is measured in (Telegram=utf16, IRC=bytes, else chars). */
  lenUnit: LenUnit;
  /** Whether the platform supports editing an already-sent message in place. */
  supportsEdit: boolean;
  /** Whether the platform has forum-topic / thread routing. */
  supportsThreads: boolean;
  /** The markdown dialect the platform renders. */
  markdownDialect: Dialect;
};

/** Conservative defaults for an adapter that declares nothing (chars/4000/no-edit). */
export const DEFAULT_CAPABILITIES: AdapterCapabilities = {
  charLimit: 4000,
  lenUnit: "chars",
  supportsEdit: false,
  supportsThreads: false,
  markdownDialect: "plain",
};

/** Build a capability set from partial overrides on the conservative defaults. Pure. */
export function capabilities(over: Partial<AdapterCapabilities> = {}): AdapterCapabilities {
  return { ...DEFAULT_CAPABILITIES, ...over };
}

/** An adapter that may declare capabilities (optional on the interface). */
type MaybeCapable = PlatformAdapter & { capabilities?: AdapterCapabilities };

/** Read the adapter's declared capabilities, or the conservative defaults. Pure. */
export function resolveCapabilities(adapter: PlatformAdapter): AdapterCapabilities {
  return (adapter as MaybeCapable).capabilities ?? DEFAULT_CAPABILITIES;
}

/**
 * Split `text` into on-the-wire segments using the adapter's declared budget +
 * unit. The single seam the send path calls instead of hardcoding a constant.
 * Pure — `splitForLimit` never returns an over-limit segment.
 */
export function segmentsFor(text: string, caps: AdapterCapabilities): string[] {
  return splitForLimit(text, caps.charLimit, caps.lenUnit);
}

export type DeliveryMode = "edit-in-place" | "one-message-per-segment";

/**
 * How a multi-segment reply is delivered: an edit-capable platform can replace
 * one message (edit-in-place), a no-edit platform sends each segment as its own
 * message. Pure — the send path branches on this instead of assuming. */
export function deliveryMode(caps: AdapterCapabilities): DeliveryMode {
  return caps.supportsEdit ? "edit-in-place" : "one-message-per-segment";
}
