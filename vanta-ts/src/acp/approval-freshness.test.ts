import { describe, expect, it } from "vitest";
import type { ApprovalDetail } from "../permissions/request.js";
import { PERMISSION_OPTIONS, SessionManager, type PermissionRequest } from "./session.js";

type Ask = { action?: string; tool?: string; detail?: ApprovalDetail };

async function approvals(asks: Ask[], answers: string[]) {
  const prompts: PermissionRequest[] = [];
  const verdicts: boolean[] = [];
  const manager = new SessionManager(async req => {
    for (const ask of asks) verdicts.push(await req.approve(
      ask.action ?? "write file brief.md", "fixture approval", ask.tool ?? "write_file", ask.detail,
    ));
    return { stopReason: "end_turn" };
  }, {
    update: () => {},
    requestPermission: async (_id, request) => {
      prompts.push(request);
      return answers.shift() ?? "";
    },
  }, "/private-fixture");
  await manager.prompt(manager.newSession().sessionId, "private fixture");
  return { prompts, verdicts };
}

describe("ACP one-time approval authority", () => {
  it.each([{ fresh: true }, { canRemember: false }])(
    "does not use a session edit grant for %j", async detail => {
      const { prompts, verdicts } = await approvals([{}, { detail }, {}], ["allow_always", "reject"]);
      expect(verdicts).toEqual([true, false, true]);
      expect(prompts).toHaveLength(2);
      expect(prompts[1]?.options).toEqual(PERMISSION_OPTIONS);
    },
  );

  it.each([{ fresh: true }, { canRemember: false }])(
    "does not offer or accept a session grant for %j", async detail => {
      const { prompts, verdicts } = await approvals([{ detail }, {}], ["allow_always", "reject"]);
      expect(verdicts).toEqual([false, false]);
      expect(prompts).toHaveLength(2);
      expect(prompts[0]?.options).toEqual(PERMISSION_OPTIONS);
    },
  );

  it("requires a new decision for every fresh request and preserves its preview", async () => {
    const detail = { fresh: true, diff: "Exact fixture preview" };
    const { prompts, verdicts } = await approvals([{ detail }, { detail }], ["allow", "reject"]);
    expect(verdicts).toEqual([true, false]);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]?.toolCall.content?.[0]?.content.text).toBe(detail.diff);
    expect(prompts[1]?.options).toEqual(PERMISSION_OPTIONS);
  });

  it.each([{ fresh: true }, { canRemember: false }])(
    "shows the exact action when %j has no diff", async detail => {
      const action = "Modify fixture control file /private-fixture/AGENTS.md (23 bytes, sha256 fixture)";
      const { prompts } = await approvals([{ action, tool: "edit_file", detail }], ["reject"]);
      expect(prompts[0]?.toolCall.title).toBe(action);
      expect(prompts[0]?.toolCall.content?.[0]?.content.text).toBe("fixture approval");
    },
  );

  it.each(["allow_unoffered", "allow_always", "", "reject"])(
    "rejects non-file response %j unless it is an offered allow option", async answer => {
      const { verdicts } = await approvals([{ tool: "linkedin_post", detail: { fresh: true } }], [answer]);
      expect(verdicts).toEqual([false]);
    },
  );

  it("keeps ordinary session edit grants usable", async () => {
    const { prompts, verdicts } = await approvals([{}, {}], ["allow_always"]);
    expect(verdicts).toEqual([true, true]);
    expect(prompts).toHaveLength(1);
  });
});
