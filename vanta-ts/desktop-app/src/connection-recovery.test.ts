import { describe, expect, it } from "vitest";
import { connectionRecovery } from "./connection-recovery.js";

describe("connectionRecovery", () => {
  it("opens provider setup only for provider failures", () => {
    expect(connectionRecovery("No provider API key configured")).toBe("provider");
    expect(connectionRecovery("Provider model is unavailable")).toBe("provider");
  });

  it("keeps file and catalog failures in local recovery", () => {
    expect(connectionRecovery("Project file permission denied")).toBe("project");
    expect(connectionRecovery("Could not parse model catalog JSON")).toBe("project");
    expect(connectionRecovery("Gateway did not answer")).toBe("service");
  });
});
