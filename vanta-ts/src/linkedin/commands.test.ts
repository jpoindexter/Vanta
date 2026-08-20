import { describe, expect, it, vi } from "vitest";
import { runLinkedInAuthCommand } from "./commands.js";

describe("vanta auth linkedin", () => {
  it("connects a personal account without requesting a client secret", async () => {
    const lines: string[] = [];
    const connect = vi.fn(async (_env, options) => {
      expect(options.clientId).toBe("public-client-id");
      return { sub: "member-1", name: "Jason" };
    });
    const code = await runLinkedInAuthCommand(
      ["linkedin", "--client-id", "public-client-id"],
      {},
      { connect: connect as never, log: (line) => lines.push(line) },
    );
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("LinkedIn connected as Jason");
    expect(lines.join("\n")).not.toContain("client secret");
  });

  it("reports a connected personal account without revealing its token", async () => {
    const lines: string[] = [];
    const status = vi.fn(async () => ({
      connected: true,
      expired: false,
      credential: {
        accessToken: "never-print-this",
        clientId: "client-id",
        expiresAt: Date.UTC(2030, 0, 1),
        scopes: ["openid"],
        subject: "member-1",
        name: "Jason",
      },
    }));
    expect(await runLinkedInAuthCommand(["linkedin", "status"], {}, {
      status: status as never,
      log: (line) => lines.push(line),
    })).toBe(0);
    expect(lines.join("\n")).toContain("LinkedIn connected as Jason");
    expect(lines.join("\n")).not.toContain("never-print-this");
  });

  it("fails with an actionable message when the client ID is absent", async () => {
    const errors: string[] = [];
    const code = await runLinkedInAuthCommand(["linkedin", "--client-id"], {}, {
      error: (line) => errors.push(line),
    });
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("--client-id needs");
  });
});
