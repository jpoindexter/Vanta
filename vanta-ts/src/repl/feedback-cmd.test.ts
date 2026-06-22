import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyFeedback,
  buildFeedbackDraft,
  fileFeedbackIssue,
  renderDraft,
  makeFeedbackHandler,
  type GhRunner,
} from "./feedback-cmd.js";
import type { Verdict } from "../types.js";
import type { ReplCtx } from "./types.js";

const allow: Verdict = { risk: "allow", needsHuman: false, reason: "" };
const block: Verdict = { risk: "block", needsHuman: true, reason: "destructive keyword" };

describe("classifyFeedback", () => {
  it("reads add/request/wish phrasing as a feature request", () => {
    expect(classifyFeedback("please add a dark mode")).toBe("feature");
    expect(classifyFeedback("would love support for Notion")).toBe("feature");
  });
  it("defaults to general feedback otherwise", () => {
    expect(classifyFeedback("the status output is confusing")).toBe("feedback");
  });
});

describe("buildFeedbackDraft", () => {
  const meta = { provider: "openai", model: "gpt-4o-mini" };

  it("redacts secrets in both title and body before drafting", () => {
    const secret = "sk-ant-abcdefghijklmnopqrstuvwxyz0123";
    const d = buildFeedbackDraft(`my key is ${secret} please fix`, meta, "feedback");
    expect(d.title).not.toContain(secret);
    expect(d.body).not.toContain(secret);
    expect(d.body).toContain("[REDACTED]");
  });

  it("labels by kind and stamps a non-secret context footer", () => {
    expect(buildFeedbackDraft("add X", meta, "feature").labels).toEqual(["enhancement"]);
    const fb = buildFeedbackDraft("X is slow", meta, "feedback");
    expect(fb.labels).toEqual(["feedback"]);
    expect(fb.body).toContain("openai/gpt-4o-mini");
    expect(fb.title.startsWith("Feedback:")).toBe(true);
  });

  it("falls back to a placeholder title when text is empty", () => {
    expect(buildFeedbackDraft("", meta, "feature").title).toBe("Feature request (via Vanta)");
  });
});

describe("fileFeedbackIssue (kernel-gated)", () => {
  const pending = { draft: { title: "T", body: "B", labels: ["feedback"] }, repo: "owner/name" };

  it("refuses when the kernel blocks — gh is never run", async () => {
    let called = false;
    const gh: GhRunner = async () => {
      called = true;
      return { ok: true, stdout: "", stderr: "" };
    };
    const res = await fileFeedbackIssue(pending, { safety: { assess: async () => block }, repoRoot: "/x", gh });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/blocked by kernel/);
    expect(called).toBe(false);
  });

  it("files via gh on allow and returns the issue URL", async () => {
    let gotArgs: string[] = [];
    const gh: GhRunner = async (args) => {
      gotArgs = args;
      return { ok: true, stdout: "https://github.com/owner/name/issues/42\n", stderr: "" };
    };
    const res = await fileFeedbackIssue(pending, { safety: { assess: async () => allow }, repoRoot: "/x", gh });
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://github.com/owner/name/issues/42");
    // argv is built injection-safe and targets the configured repo
    expect(gotArgs).toContain("--repo");
    expect(gotArgs).toContain("owner/name");
    expect(gotArgs.slice(0, 2)).toEqual(["issue", "create"]);
  });

  it("surfaces a gh failure (e.g. not authenticated) as an actionable error", async () => {
    const gh: GhRunner = async () => ({ ok: false, stdout: "", stderr: "gh: not logged in" });
    const res = await fileFeedbackIssue(pending, { safety: { assess: async () => allow }, repoRoot: "/x", gh });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/gh failed.*auth/i);
  });
});

describe("renderDraft", () => {
  it("flags redacted secrets when any were found", () => {
    const out = renderDraft({ title: "T", body: "B", labels: ["feedback"] }, ["anthropic-key"]);
    expect(out).toMatch(/redacted secrets.*anthropic-key/);
    expect(out).toMatch(/\/feedback send/);
  });
  it("omits the secret note when clean", () => {
    expect(renderDraft({ title: "T", body: "B", labels: ["feedback"] }, [])).not.toMatch(/redacted secrets/);
  });
});

describe("feedback handler (draft → send round-trip)", () => {
  let dir: string;
  const ctx = (env: Record<string, string> = {}): ReplCtx =>
    ({
      convo: { messages: [] } as unknown as ReplCtx["convo"],
      setup: { safety: { assess: async () => allow }, provider: { modelId: () => "gpt-4o-mini" } } as unknown as ReplCtx["setup"],
      dataDir: join(dir, ".vanta"),
      state: { sessionId: "s1", started: "", turnIndex: 0 } as ReplCtx["state"],
      env: env as NodeJS.ProcessEnv,
      now: () => new Date("2026-06-22T00:00:00Z"),
    }) as ReplCtx;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "feedback-cmd-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("drafts + persists a pending issue, then `send` files it through the injected gh", async () => {
    let filedArgs: string[] | null = null;
    const gh: GhRunner = async (args) => {
      filedArgs = args;
      return { ok: true, stdout: "https://github.com/jpoindexter/Vanta/issues/7", stderr: "" };
    };
    const handler = makeFeedbackHandler(gh);

    const drafted = await handler("please add a /undo for tool calls", ctx());
    expect(drafted.output).toMatch(/Draft issue \(enhancement\)/);
    const pending = join(dir, ".vanta", "feedback", "pending-s1.json");
    expect(existsSync(pending)).toBe(true);
    expect(JSON.parse(await readFile(pending, "utf8")).repo).toBe("jpoindexter/Vanta");

    const sent = await handler("send", ctx());
    expect(sent.output).toMatch(/✅ filed → https:\/\/github.com\/jpoindexter\/Vanta\/issues\/7/);
    expect(filedArgs).not.toBeNull();
    expect(existsSync(pending)).toBe(false); // consumed
  });

  it("`send` with no draft tells the user to draft first (no gh call)", async () => {
    let called = false;
    const gh: GhRunner = async () => {
      called = true;
      return { ok: true, stdout: "", stderr: "" };
    };
    const res = await makeFeedbackHandler(gh)("send", ctx());
    expect(res.output).toMatch(/no pending feedback draft/);
    expect(called).toBe(false);
  });

  it("honors VANTA_FEEDBACK_REPO override", async () => {
    const handler = makeFeedbackHandler(async () => ({ ok: true, stdout: "url", stderr: "" }));
    await handler("X is great", ctx({ VANTA_FEEDBACK_REPO: "me/fork" }));
    const pending = JSON.parse(await readFile(join(dir, ".vanta", "feedback", "pending-s1.json"), "utf8"));
    expect(pending.repo).toBe("me/fork");
  });
});
