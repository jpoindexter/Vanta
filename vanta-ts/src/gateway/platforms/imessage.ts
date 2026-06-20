import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// iMessage has no documented hard cap, but a single huge AppleScript `send`
// payload is fragile; 20000 chars is a generous safe per-message budget.
const IMESSAGE_LIMIT = 20000;

// MSG-IMESSAGE: native macOS iMessage adapter.
// SEND: AppleScript via osascript — `tell application "Messages" to send`.
// RECEIVE: poll the local Messages SQLite DB at ~/Library/Messages/chat.db.
// Prerequisites: macOS Full Disk Access (for chat.db) + Automation permission (for osascript).
// Not available on non-macOS; live use requires granted permissions.
// Pure parse functions (parseChatDbRows) are offline-testable.

const runExec = promisify(execFile);

// AppleScript to send an iMessage
const SEND_SCRIPT = (handle: string, text: string): string =>
  `tell application "Messages"\n  set targetBuddy to "${handle.replace(/"/g, '\\"')}"\n  set targetService to 1st service whose service type is iMessage\n  set targetBuddy to participant targetBuddy of targetService\n  send "${text.replace(/"/g, '\\"')}" to targetBuddy\nend tell`;

export type ChatDbRow = {
  rowid: number;
  text: string;
  handle_id: string;
  date: number;
  /** chat.room_name — non-empty only for a group chat (joined from chat.db). */
  room_name?: string;
};

const RowSchema = z.object({
  rowid: z.number(),
  text: z.string().nullable(),
  handle_id: z.string(),
  date: z.number(),
  room_name: z.string().nullable().optional(),
});

/**
 * Parse rows returned by the chat.db query into InboundMessages. Pure.
 * `rowid` is the message's stable id. A non-empty `room_name` (joined from the
 * `chat` table) marks a group chat. iMessage carries no text-reply id for an
 * incoming message (associated_message_guid is for tapbacks, not replies), so
 * replyToId stays undefined.
 */
export function parseChatDbRows(
  rows: Array<Record<string, unknown>>,
  sinceRowId = 0,
): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of rows) {
    const parsed = RowSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.text?.trim()) continue;
    if (parsed.data.rowid <= sinceRowId) continue;
    const room = parsed.data.room_name;
    messages.push({
      chatId: parsed.data.handle_id,
      text: parsed.data.text,
      id: String(parsed.data.rowid),
      // is_from_me=0 is filtered in the query, so an incoming message is never
      // the bot's own; fromMe is reported false to satisfy the dedup pipeline.
      fromMe: false,
      // A non-empty room_name only ever appears for a group chat; a 1:1 has
      // none, so isGroup is true for a group and undefined (not a guess) for a
      // direct message where the join produced no room.
      isGroup: room ? true : undefined,
    });
  }
  return messages;
}

export class IMessageAdapter implements PlatformAdapter {
  readonly id = "imessage";
  private lastRowId = 0;
  private dbPath: string;

  constructor(opts: { dbPath?: string } = {}) {
    const home = process.env.HOME ?? "";
    this.dbPath = opts.dbPath ?? `${home}/Library/Messages/chat.db`;
  }

  async connect(): Promise<void> {
    // Verify access — throws if Full Disk Access not granted.
    try {
      await runExec("sqlite3", [this.dbPath, "SELECT COUNT(*) FROM message LIMIT 1;"], { timeout: 2000 });
      // Set lastRowId to current max so we only receive new messages.
      const { stdout } = await runExec("sqlite3", [this.dbPath, "SELECT MAX(ROWID) FROM message;"], { timeout: 2000 });
      this.lastRowId = parseInt(stdout.trim()) || 0;
    } catch (err) {
      throw new Error(`iMessage: cannot access chat.db — grant Full Disk Access in System Settings. (${(err as Error).message})`);
    }
  }

  async disconnect(): Promise<void> { /* stateless */ }

  async poll(): Promise<InboundMessage[]> {
    try {
      // LEFT JOIN the chat tables so each row carries its chat.room_name — the
      // only column that distinguishes a group chat (non-empty) from a 1:1.
      const { stdout } = await runExec("sqlite3", [
        this.dbPath,
        "SELECT m.ROWID, m.text, m.handle_id, m.date, c.room_name " +
          "FROM message m " +
          "LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID " +
          "LEFT JOIN chat c ON c.ROWID = cmj.chat_id " +
          `WHERE m.ROWID > ${this.lastRowId} AND m.is_from_me = 0 AND m.text IS NOT NULL ` +
          "ORDER BY m.ROWID ASC LIMIT 50;",
      ], { timeout: 3000 });
      const rows = stdout.trim().split("\n").filter(Boolean).map((line) => {
        const [rowid, text, handle_id, date, room_name] = line.split("|");
        return {
          rowid: Number(rowid),
          text,
          handle_id: handle_id ?? "",
          date: Number(date),
          room_name: room_name ?? "",
        };
      });
      const messages = parseChatDbRows(rows, this.lastRowId);
      if (rows.length > 0) this.lastRowId = Math.max(...rows.map((r) => r.rowid ?? 0));
      return messages;
    } catch {
      return []; // DB may be locked; silently skip
    }
  }

  async send(msg: OutboundMessage): Promise<void> {
    // iMessage renders plain text — strip markdown to readable prose (code spans
    // survive) BEFORE splitting so `**`/``` never show literally in the bubble.
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, IMESSAGE_LIMIT, "chars")) {
      const script = SEND_SCRIPT(msg.chatId, part);
      await runExec("osascript", ["-e", script], { timeout: 10_000 });
    }
  }
}
