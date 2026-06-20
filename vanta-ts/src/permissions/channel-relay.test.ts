import { describe, it, expect } from "vitest";
import {
  formatApprovalPrompt,
  parseApprovalReply,
  relayApproval,
  type ApprovalReply,
  type RelayApprovalArgs,
  type ReplyStream,
} from "./channel-relay.js";
import type { PermissionRequest } from "./request.js";

const REQUEST: PermissionRequest = {
  kind: "bash",
  title: "Bash permission request",
  subject: "rm -rf build",
  reason: "deletes the build directory",
  toolName: "shell_cmd",
  sections: [{ label: "Command", value: "rm -rf build", tone: "code" }],
};

/** A reply stream over a fixed list; respects the abort signal between yields. */
function streamOf(replies: ApprovalReply[]): ReplyStream {
  return async function* (signal) {
    for (const reply of replies) {
      if (signal.aborted) return;
      yield reply;
    }
  };
}

/** A stream that yields nothing and never ends until aborted (forces the local side). */
const silentStream: ReplyStream = async function* (signal) {
  await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
};

function baseArgs(overrides: Partial<RelayApprovalArgs> = {}): RelayApprovalArgs {
  return {
    request: REQUEST,
    requestId: "ap-1",
    send: async () => {},
    replies: silentStream,
    localResolve: async () => true,
    allowlist: ["chat-A"],
    ...overrides,
  };
}

describe("formatApprovalPrompt", () => {
  it("embeds the request id so the reply can reference it", () => {
    const text = formatApprovalPrompt(REQUEST, "ap-7");
    expect(text).toContain("ap-7");
    expect(text).toContain('yes ap-7');
    expect(text).toContain('no ap-7');
  });

  it("includes the subject and reason but not raw tool internals", () => {
    const text = formatApprovalPrompt(REQUEST, "ap-7");
    expect(text).toContain("rm -rf build");
    expect(text).toContain("deletes the build directory");
  });
});

describe("parseApprovalReply", () => {
  it("parses yes/approve/y + id → allow", () => {
    expect(parseApprovalReply("yes ap-1", "ap-1")).toBe("allow");
    expect(parseApprovalReply("approve ap-1", "ap-1")).toBe("allow");
    expect(parseApprovalReply("y ap-1", "ap-1")).toBe("allow");
    expect(parseApprovalReply("AP-1 OK", "ap-1")).toBe("allow"); // case-insensitive, order-free
  });

  it("parses no/deny/n + id → deny", () => {
    expect(parseApprovalReply("no ap-1", "ap-1")).toBe("deny");
    expect(parseApprovalReply("deny ap-1", "ap-1")).toBe("deny");
    expect(parseApprovalReply("n ap-1", "ap-1")).toBe("deny");
  });

  it("returns null for the wrong request id (never approves another request)", () => {
    expect(parseApprovalReply("yes ap-2", "ap-1")).toBeNull();
  });

  it("returns null when the id is missing (default-deny on ambiguity)", () => {
    expect(parseApprovalReply("yes", "ap-1")).toBeNull();
    expect(parseApprovalReply("yes please", "ap-1")).toBeNull();
  });

  it("returns null for a non-decision reply that mentions the id", () => {
    expect(parseApprovalReply("what is ap-1", "ap-1")).toBeNull();
    expect(parseApprovalReply("ap-1", "ap-1")).toBeNull();
  });

  it("returns null for a contradictory reply (yes and no) — never auto-approves", () => {
    expect(parseApprovalReply("yes no ap-1", "ap-1")).toBeNull();
  });

  it("does not match a substring (yesterday is not yes)", () => {
    expect(parseApprovalReply("yesterday ap-1", "ap-1")).toBeNull();
  });
});

/** A local resolver that never settles on its own — only the race abort ends it. */
const localNever = (signal: AbortSignal): Promise<boolean> =>
  new Promise<boolean>((resolve) => signal.addEventListener("abort", () => resolve(false), { once: true }));

describe("relayApproval — channel wins", () => {
  it("an allowlisted allow reply resolves before the local approver", async () => {
    let sent = "";
    const out = await relayApproval(
      baseArgs({
        send: async (text) => {
          sent = text;
        },
        replies: streamOf([{ chatId: "chat-A", text: "yes ap-1" }]),
        localResolve: localNever, // local never resolves — only the channel can win
      }),
    );
    expect(out).toEqual({ verdict: "allow", via: "channel" });
    expect(sent).toContain("ap-1"); // the prompt went out with the id
  });

  it("a deny reply wins", async () => {
    const out = await relayApproval(
      baseArgs({ replies: streamOf([{ chatId: "chat-A", text: "no ap-1" }]), localResolve: localNever }),
    );
    expect(out).toEqual({ verdict: "deny", via: "channel" });
  });

  it("a malformed/wrong-id reply is ignored, not fatal — a later valid reply wins", async () => {
    const out = await relayApproval(
      baseArgs({
        replies: streamOf([
          { chatId: "chat-A", text: "huh?" }, // no decision, no id
          { chatId: "chat-A", text: "yes ap-9" }, // wrong id
          { chatId: "chat-A", text: "yes ap-1" }, // finally valid
        ]),
        localResolve: localNever,
      }),
    );
    expect(out).toEqual({ verdict: "allow", via: "channel" });
  });
});

describe("relayApproval — local wins / default-deny", () => {
  it("the local approver resolves while the channel stays silent", async () => {
    const out = await relayApproval(baseArgs({ replies: silentStream, localResolve: async () => true }));
    expect(out).toEqual({ verdict: "allow", via: "local" });
  });

  it("a local deny wins when the channel stays silent", async () => {
    const out = await relayApproval(baseArgs({ replies: silentStream, localResolve: async () => false }));
    expect(out).toEqual({ verdict: "deny", via: "local" });
  });

  it("the allowlist blocks a stranger's valid reply — local resolves instead", async () => {
    const out = await relayApproval(
      baseArgs({
        replies: streamOf([{ chatId: "stranger", text: "yes ap-1" }]), // valid but not allowlisted
        allowlist: ["chat-A"],
        localResolve: async () => false,
      }),
    );
    expect(out).toEqual({ verdict: "deny", via: "local" });
  });

  it("a wrong-id channel reply never wins — local resolves instead", async () => {
    const out = await relayApproval(
      baseArgs({ replies: streamOf([{ chatId: "chat-A", text: "yes ap-2" }]), localResolve: async () => false }),
    );
    expect(out).toEqual({ verdict: "deny", via: "local" });
  });
});

describe("relayApproval — error handling (errors-as-values)", () => {
  it("a failed outbound send does not block the local approval path", async () => {
    const out = await relayApproval(
      baseArgs({
        send: async () => {
          throw new Error("channel offline");
        },
        replies: silentStream,
        localResolve: async () => true,
      }),
    );
    expect(out).toEqual({ verdict: "allow", via: "local" });
  });

  it("a thrown local approver denies (fail closed, never throws across the boundary)", async () => {
    const out = await relayApproval(
      baseArgs({
        replies: silentStream,
        localResolve: async () => {
          throw new Error("UI gone");
        },
      }),
    );
    expect(out).toEqual({ verdict: "deny", via: "local" });
  });
});
