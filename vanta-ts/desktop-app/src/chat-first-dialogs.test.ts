import { afterEach, expect, it, vi } from "vitest";
import { isolateDialog } from "./chat-first-dialogs.js";

class Element {
  inert = false;
  children: Element[] = [];
  parentElement: Element | null = null;
  constructor(public id = "") {}
  append(...children: Element[]) {
    this.children.push(...children);
    for (const child of children) child.parentElement = this;
  }
}

afterEach(() => vi.unstubAllGlobals());

it("isolates nested dialog backgrounds and restores their exact prior inert states", () => {
  vi.stubGlobal("HTMLElement", Element);
  const root = new Element("root"), shell = new Element(), sidebar = new Element();
  const main = new Element(), content = new Element(), backdrop = new Element(), dialog = new Element();
  root.append(shell); shell.append(sidebar, main); main.append(content, backdrop); backdrop.append(dialog);
  content.inert = true;
  const restore = isolateDialog(dialog as unknown as HTMLElement);
  expect(sidebar.inert).toBe(true);
  expect(content.inert).toBe(true);
  expect(main.inert).toBe(false);
  expect(dialog.inert).toBe(false);
  restore();
  expect(sidebar.inert).toBe(false);
  expect(content.inert).toBe(true);
});
