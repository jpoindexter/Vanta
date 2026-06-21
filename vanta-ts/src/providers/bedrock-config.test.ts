import { describe, it, expect } from "vitest";
import {
  BEDROCK_MODEL_MAP,
  DEFAULT_BEDROCK_MODEL_ID,
  resolveBedrockModelId,
  BedrockConfigSchema,
  resolveBedrockConfig,
  BEDROCK_CATALOG_ENTRY,
} from "./bedrock-config.js";

describe("resolveBedrockModelId", () => {
  it("maps a friendly name to its Bedrock model id", () => {
    expect(resolveBedrockModelId("claude-sonnet")).toBe(
      "anthropic.claude-3-5-sonnet-20241022-v2:0",
    );
    expect(resolveBedrockModelId("claude-haiku")).toBe(
      "anthropic.claude-3-5-haiku-20241022-v1:0",
    );
    expect(resolveBedrockModelId("llama-3")).toBe("meta.llama3-1-70b-instruct-v1:0");
  });

  it("passes an already-Bedrock id (contains a dot) through unchanged", () => {
    const id = "anthropic.claude-3-opus-20240229-v1:0";
    expect(resolveBedrockModelId(id)).toBe(id);
    expect(resolveBedrockModelId("meta.llama3-1-8b-instruct-v1:0")).toBe(
      "meta.llama3-1-8b-instruct-v1:0",
    );
  });

  it("falls back to the default id for an unknown name with no dot", () => {
    expect(resolveBedrockModelId("totally-unknown")).toBe(DEFAULT_BEDROCK_MODEL_ID);
    expect(resolveBedrockModelId("")).toBe(DEFAULT_BEDROCK_MODEL_ID);
  });

  it("uses a real Bedrock <provider>.<model>:<version> id format", () => {
    for (const id of Object.values(BEDROCK_MODEL_MAP)) {
      expect(id).toMatch(/^[a-z0-9]+\.[a-z0-9.-]+:[0-9]+$/);
    }
  });
});

describe("resolveBedrockConfig", () => {
  const fullEnv = (): NodeJS.ProcessEnv => ({
    AWS_REGION: "us-east-1",
    VANTA_BEDROCK_MODEL: "claude-sonnet",
    AWS_ACCESS_KEY_ID: "present",
    AWS_SECRET_ACCESS_KEY: "present",
  });

  it("returns ok with region + resolved model id when all present", () => {
    const res = resolveBedrockConfig(fullEnv());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.region).toBe("us-east-1");
      expect(res.config.modelId).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0");
    }
  });

  it("accepts VANTA_BEDROCK_REGION as the region source", () => {
    const env = fullEnv();
    delete env.AWS_REGION;
    env.VANTA_BEDROCK_REGION = "eu-west-1";
    const res = resolveBedrockConfig(env);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.config.region).toBe("eu-west-1");
  });

  it("reports missing region when neither region var is set", () => {
    const env = fullEnv();
    delete env.AWS_REGION;
    const res = resolveBedrockConfig(env);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["region"]);
  });

  it("reports missing model when VANTA_BEDROCK_MODEL is unset", () => {
    const env = fullEnv();
    delete env.VANTA_BEDROCK_MODEL;
    const res = resolveBedrockConfig(env);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["model"]);
  });

  it("reports missing credentials when no keys and no profile", () => {
    const env = fullEnv();
    delete env.AWS_ACCESS_KEY_ID;
    delete env.AWS_SECRET_ACCESS_KEY;
    const res = resolveBedrockConfig(env);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["credentials"]);
  });

  it("treats a key id without a secret as missing credentials", () => {
    const env = fullEnv();
    delete env.AWS_SECRET_ACCESS_KEY;
    const res = resolveBedrockConfig(env);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["credentials"]);
  });

  it("AWS_PROFILE alone satisfies credential presence", () => {
    const env: NodeJS.ProcessEnv = {
      AWS_REGION: "us-east-1",
      VANTA_BEDROCK_MODEL: "claude-haiku",
      AWS_PROFILE: "default",
    };
    const res = resolveBedrockConfig(env);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.config.modelId).toBe("anthropic.claude-3-5-haiku-20241022-v1:0");
  });

  it("reports every missing piece on an empty env (no crash)", () => {
    const res = resolveBedrockConfig({});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missing).toContain("region");
      expect(res.missing).toContain("model");
      expect(res.missing).toContain("credentials");
    }
  });

  it("reports presence only — never the credential value", () => {
    const env = fullEnv();
    const res = resolveBedrockConfig(env);
    expect(JSON.stringify(res)).not.toContain("present");
  });
});

describe("BedrockConfigSchema", () => {
  it("validates a region + modelId object", () => {
    const parsed = BedrockConfigSchema.parse({
      region: "us-east-1",
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    });
    expect(parsed.region).toBe("us-east-1");
  });

  it("rejects empty region or modelId", () => {
    expect(BedrockConfigSchema.safeParse({ region: "", modelId: "x" }).success).toBe(false);
    expect(BedrockConfigSchema.safeParse({ region: "x", modelId: "" }).success).toBe(false);
  });
});

describe("BEDROCK_CATALOG_ENTRY", () => {
  it("matches the PROVIDER_CATALOG ProviderEntry shape", () => {
    expect(BEDROCK_CATALOG_ENTRY.id).toBe("bedrock");
    expect(BEDROCK_CATALOG_ENTRY.label).toBe("AWS Bedrock (Claude, Llama, Titan via AWS)");
    expect(BEDROCK_CATALOG_ENTRY.envVar).toBe("AWS_ACCESS_KEY_ID");
    expect(BEDROCK_CATALOG_ENTRY.signupUrl).toBe("https://console.aws.amazon.com/bedrock");
    expect(typeof BEDROCK_CATALOG_ENTRY.short).toBe("string");
    expect(Array.isArray(BEDROCK_CATALOG_ENTRY.models)).toBe(true);
  });

  it("uses a defaultModel the map can resolve to a real Bedrock id", () => {
    const id = resolveBedrockModelId(BEDROCK_CATALOG_ENTRY.defaultModel);
    expect(id).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0");
    expect(id).toContain(".");
  });
});
