import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export class HashChainAudit {
  private previous = "genesis";
  private count = 0;

  constructor(readonly path: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
  }

  async logEvent(event: string): Promise<void> {
    const h = createHash("sha256").update(`${this.previous}\n${event}`).digest("hex");
    this.previous = h;
    this.count += 1;
    await appendFile(this.path, `${JSON.stringify({ ts: this.count, event, h })}\n`, "utf8");
  }

  async jsonl(): Promise<string> {
    return readFile(this.path, "utf8");
  }

  async verify(): Promise<{ ok: true; events: number } | { ok: false; reason: string }> {
    let previous = "genesis";
    const lines = (await this.jsonl()).trim().split("\n").filter(Boolean);
    for (const [index, line] of lines.entries()) {
      const parsed = JSON.parse(line) as { event: string; h: string };
      const expected = createHash("sha256").update(`${previous}\n${parsed.event}`).digest("hex");
      if (parsed.h !== expected) return { ok: false, reason: `audit chain mismatch at line ${index + 1}` };
      previous = parsed.h;
    }
    return { ok: true, events: lines.length };
  }
}
