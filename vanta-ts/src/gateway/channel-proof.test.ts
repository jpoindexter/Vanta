import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendChannelProof, buildChannelProof, formatChannelProofs, readChannelProofs } from "./channel-proof.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("channel round-trip proofs", () => {
  it("hashes identifiers and never persists message content", () => {
    const proof = buildChannelProof(
      { chatId: "private-conversation", id: "private-activity", text: "private message" },
      { platform: "teams", transport: "bot-connector", accepted: true, parts: 2 },
      new Date("2026-07-10T12:00:00Z"),
    );
    const encoded = JSON.stringify(proof);
    expect(proof).toMatchObject({ platform: "teams", transport: "bot-connector", parts: 2 });
    expect(encoded).not.toContain("private-conversation");
    expect(encoded).not.toContain("private-activity");
    expect(encoded).not.toContain("private message");
  });

  it("appends, reads, filters, and formats accepted receipts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-channel-proof-"));
    dirs.push(dir);
    const proof = buildChannelProof(
      { chatId: "C1", id: "A1", text: "hello" },
      { platform: "teams", transport: "bot-connector", accepted: true, parts: 1 },
    );
    await appendChannelProof(dir, proof);
    await appendFile(join(dir, "channel-proofs.jsonl"), "{partial\n");
    expect(await readChannelProofs(dir)).toEqual([proof]);
    expect(formatChannelProofs([proof], "teams")).toContain("teams/bot-connector");
    expect(formatChannelProofs([proof], "slack")).toBe("No accepted channel round-trip proofs for slack.");
  });
});
