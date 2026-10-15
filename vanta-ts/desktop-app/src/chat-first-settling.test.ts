import { expect, it } from "vitest";
import { chatNavigationPending } from "./chat-first-state.js";

it("blocks navigation during request startup and after Stop until canonical settlement", () => {
  expect(chatNavigationPending(false, true, false)).toBe(true);
});

it("does not disable queue entry during a running response", () => {
  expect(chatNavigationPending(false, true, true)).toBe(false);
});

it("retains existing navigation locks and unlocks after settlement", () => {
  expect(chatNavigationPending(true, false, false)).toBe(true);
  expect(chatNavigationPending(false, false, false)).toBe(false);
});
