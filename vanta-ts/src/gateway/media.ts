import type { InboundMessage, MediaAttachment } from "./platforms/base.js";
import type { ImageAttachment } from "../types.js";

// MSG-MEDIA-IMAGES — the inbound media bridge: turn a channel message's text +
// media into the agent's user turn. Images become ImageAttachments (→ vision);
// voice memos are transcribed and folded into the text (→ STT). Pure orchestration
// over an injected transcribe + url-fetch; a failed attachment degrades that one
// item, never throws.

export type MediaBridgeDeps = {
  /** Transcribe inbound audio bytes (base64) → text. Injected (whisper live). */
  transcribe?: (audioBase64: string, mime: string) => Promise<string>;
  /** Fetch a media url → base64, for channels that deliver a link not bytes. */
  fetchBase64?: (url: string) => Promise<string | null>;
  /** Cache inbound media bytes under a controlled TTL directory. */
  cache?: (attachment: MediaAttachment, dataBase64: string) => Promise<unknown>;
};

export type AgentInput = { text: string; images: ImageAttachment[] };

/** Resolve an attachment's bytes: inline base64, or fetched from its url. */
async function bytesOf(m: MediaAttachment, deps: MediaBridgeDeps): Promise<string | null> {
  if (m.dataBase64) return m.dataBase64;
  if (m.url && deps.fetchBase64) return deps.fetchBase64(m.url).catch(() => null);
  return null;
}

/** Append a transcribed voice memo to the running text. Pure. */
function withVoice(text: string, transcript: string): string {
  if (!transcript) return text;
  const line = `[voice memo] ${transcript}`;
  return text ? `${text}\n${line}` : line;
}

/**
 * Build the agent's user turn from an inbound message: its text, plus images (for
 * vision) and transcribed voice memos (for STT) from `media`. Order-preserving;
 * a failed fetch/transcription drops that one attachment.
 */
export async function inboundToAgentInput(
  inbound: InboundMessage,
  deps: MediaBridgeDeps = {},
): Promise<AgentInput> {
  const images: ImageAttachment[] = [];
  let text = inbound.text ?? "";
  for (const m of inbound.media ?? []) {
    const data = await bytesOf(m, deps);
    if (!data) continue;
    await deps.cache?.(m, data).catch(() => undefined);
    if (m.kind === "image") {
      images.push({ mime: m.mime, dataBase64: data });
    } else if (deps.transcribe) {
      const transcript = await deps.transcribe(data, m.mime).catch(() => "");
      text = withVoice(text, transcript);
    }
  }
  return { text, images };
}

/** True when the inbound message carries any media (so the bridge is worth running). */
export function hasMedia(inbound: InboundMessage): boolean {
  return (inbound.media?.length ?? 0) > 0;
}

/**
 * Gateway helper: resolve an inbound message to the agent's turn text + images,
 * folding in media when present (else the LLM-enriched/raw text unchanged).
 */
export async function resolveInbound(
  inbound: InboundMessage & { llmText?: string },
  deps: MediaBridgeDeps,
): Promise<{ forAgent: string; images?: ImageAttachment[] }> {
  const fallback = inbound.llmText ?? inbound.text;
  if (!hasMedia(inbound)) return { forAgent: fallback };
  const input = await inboundToAgentInput(inbound, deps);
  return { forAgent: input.text || fallback, images: input.images.length ? input.images : undefined };
}
