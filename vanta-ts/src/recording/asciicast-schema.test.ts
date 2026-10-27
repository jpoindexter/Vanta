import { expect, it } from "vitest";
import { AsciicastRecorder } from "./asciicast.js";

it("validates the injected clock return rather than trusting the function type", () => {
  const rec = new AsciicastRecorder({ now: () => "invalid" as unknown as number });
  expect(() => rec.start({ write: () => ({ ok: true }) })).toThrow();
});
