import { isValidElement } from "react";
import { expect, it } from "vitest";
import { ChatCommandPalette } from "./chat-first-command-palette.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";

const props = (open: boolean) => ({ state: { data: { paletteOpen: open } } as ChatFirstState, actions: {} as ChatFirstActions });

it("unmounts search state completely while the palette is closed", () => {
  expect(ChatCommandPalette(props(false))).toBeNull();
});

it("creates a fresh search component on each open", () => {
  expect(isValidElement(ChatCommandPalette(props(true)))).toBe(true);
});
