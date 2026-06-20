// The messaging-gateway contract. One adapter per platform (Telegram first;
// Discord/Slack/etc. follow the same shape). Contract: connect/disconnect/send
// plus a `poll` for pull-based
// platforms like Telegram's getUpdates. A pull model fits the gateway's tick
// loop without a long-lived socket.

export type InboundMessage = {
  /** Platform-specific conversation id (Telegram chat id, etc.). */
  chatId: string;
  text: string;
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
};

export interface PlatformAdapter {
  /** Stable platform id, e.g. "telegram". */
  readonly id: string;
  /** Establish any state needed before polling/sending (no-op for stateless HTTP). */
  connect(): Promise<void>;
  /** Tear down. */
  disconnect(): Promise<void>;
  /** Send one outbound message. */
  send(msg: OutboundMessage): Promise<void>;
  /** Fetch inbound messages received since the last poll. */
  poll(): Promise<InboundMessage[]>;
}
