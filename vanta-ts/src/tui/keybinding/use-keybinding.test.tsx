import { createElement as h, type ReactElement } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { Text } from "ink";
import { render } from "../test-render.js";
import { useKeybinding, resetKeybindingCache, resolveChords } from "./use-keybinding.js";

// ctrl+o arrives as the raw control byte 0x0F (letter code 111 - 96). The fork's
// keypress parser turns it into { ctrl: true, input: "o" } — what the registry's
// transcript.toggleExpand chord matches.
const CTRL_O = String.fromCharCode(0x0f);
const wait = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

afterEach(() => resetKeybindingCache());

function Probe(props: { onFire: () => void; active: boolean }): ReactElement {
  useKeybinding("transcript.toggleExpand", props.onFire, { isActive: props.active });
  return h(Text, null, "probe");
}

describe("useKeybinding", () => {
  it("fires the handler when a bound chord is pressed", async () => {
    let fired = 0;
    const inst = render(h(Probe, { onFire: () => { fired++; }, active: true }));
    await wait();
    inst.stdin.write(CTRL_O);
    await wait();
    expect(fired).toBe(1);
    inst.unmount();
  });

  it("does not fire when isActive is false", async () => {
    let fired = 0;
    const inst = render(h(Probe, { onFire: () => { fired++; }, active: false }));
    await wait();
    inst.stdin.write(CTRL_O);
    await wait();
    expect(fired).toBe(0);
    inst.unmount();
  });

  it("resolveChords returns the registry default for an action", () => {
    const chords = resolveChords("transcript.toggleExpand");
    expect(chords).toHaveLength(1);
    expect(chords[0]).toMatchObject({ ctrl: true, char: "o" });
  });
});
