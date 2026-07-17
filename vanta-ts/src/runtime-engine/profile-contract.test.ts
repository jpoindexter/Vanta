import { describe, expect, it } from "vitest";
import {
  createRuntimeProfile,
  migrateRuntimeProfile,
  runtimeProfileLaunchContract,
  validateRuntimeProfile,
} from "./profile-contract.js";

const gib = 1024 ** 3;
const host = { platform: "darwin", architecture: "arm64", memoryBytes: 24 * gib };

describe("runtime profile contract", () => {
  it("builds a lifecycle command with safe defaults and live resource fit", () => {
    const profile = createRuntimeProfile({ id: "qwen-local", name: "Qwen local", backend: "llama_cpp", modelPath: "/models/qwen.gguf", modelBytes: 8 * gib, availableMemoryBytes: 24 * gib });
    const contract = runtimeProfileLaunchContract(profile, host);

    expect(contract.validation).toMatchObject({ valid: true, compatible: true });
    expect(contract.preview).toMatchObject({ command: "llama-server", args: expect.arrayContaining(["--model", "/models/qwen.gguf", "--ctx-size", "8192"]), resource: { fits: true } });
    expect(contract.roundTrip).toBe(true);
  });

  it("requires explicit review for unknown flags and blocks unsafe network flags", () => {
    const base = createRuntimeProfile({ id: "custom", name: "Custom", backend: "llama_cpp", modelPath: "/models/custom.gguf", modelBytes: gib, availableMemoryBytes: 8 * gib });
    const review = validateRuntimeProfile({ ...base, extraArgs: [{ flag: "--custom-kernel", value: "1", reviewed: false }] }, host);
    const accepted = validateRuntimeProfile({ ...base, extraArgs: [{ flag: "--custom-kernel", value: "1", reviewed: true }] }, host);
    const blocked = validateRuntimeProfile({ ...base, extraArgs: [{ flag: "--disable-auth", reviewed: true }] }, host);

    expect(review).toMatchObject({ valid: false, issues: expect.arrayContaining([expect.objectContaining({ code: "flag_review_required", severity: "review" })]) });
    expect(accepted.valid).toBe(true);
    expect(blocked).toMatchObject({ valid: false, issues: expect.arrayContaining([expect.objectContaining({ code: "unsafe_flag", severity: "error" })]) });
  });

  it("keeps sensitive environment values as references instead of embedded secrets", () => {
    const base = createRuntimeProfile({ id: "secret-env", name: "Secret env", backend: "llama_cpp", modelPath: "/models/model.gguf", modelBytes: gib, availableMemoryBytes: 8 * gib });
    const referenced = validateRuntimeProfile({ ...base, environment: [{ name: "MODEL_TOKEN", secretRef: "secret://runtime/model-token" }] }, host);
    const embedded = validateRuntimeProfile({ ...base, environment: [{ name: "MODEL_TOKEN", value: "plain-text-token" }] }, host);

    expect(referenced.valid).toBe(true);
    expect(embedded).toMatchObject({ valid: false, issues: expect.arrayContaining([expect.objectContaining({ code: "embedded_secret", severity: "error" })]) });
  });

  it("migrates a flat v1 profile and reports incompatible hosts with recovery copy", () => {
    const migrated = migrateRuntimeProfile({
      version: 1, id: "legacy", name: "Legacy", backend: "mlx", model: "/models/legacy", modelBytes: gib,
      host: "127.0.0.1", port: 8129, contextTokens: 4096, availableMemoryBytes: 8 * gib,
    }, () => new Date("2026-07-17T12:00:00.000Z"));
    const result = validateRuntimeProfile(migrated, { platform: "linux", architecture: "x64", memoryBytes: 8 * gib });

    expect(migrated).toMatchObject({ version: 2, model: { path: "/models/legacy" }, resources: { contextTokens: 4096 } });
    expect(result).toMatchObject({ valid: false, compatible: false, issues: expect.arrayContaining([expect.objectContaining({ code: "host_incompatible", recovery: expect.stringContaining("Clone this profile") })]) });
  });
});
