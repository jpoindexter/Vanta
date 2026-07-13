import { describe, expect, it } from "vitest";
import { rootScopedKernelPort } from "./kernel-launcher.js";

describe("rootScopedKernelPort", () => {
  it("is stable for one project and separates distinct projects from the default endpoint", () => {
    const first = rootScopedKernelPort("/tmp/vanta-project-one");
    expect(first).toBe(rootScopedKernelPort("/tmp/vanta-project-one"));
    expect(first).not.toBe(7788);
    expect(first).toBeGreaterThanOrEqual(17_000);
    expect(first).toBeLessThan(21_000);
    expect(rootScopedKernelPort("/tmp/vanta-project-two")).not.toBe(first);
  });
});
