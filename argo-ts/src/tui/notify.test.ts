import { describe, it, expect, vi } from "vitest";
import { shouldNotify, notify } from "./notify.js";

describe("notify", () => {
  it("only pings for turns past the threshold", () => {
    expect(shouldNotify(500)).toBe(false);
    expect(shouldNotify(15_000)).toBe(true);
    expect(shouldNotify(500, 100)).toBe(true);
  });

  it("rings the terminal bell via the injected writer", () => {
    const write = vi.fn();
    notify({ title: "Argo", message: "done", env: {} as NodeJS.ProcessEnv, write });
    expect(write).toHaveBeenCalledWith("\x07");
  });

  it("can suppress the bell", () => {
    const write = vi.fn();
    notify({ title: "Argo", message: "done", bell: false, env: {} as NodeJS.ProcessEnv, write });
    expect(write).not.toHaveBeenCalled();
  });
});
