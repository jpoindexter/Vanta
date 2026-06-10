import { describe, it, expect } from "vitest";
import { scanForSecrets, hasSecrets, formatRedactionNotice } from "./secret-scan.js";

// Fake tokens are assembled from fragments so no contiguous secret-shaped
// literal exists in this source file — that keeps the gitleaks pre-commit hook
// (gitleaks protect --staged) from rejecting the commit. The shapes still match
// the scanner's patterns at runtime.
const ghpPat = "ghp_" + "a".repeat(36);
const fineGrainedPat = "github_pat_" + "b".repeat(24);
const awsKeyId = "AKIA" + "A".repeat(16);
const slackToken = "xoxb-" + "1234567890ABCDEF";
const googleApiKey = "AIza" + "C".repeat(35);
const privateKeyHeader = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
const rsaPrivateKeyHeader = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");
const openaiKey = "sk-" + "d".repeat(32);

describe("scanForSecrets", () => {
  it("detects a github personal access token", () => {
    expect(scanForSecrets(`token=${ghpPat}`)).toContain("github-pat");
  });

  it("detects a github fine-grained pat", () => {
    expect(scanForSecrets(fineGrainedPat)).toContain("github-fine-grained-pat");
  });

  it("detects an aws access key id", () => {
    expect(scanForSecrets(`aws ${awsKeyId} key`)).toContain("aws-access-key-id");
  });

  it("detects a slack token", () => {
    expect(scanForSecrets(slackToken)).toContain("slack-token");
  });

  it("detects a google api key", () => {
    expect(scanForSecrets(googleApiKey)).toContain("google-api-key");
  });

  it("detects a generic private key header", () => {
    expect(scanForSecrets(`${privateKeyHeader}\nMIIB...`)).toContain("private-key");
  });

  it("detects an rsa private key header", () => {
    expect(scanForSecrets(rsaPrivateKeyHeader)).toContain("private-key");
  });

  it("detects an openai-style key", () => {
    expect(scanForSecrets(openaiKey)).toContain("openai-key");
  });

  it("returns [] for normal prose", () => {
    expect(scanForSecrets("The user prefers single quotes and dark mode.")).toEqual([]);
  });

  it("returns [] for code without secrets", () => {
    const code = "const sum = (a, b) => a + b; export default sum;";
    expect(scanForSecrets(code)).toEqual([]);
  });

  it("does not false-positive on a 40-hex git sha", () => {
    const sha = "9f2c1ab3de4567890abcdef1234567890abcdef12";
    expect(scanForSecrets(`commit ${sha}`)).toEqual([]);
  });

  it("does not false-positive on a uuid", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(scanForSecrets(`id ${uuid}`)).toEqual([]);
  });

  it("dedups when the same rule matches twice", () => {
    const result = scanForSecrets(`${ghpPat} and again ${ghpPat}`);
    expect(result).toEqual(["github-pat"]);
  });

  it("collects multiple distinct rule ids", () => {
    const result = scanForSecrets(`${ghpPat}\n${awsKeyId}`);
    expect(result).toContain("github-pat");
    expect(result).toContain("aws-access-key-id");
    expect(result).toHaveLength(2);
  });
});

describe("hasSecrets", () => {
  it("is true when a secret is present", () => {
    expect(hasSecrets(`key ${awsKeyId}`)).toBe(true);
  });

  it("is false for clean text", () => {
    expect(hasSecrets("nothing sensitive here")).toBe(false);
  });
});

describe("formatRedactionNotice", () => {
  it("names the rule ids without echoing any value", () => {
    const notice = formatRedactionNotice(["github-pat", "aws-access-key-id"]);
    expect(notice).toContain("github-pat");
    expect(notice).toContain("aws-access-key-id");
    expect(notice).toContain("not persisted");
  });
});
