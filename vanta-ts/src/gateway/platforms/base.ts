// The messaging-gateway contract. One adapter per platform (Telegram first;
// Discord/Slack/etc. follow the same shape). Mirrors Hermes's
// BasePlatformAdapter (connect/disconnect/send) plus a `poll` for pull-based
// platforms like Telegram's getUpdates. A pull model fits the gateway's tick
// loop without a long-lived socket.

export type InboundMessage = {
  /** Platform-specific conversation id (Telegram chat id, etc.). */
  chatId: string;
  text: string;
  /** Display name / handle of the sender, when the platform provides it. */
  from?: string;
};

export type OutboundMessage = {
  chatId: string;
  text: string;
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
