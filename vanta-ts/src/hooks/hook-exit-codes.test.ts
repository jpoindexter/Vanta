import { describe, it, expect } from "vitest";
import { interpretHookExit, HOOK_BLOCK_EXIT_CODE } from "./hook-exit-codes.js";

describe("interpretHookExit — exit-code semantics", () => {
  describe("exit 0 — success, silent", () => {
    it("is silent and does not block", () => {
      const r = interpretHookExit(0, "all good", "");
      expect(r).toEqual({ block: false, silent: true });
    });

    it("stays silent even if stderr happens to carry text", () => {
      const r = interpretHookExit(0, "out", "warning text");
      expect(r).toEqual({ block: false, silent: true });
      expect(r.toModel).toBeUndefined();
      expect(r.toUser).toBeUndefined();
    });
  });

  describe("exit 2 — block, stderr TO THE MODEL", () => {
    it("blocks and routes stderr to the model", () => {
      const r = interpretHookExit(2, "stdout ignored", "no writes allowed right now");
      expect(r.block).toBe(true);
      expect(r.silent).toBe(false);
      expect(r.toModel).toBe("no writes allowed right now");
      expect(r.toUser).toBeUndefined();
    });

    it("trims surrounding whitespace from the model message", () => {
      const r = interpretHookExit(2, "", "  blocked  \n");
      expect(r.toModel).toBe("blocked");
    });

    it("blocks with no message when stderr is empty", () => {
      const r = interpretHookExit(2, "", "");
      expect(r).toEqual({ block: true, silent: false });
      expect(r.toModel).toBeUndefined();
    });

    it("treats whitespace-only stderr as empty (no message)", () => {
      const r = interpretHookExit(2, "", "   \n  ");
      expect(r).toEqual({ block: true, silent: false });
      expect(r.toModel).toBeUndefined();
    });

    it("uses the exported block exit-code constant", () => {
      expect(HOOK_BLOCK_EXIT_CODE).toBe(2);
      const r = interpretHookExit(HOOK_BLOCK_EXIT_CODE, "", "veto");
      expect(r.block).toBe(true);
      expect(r.toModel).toBe("veto");
    });
  });

  describe("other non-zero — non-blocking, stderr TO THE USER", () => {
    it("does not block on exit 1 and routes stderr to the user", () => {
      const r = interpretHookExit(1, "stdout", "heads up: lint warnings");
      expect(r.block).toBe(false);
      expect(r.silent).toBe(false);
      expect(r.toUser).toBe("heads up: lint warnings");
      expect(r.toModel).toBeUndefined();
    });

    it("does not block on a high exit code (e.g. 127) and routes to the user", () => {
      const r = interpretHookExit(127, "", "command not found");
      expect(r.block).toBe(false);
      expect(r.toUser).toBe("command not found");
    });

    it("handles a timeout exit code (124) as non-blocking to the user", () => {
      const r = interpretHookExit(124, "", "[hook timed out]");
      expect(r.block).toBe(false);
      expect(r.toUser).toBe("[hook timed out]");
    });

    it("non-blocking with no message when stderr is empty", () => {
      const r = interpretHookExit(1, "stdout only", "");
      expect(r).toEqual({ block: false, silent: false });
      expect(r.toUser).toBeUndefined();
    });

    it("trims the user message", () => {
      const r = interpretHookExit(3, "", "\t fix me \n");
      expect(r.toUser).toBe("fix me");
    });
  });
});
