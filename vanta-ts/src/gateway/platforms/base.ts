// The messaging-gateway contract. One adapter per platform (Telegram first;
// Discord/Slack/etc. follow the same shape). Contract: connect/disconnect/send
// plus a `poll` for pull-based
// platforms like Telegram's getUpdates. A pull model fits the gateway's tick
// loop without a long-lived socket.

// MSG-MEDIA-IMAGES — an inbound attachment: an image (→ vision) or audio/voice
// (→ transcription). Carries inline bytes OR a url the bridge fetches.
export type MediaAttachment = {
  kind: "image" | "audio";
  mime: string;
  /** Inline base64 bytes, when the platform delivers them. */
  dataBase64?: string;
  /** A url to fetch the bytes from, when the platform delivers a link instead. */
  url?: string;
};

export type InboundMessage = {
  /** Platform-specific conversation id (Telegram chat id, etc.). */
  chatId: string;
  text: string;
  /** MSG-MEDIA-IMAGES — inbound media: images go to vision, voice memos to STT. */
  media?: MediaAttachment[];
  /** Display name / handle of the sender, when the platform provides it. */
  from?: string;
  /** Platform message id, when available — used for replay-dedup + reply lookup. */
  id?: string;
  /** True when the message is the bot's own outbound echoed back (self-id). */
  fromMe?: boolean;
  /** True in a group/channel; false/absent for a 1:1 DM. */
  isGroup?: boolean;
  /** Id of the message this one replies to, when the platform provides it. */
  replyToId?: string;
  /** Forum topic / thread the message belongs to; replies route back to it. */
  threadId?: string;
  /**
   * Internal: the LLM-facing rendering of `text` (timestamp + quote enriched).
   * Set by the inbound pipeline for the agent turn only; `text` stays the clean,
   * routable/persistable content. Absent on raw platform messages.
   */
  llmText?: string;
};

export type OutboundMessage = {
  chatId: string;
  text: string;
  /** Platform message id assigned to the sent message, when known (reply-context key). */
  id?: string;
  /** Forum topic / thread to deliver into (copied from the inbound message). */
  threadId?: string;
  /** MSG-INLINE-APPROVAL — tappable buttons; adapters without native buttons ignore
   * them (the text itself must carry the fallback instruction). `data` is delivered
   * back as an inbound message's text when tapped. */
  buttons?: Array<{ label: string; data: string }>;
  /** MSG-MEDIA-IMAGES — an image to send back with the reply (screenshot, chart, generated). */
  image?: { mime: string; dataBase64: string };
};

export type PlatformWebhookRequest = {
  body: string;
  headers: Record<string, string | string[] | undefined>;
};

export type PlatformWebhookResponse = { status: number; body: string };

export type PlatformWebhookHandler = {
  /** URL path registered on the messaging webhook listener. */
  path: string;
  receive(request: PlatformWebhookRequest): Promise<PlatformWebhookResponse>;
};

export interface PlatformAdapter {
  /** Stable platform id, e.g. "telegram". */
  readonly id: string;
  /** MSG-CAPABILITY-DESCRIPTOR — declared limits (charLimit/lenUnit/supportsEdit/
   * supportsThreads/markdownDialect) the send/split path reads instead of guessing.
   * Optional: an adapter that omits it gets conservative defaults. Typed loosely
   * here (import type would cycle base↔capabilities); the shape is AdapterCapabilities. */
  readonly capabilities?: import("./capabilities.js").AdapterCapabilities;
  /** Establish any state needed before polling/sending (no-op for stateless HTTP). */
  connect(): Promise<void>;
  /** Tear down. */
  disconnect(): Promise<void>;
  /** Send one outbound message. */
  send(msg: OutboundMessage): Promise<void>;
  /** Fetch inbound messages received since the last poll. */
  poll(): Promise<InboundMessage[]>;
  /** Push-channel HTTP handlers, when this adapter receives webhook events. */
  webhookHandlers?(): PlatformWebhookHandler[];
}
